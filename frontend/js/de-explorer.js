// js/de-explorer.js
history.scrollRestoration = 'manual'
window.scrollTo(0, 0)

let allData           = []
let filteredData      = []
let searchQuery       = ''
let currentPage       = 1
const PAGE_SIZE       = 15
let sortCol           = null
let sortState         = null
let dirFilter         = 'all'
let lfcThreshold      = 0.5
let padjThreshold     = 0.05
let currentDatasetId      = null
let currentConditionNum   = null
let currentConditionDenom = null
let lfcMode           = 'shrunk'   // 'shrunk' (apeglm) or 'raw' (MLE) — controls which log2FC is shown
let lastDatasets       = []        // cached dataset list, needed to re-render combined volcano on toggle

// normalizes each row so d.log2_fc always reflects the currently active mode,
// while keeping the original shrunk value around so toggling back doesn't need a refetch
function normalizeLfc(rows) {
  return rows.map(d => {
    const shrunk = d.log2_fc_shrunk !== undefined ? d.log2_fc_shrunk : d.log2_fc
    return {
      ...d,
      log2_fc_shrunk: shrunk,
      log2_fc: lfcMode === 'raw' ? d.log2_fc_raw : shrunk
    }
  })
}

// ── init ──────────────────────────────────────────────────────
async function init() {
  await populateDatasetDropdown()

  const params    = new URLSearchParams(window.location.search)
  const preselect = params.get('dataset')
  if (preselect) {
    const sel = document.getElementById('dataset-select')
    if ([...sel.options].some(o => o.value === preselect)) sel.value = preselect
  }

  await onDatasetChange()

  document.getElementById('dataset-select')
    .addEventListener('change', onDatasetChange)
  document.getElementById('comparison-select')
    .addEventListener('change', onComparisonChange)

  document.querySelectorAll('#dir-filter-toggle .filter-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('#dir-filter-toggle .filter-option')
        .forEach(o => o.classList.remove('active'))
      opt.classList.add('active')
      dirFilter = opt.dataset.value
      applyFilter()
      updateVolcanoOpacity()
      updateFilterTags()
    })
  })

  document.getElementById('lfc-slider').addEventListener('input', e => {
    lfcThreshold = parseFloat(e.target.value)
    document.getElementById('lfc-value').textContent = lfcThreshold.toFixed(2)
    applyFilter()
    updateVolcanoThresholdLines()
    updateFilterTags()
  })

  document.querySelectorAll('.padj-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.padj-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      padjThreshold = parseFloat(btn.dataset.value)
      applyFilter()
      updateVolcanoThresholdLines()
      updateFilterTags()
    })
  })

  document.getElementById('gene-search').addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase()
    currentPage = 1
    renderTable()
    if (e.target.value.length > 0) {
      document.querySelector('.table-container')
        .scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  })

  document.querySelectorAll('#lfc-mode-toggle .filter-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('#lfc-mode-toggle .filter-option')
        .forEach(o => o.classList.remove('active'))
      opt.classList.add('active')
      lfcMode = opt.dataset.value
      updateLfcLabels()
      allData = normalizeLfc(allData)
      applyFilter()
      if (currentDatasetId === 'combined') {
        renderCombinedVolcano(allData, lastDatasets)
      } else {
        renderVolcano()
      }
      updateFilterTags()
    })
  })

  document.querySelectorAll('thead th[data-table="de"]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col
      if (sortCol !== col) { sortCol = col; sortState = 'desc' }
      else if (sortState === 'desc') sortState = 'asc'
      else { sortCol = null; sortState = null }
      updateSortHeaders()
      renderTable()
    })
  })

  updateLfcLabels()
}

// ── update headers/labels to reflect active LFC mode ────────────
function updateLfcLabels() {
  const suffix = lfcMode === 'raw' ? ' (raw, MLE)' : ' (shrunk, apeglm)'
  const th = document.getElementById('th-log2fc')
  if (th) th.textContent = 'log2FC' + suffix
  const infoLabel = document.getElementById('gene-info-lfc-label')
  if (infoLabel) infoLabel.textContent = 'log2FC' + suffix
}

// ── populate dataset dropdown ─────────────────────────────────
async function populateDatasetDropdown() {
  try {
    const datasets = await getDatasets()
    const sel = document.getElementById('dataset-select')
    sel.innerHTML =
      `<option value="combined">Combined — all datasets</option>` +
      datasets.map(d =>
        `<option value="${d.dataset_id}">${d.dataset_id} — ${(d.disease_model||'').replace(/\u2014/g,'-')}</option>`
      ).join('')
  } catch (err) { console.error('Failed to load datasets:', err) }
}

// ── dataset changes ───────────────────────────────────────────
async function onDatasetChange() {
  currentDatasetId = document.getElementById('dataset-select').value
  if (!currentDatasetId) return

  const sel = document.getElementById('comparison-select')

  if (currentDatasetId === 'combined') {
    // combined mode — hide comparison dropdown, load all data
    sel.innerHTML = '<option value="all">All comparisons</option>'
    sel.disabled  = true
    currentConditionNum   = 'all'
    currentConditionDenom = ''
    document.getElementById('stat-comparison').textContent = 'All datasets combined'
    // load all DE results across all datasets
    try {
      document.getElementById('de-tbody').innerHTML =
        '<tr><td colspan="7" style="text-align:center;padding:24px;color:#64748b;">loading all datasets...</td></tr>'
      document.getElementById('volcano-plot').innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:480px;color:#64748b;font-size:13px;">loading...</div>'
      const datasets = await getDatasets()
      lastDatasets   = datasets
      let combined   = []
      for (const ds of datasets) {
        const comparisons = await getComparisons(ds.dataset_id)
        for (const comp of comparisons) {
          const res = await getDEResults(ds.dataset_id, comp.condition_num, false)
          combined  = combined.concat(res)
        }
      }
      combined = normalizeLfc(combined)
      allData  = combined
      // update stat cards
      const sig  = combined.filter(d => d.padj !== null && d.padj <= padjThreshold)
      const up   = sig.filter(d => d.direction === 'upregulated').length
      const down = sig.filter(d => d.direction === 'downregulated').length
      document.getElementById('stat-total').textContent = sig.length
      document.getElementById('stat-up').textContent    = `↑ ${up}`
      document.getElementById('stat-down').textContent  = `↓ ${down}`
      applyFilter()
      renderCombinedVolcano(combined, datasets)
    } catch (err) { console.error('Failed to load combined data:', err) }
    resetExpression()
    return
  }

  sel.disabled = false
  try {
    const comparisons = await getComparisons(currentDatasetId)
    sel.innerHTML = comparisons.map(c =>
      `<option value="${c.condition_num}">${c.condition_num} vs ${c.condition_denom}</option>`
    ).join('')
    await onComparisonChange()
  } catch (err) { console.error('Failed to load comparisons:', err) }
}

// ── comparison changes ────────────────────────────────────────
async function onComparisonChange() {
  currentConditionNum = document.getElementById('comparison-select').value
  if (!currentDatasetId || !currentConditionNum) return

  try {
    const summary = await getDESummary(currentDatasetId, currentConditionNum)
    document.getElementById('stat-total').textContent      = summary.total || 0
    document.getElementById('stat-up').textContent         = `↑ ${summary.upregulated || 0}`
    document.getElementById('stat-down').textContent       = `↓ ${summary.downregulated || 0}`
    currentConditionDenom = summary.condition_denom || ''
    document.getElementById('stat-comparison').textContent =
      `${currentConditionNum} vs ${currentConditionDenom}`
  } catch (err) { console.error('Failed to load summary:', err) }

  try {
    allData = normalizeLfc(await getDEResults(currentDatasetId, currentConditionNum, false))
    applyFilter()
    renderVolcano()
    updateFilterTags()
  } catch (err) { console.error('Failed to load DE results:', err) }

  document.getElementById('gene-search').value = ''
  searchQuery = ''
  resetExpression()
}

// ── reset all filters ─────────────────────────────────────────
function resetFilters() {
  dirFilter     = 'all'
  lfcThreshold  = 0
  padjThreshold = 0.05
  searchQuery   = ''
  sortCol       = null
  sortState     = null

  document.querySelectorAll('#dir-filter-toggle .filter-option').forEach(o => o.classList.remove('active'))
  document.querySelector('#dir-filter-toggle .filter-option[data-value="all"]').classList.add('active')

  document.getElementById('lfc-slider').value           = '0.5'
  document.getElementById('lfc-value').textContent      = '0.50'

  document.querySelectorAll('.padj-btn').forEach(b => b.classList.remove('active'))
  document.querySelector('.padj-btn[data-value="0.05"]').classList.add('active')

  document.getElementById('gene-search').value = ''

  updateSortHeaders()
  applyFilter()
  updateVolcanoOpacity()
  updateVolcanoThresholdLines()
  updateFilterTags()
}

// ── apply filters ─────────────────────────────────────────────
function applyFilter() {
  let data = allData.filter(d => {
    const passPadj = d.padj !== null && d.padj <= padjThreshold
    const passLfc  = lfcThreshold === 0 || Math.abs(d.log2_fc) >= lfcThreshold
    if (!passPadj || !passLfc) return false
    if (dirFilter === 'all') return true
    return d.direction === dirFilter
  })
  filteredData = data
  currentPage  = 1
  renderTable()
}

// ── filter tags ───────────────────────────────────────────────
function updateFilterTags() {
  const container = document.getElementById('active-filters')
  const tags = []
  if (lfcThreshold > 0) tags.push(`|log2FC| ≥ ${lfcThreshold.toFixed(2)}`)
  if (padjThreshold !== 0.05) tags.push(`padj ≤ ${padjThreshold}`)
  if (dirFilter !== 'all') tags.push(dirFilter)
  container.innerHTML = tags.map(t =>
    `<span class="filter-tag">${t}</span>`
  ).join('')
}

// ── volcano opacity ───────────────────────────────────────────
function updateVolcanoOpacity() {
  const plot = document.getElementById('volcano-plot')
  if (!plot || !plot.data || plot.data.length === 0) return
  const opacities = {
    all:           { not_significant: 0.25, downregulated: 0.85, upregulated: 0.85 },
    upregulated:   { not_significant: 0.06, downregulated: 0.06, upregulated: 0.9  },
    downregulated: { not_significant: 0.06, downregulated: 0.9,  upregulated: 0.06 }
  }
  const ops      = opacities[dirFilter] || opacities.all
  const dirOrder = ['not_significant', 'downregulated', 'upregulated']
  Plotly.restyle(plot, { 'marker.opacity': dirOrder.map(d => ops[d]) })
}

// ── volcano threshold lines ───────────────────────────────────
function updateVolcanoThresholdLines() {
  const plot = document.getElementById('volcano-plot')
  if (!plot || !plot.layout) return
  const shapes = []
  if (lfcThreshold > 0) {
    shapes.push(
      { type:'line', x0: lfcThreshold, x1: lfcThreshold, y0:0, y1:1, yref:'paper',
        line:{ dash:'dash', color:'#94a3b8', width:1 }},
      { type:'line', x0:-lfcThreshold, x1:-lfcThreshold, y0:0, y1:1, yref:'paper',
        line:{ dash:'dash', color:'#94a3b8', width:1 }}
    )
  }
  shapes.push({ type:'line', x0:0, x1:1, xref:'paper',
    y0:-Math.log10(padjThreshold), y1:-Math.log10(padjThreshold),
    line:{ dash:'dash', color:'#94a3b8', width:1 }})
  Plotly.relayout(plot, { shapes })
}

// ── render volcano ────────────────────────────────────────────
function renderVolcano() {
  const container = document.getElementById('volcano-plot')
  const classify  = d => {
    const passPadj = d.padj !== null && d.padj <= padjThreshold
    const passLfc  = lfcThreshold === 0 || Math.abs(d.log2_fc) >= lfcThreshold
    if (!passPadj || !passLfc) return 'not_significant'
    return d.direction
  }
  const colorMap = {
    upregulated:     '#c0392b',
    downregulated:   '#2471a3',
    not_significant: '#cbd5e1'
  }
  const traces = ['not_significant','downregulated','upregulated'].map(dir => {
    const subset = allData.filter(d => classify(d) === dir)
    return {
      x: subset.map(d => d.log2_fc),
      y: subset.map(d => -Math.log10(Math.max(d.padj, 1e-300))),
      mode:'markers', type:'scatter',
      name: dir === 'not_significant' ? 'not significant' : dir,
      marker:{ color:colorMap[dir], size: dir==='not_significant'?4:6,
               opacity: dir==='not_significant'?0.25:0.85 },
      text: subset.map(d => d.gene_symbol),
      customdata: subset.map(d => ({
        gene_id:d.gene_id, gene_symbol:d.gene_symbol, gene_name:d.gene_name,
        log2_fc:d.log2_fc, padj:d.padj, direction:classify(d)
      })),
      hovertemplate:'<b>%{text}</b><br>log2FC: %{x:.3f}<br>-log10(padj): %{y:.2f}<extra></extra>'
    }
  })

  const shapes = []
  if (lfcThreshold > 0) {
    shapes.push(
      { type:'line', x0: lfcThreshold, x1: lfcThreshold, y0:0, y1:1, yref:'paper',
        line:{ dash:'dash', color:'#94a3b8', width:1 }},
      { type:'line', x0:-lfcThreshold, x1:-lfcThreshold, y0:0, y1:1, yref:'paper',
        line:{ dash:'dash', color:'#94a3b8', width:1 }}
    )
  }
  shapes.push({ type:'line', x0:0, x1:1, xref:'paper',
    y0:-Math.log10(padjThreshold), y1:-Math.log10(padjThreshold),
    line:{ dash:'dash', color:'#94a3b8', width:1 }})

  Plotly.newPlot(container, traces, {
    xaxis:{ title: lfcMode==='raw' ? 'log2 fold change (raw, MLE)' : 'log2 fold change (shrunk, apeglm)', zeroline:false, gridcolor:'#f1f5f9' },
    yaxis:{ title:'-log10(adjusted p-value)', gridcolor:'#f1f5f9' },
    plot_bgcolor:'#ffffff', paper_bgcolor:'#ffffff',
    margin:{ l:55, r:20, t:20, b:55 },
    legend:{ orientation:'h', y:1.06, x:0, font:{ size:12 } },
    font:{ family:'Inter, sans-serif', size:12 }, shapes
  }, { responsive:true, displayModeBar:true,
       modeBarButtonsToRemove:['select2d','lasso2d','autoScale2d'] })

  container.on('plotly_click', async data => {
    const pt = data.points[0]
    if (!pt.customdata) return
    showGeneInfo(pt.customdata)
    await loadExpression(pt.customdata.gene_id, pt.customdata.gene_symbol, currentDatasetId)
  })
}

// ── gene info ─────────────────────────────────────────────────
function showGeneInfo(gd) {
  document.getElementById('gene-info-card').classList.add('visible')
  document.getElementById('gene-info-symbol').textContent = gd.gene_symbol || '—'
  document.getElementById('gene-info-name').textContent   = gd.gene_name   || '—'
  document.getElementById('gene-info-id').textContent     = gd.gene_id     || '—'
  const lfc = parseFloat(gd.log2_fc)
  const lfcEl = document.getElementById('gene-info-lfc')
  lfcEl.textContent = lfc.toFixed(3)
  lfcEl.className   = `value ${lfc > 0 ? 'up' : 'down'}`
  document.getElementById('gene-info-padj').textContent =
    parseFloat(gd.padj).toExponential(2)
  const dirEl = document.getElementById('gene-info-dir')
  dirEl.textContent = gd.direction || '—'
  dirEl.className   = `value ${gd.direction === 'upregulated' ? 'up' : 'down'}`
}

function resetExpression() {
  document.getElementById('gene-info-card').classList.remove('visible')
  document.getElementById('expression-placeholder').style.display = 'flex'
  document.getElementById('expression-plot').style.display        = 'none'
  document.getElementById('volcano-plot')
    .scrollIntoView({ behavior:'smooth', block:'start' })
}

// ── expression chart ──────────────────────────────────────────
async function loadExpression(geneId, geneSymbol, datasetId) {
  document.getElementById('expression-placeholder').style.display = 'none'
  const plotDiv = document.getElementById('expression-plot')
  plotDiv.style.display = 'block'
  plotDiv.innerHTML =
    '<div class="loading" style="height:380px;"><div class="spinner"></div> loading...</div>'
  try {
    const data = await getExpression(geneId, datasetId)
    if (!data || data.length === 0) {
      plotDiv.innerHTML = `
        <div class="expr-placeholder" style="opacity:1;">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
               stroke="#94a3b8" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4m0 4h.01"/>
          </svg>
          <div style="text-align:center;max-width:300px;">
            <div style="font-weight:600;color:#475569;margin-bottom:4px;">
              No expression data for ${geneSymbol}
            </div>
            <div style="font-size:12px;color:#94a3b8;line-height:1.5;">
              TPM expression data is not yet available for real genes.
              This will populate once the R pipeline outputs TPM files.
            </div>
          </div>
        </div>`
      return
    }
    plotDiv.innerHTML = ''
    const conditions = [...new Set(data.map(d => d.condition))].sort()
    const palette    = ['#3498db','#e74c3c','#2ecc71','#9b59b6','#f39c12','#1abc9c']
    const colorMap   = Object.fromEntries(conditions.map((c,i) => [c, palette[i%palette.length]]))
    const trace = {
      x:data.map(d=>d.sample_id), y:data.map(d=>d.tpm),
      type:'bar', name:'expression', showlegend:false,
      marker:{ color:data.map(d=>colorMap[d.condition]) },
      hovertemplate:'<b>%{x}</b><br>TPM: %{y:.2f}<extra></extra>'
    }
    const legendTraces = conditions.map(c => ({
      x:[null], y:[null], type:'bar', name:c,
      marker:{ color:colorMap[c] }, showlegend:true
    }))
    Plotly.newPlot(plotDiv, [trace, ...legendTraces], {
      xaxis:{ title:'sample', tickangle:-45, tickfont:{ size:10 }, gridcolor:'#f1f5f9' },
      yaxis:{ title:'TPM', gridcolor:'#f1f5f9' },
      plot_bgcolor:'#ffffff', paper_bgcolor:'#ffffff',
      margin:{ l:55, r:20, t:20, b:120 },
      font:{ family:'Inter, sans-serif', size:11 },
      legend:{ orientation:'h', y:1.08, x:0, font:{ size:11 } },
      bargap:0.15
    }, { responsive:true, displayModeBar:false })
    document.getElementById('expression-wrap')
      .scrollIntoView({ behavior:'smooth', block:'start' })
  } catch (err) {
    plotDiv.innerHTML = `<div class="expr-placeholder">error: ${err.message}</div>`
  }
}

// ── sort helpers ──────────────────────────────────────────────
function updateSortHeaders() {
  document.querySelectorAll('thead th[data-table="de"]').forEach(th => {
    th.classList.remove('sort-desc','sort-asc')
    if (th.dataset.col === sortCol) {
      if (sortState === 'desc') th.classList.add('sort-desc')
      if (sortState === 'asc')  th.classList.add('sort-asc')
    }
  })
}

// ── render table ──────────────────────────────────────────────
function renderTable() {
  let data = [...filteredData]
  if (searchQuery) {
    data = data.filter(d =>
      (d.gene_symbol||'').toLowerCase().includes(searchQuery) ||
      (d.gene_name  ||'').toLowerCase().includes(searchQuery)
    )
  }
  if (sortCol && sortState) {
    data.sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol]
      if (va===null||va===undefined) va=''
      if (vb===null||vb===undefined) vb=''
      if (!isNaN(parseFloat(va)) && !isNaN(parseFloat(vb)))
        return sortState==='desc' ? parseFloat(vb)-parseFloat(va) : parseFloat(va)-parseFloat(vb)
      va=String(va); vb=String(vb)
      return sortState==='desc' ? vb.localeCompare(va) : va.localeCompare(vb)
    })
  }

  const total    = data.length
  const start    = (currentPage-1) * PAGE_SIZE
  const pageData = data.slice(start, start+PAGE_SIZE)
  const tbody    = document.getElementById('de-tbody')

  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:#64748b;">
      ${searchQuery ? `no genes matching "${searchQuery}"` : 'no results for current filters'}
    </td></tr>`
  } else {
    tbody.innerHTML = pageData.map(d => `
      <tr onclick="rowClick('${d.gene_id}',
        '${(d.gene_symbol||'').replace(/'/g,"\\'")}',
        '${(d.gene_name||'').replace(/'/g,"\\'")}',
        ${d.log2_fc},${d.padj},'${d.direction}')">
        <td class="gene-symbol">${d.gene_symbol||''}</td>
        <td class="gene-name">${d.gene_name||''}</td>
        <td style="font-size:11px;color:var(--color-muted);font-family:var(--font-mono);">${d.gene_id||''}</td>
        <td class="numeric">${parseFloat(d.log2_fc).toFixed(3)}</td>
        <td class="numeric">${parseFloat(d.padj).toExponential(2)}</td>
        <td class="${d.direction==='upregulated'?'up':'down'}">${d.direction}</td>
        <td class="numeric">${parseFloat(d.base_mean).toFixed(1)}</td>
      </tr>
    `).join('')
  }

  document.getElementById('page-info').textContent =
    total===0 ? '0 results' :
    `${Math.min(start+1,total)}–${Math.min(start+PAGE_SIZE,total)} of ${total}`
  document.getElementById('prev-btn').disabled = currentPage===1
  document.getElementById('next-btn').disabled = start+PAGE_SIZE>=total
}

function changePage(dir) { currentPage+=dir; renderTable() }

async function rowClick(geneId, geneSymbol, geneName, log2fc, padj, direction) {
  showGeneInfo({ gene_id:geneId, gene_symbol:geneSymbol, gene_name:geneName,
                 log2_fc:log2fc, padj:padj, direction:direction })
  await loadExpression(geneId, geneSymbol, currentDatasetId)
}

// ── CSV columns ───────────────────────────────────────────────
const DE_COLS = [
  { key:'gene_id',           label:'gene_id' },
  { key:'gene_symbol',       label:'gene_symbol' },
  { key:'gene_name',         label:'gene_name' },
  { key:'log2_fc_shrunk',    label:'log2FoldChange_shrunk_apeglm' },
  { key:'log2_fc_raw',       label:'log2FoldChange_raw_MLE' },
  { key:'padj',              label:'padj' },
  { key:'direction',         label:'direction' },
  { key:'base_mean',         label:'baseMean' },
  { key:'dataset_id',        label:'dataset_id' },
  { key:'condition_num',     label:'condition_num' },
  { key:'condition_denom',   label:'condition_denom' },
]

function filterSuffix() {
  const parts = []
  if (lfcMode === 'raw')      parts.push('raw')
  if (dirFilter !== 'all')    parts.push(dirFilter)
  if (lfcThreshold > 0)       parts.push(`lfc${lfcThreshold}`)
  if (padjThreshold !== 0.05) parts.push(`padj${padjThreshold}`)
  if (searchQuery)             parts.push(`q-${searchQuery}`)
  return parts.length ? '_' + parts.join('_') : ''
}

function applyFiltersToData(data) {
  return data.filter(d => {
    const passPadj = d.padj !== null && d.padj <= padjThreshold
    const passLfc  = lfcThreshold === 0 || Math.abs(d.log2_fc) >= lfcThreshold
    if (!passPadj || !passLfc) return false
    if (dirFilter !== 'all' && d.direction !== dirFilter) return false
    if (searchQuery) {
      const sym  = (d.gene_symbol||'').toLowerCase()
      const name = (d.gene_name  ||'').toLowerCase()
      if (!sym.includes(searchQuery) && !name.includes(searchQuery)) return false
    }
    return true
  })
}

// ── single export button ──────────────────────────────────────
// if "Combined" is selected in dataset dropdown → exports all datasets + all comparisons
// otherwise → exports current dataset + comparison
// all active sidebar filters (direction, LFC, padj, search) always applied
async function downloadDE() {
  const btn = document.getElementById('download-btn')
  btn.textContent = 'exporting...'
  btn.disabled    = true
  try {
    let data     = []
    let filename = ''

    if (currentDatasetId === 'combined') {
      // combined mode — fetch all datasets and all comparisons
      const datasets = await getDatasets()
      for (const ds of datasets) {
        const comparisons = await getComparisons(ds.dataset_id)
        for (const comp of comparisons) {
          const res = await getDEResults(ds.dataset_id, comp.condition_num, false)
          data      = data.concat(res)
        }
      }
      data     = normalizeLfc(data)
      filename = `DE_all_datasets_combined${filterSuffix()}`
    } else {
      // single dataset + comparison
      data     = normalizeLfc(await getDEResults(currentDatasetId, currentConditionNum, false))
      filename = `DE_${currentDatasetId}_${currentConditionNum}${filterSuffix()}`
    }

    const filtered = applyFiltersToData(data)
    if (filtered.length === 0) {
      alert('No results match the current filters. Try resetting filters first.')
      return
    }

    downloadCSV(toCSV(filtered, DE_COLS), filename)
  } catch (err) { alert(`Export failed: ${err.message}`) }
  finally { btn.textContent = '↓ Export CSV'; btn.disabled = false }
}

// ── combined volcano — color by dataset ──────────────────────
function renderCombinedVolcano(data, datasets) {
  const container = document.getElementById('volcano-plot')

  // one color per dataset
  const palette    = ['#3b82f6','#e74c3c','#2ecc71','#9b59b6','#f39c12']
  const datasetIds = datasets.map(d => d.dataset_id)
  const colorMap   = Object.fromEntries(
    datasetIds.map((id, i) => [id, palette[i % palette.length]])
  )

  // one trace per dataset — all genes plotted, colored by dataset
  const traces = datasetIds.map(dsId => {
    const subset = data.filter(d => d.dataset_id === dsId)
    // separate significant from NS for opacity
    return {
      x:    subset.map(d => d.log2_fc),
      y:    subset.map(d => -Math.log10(Math.max(d.padj, 1e-300))),
      mode: 'markers',
      type: 'scatter',
      name: dsId,
      marker: {
        color:   colorMap[dsId],
        size:    5,
        opacity: subset.map(d =>
          (d.padj <= padjThreshold && (lfcThreshold === 0 || Math.abs(d.log2_fc) >= lfcThreshold))
            ? 0.85 : 0.2
        ),
        line: { width: 0 }
      },
      text: subset.map(d => `${d.gene_symbol} (${dsId})`),
      customdata: subset.map(d => ({
        gene_id:     d.gene_id,
        gene_symbol: d.gene_symbol,
        gene_name:   d.gene_name,
        log2_fc:     d.log2_fc,
        padj:        d.padj,
        direction:   d.direction,
        dataset_id:  d.dataset_id
      })),
      hovertemplate:
        '<b>%{text}</b><br>' +
        'log2FC: %{x:.3f}<br>' +
        '-log10(padj): %{y:.2f}<br>' +
        '<extra></extra>'
    }
  })

  const shapes = []
  if (lfcThreshold > 0) {
    shapes.push(
      { type:'line', x0: lfcThreshold,  x1: lfcThreshold,  y0:0, y1:1, yref:'paper',
        line:{ dash:'dash', color:'#94a3b8', width:1 }},
      { type:'line', x0:-lfcThreshold, x1:-lfcThreshold, y0:0, y1:1, yref:'paper',
        line:{ dash:'dash', color:'#94a3b8', width:1 }}
    )
  }
  shapes.push({ type:'line', x0:0, x1:1, xref:'paper',
    y0:-Math.log10(padjThreshold), y1:-Math.log10(padjThreshold),
    line:{ dash:'dash', color:'#94a3b8', width:1 }})

  Plotly.newPlot(container, traces, {
    xaxis: { title: lfcMode==='raw' ? 'log2 fold change (raw, MLE)' : 'log2 fold change (shrunk, apeglm)', zeroline:false, gridcolor:'#f1f5f9' },
    yaxis: { title:'-log10(adjusted p-value)', gridcolor:'#f1f5f9' },
    plot_bgcolor:'#ffffff', paper_bgcolor:'#ffffff',
    margin:{ l:55, r:20, t:20, b:55 },
    legend:{ orientation:'h', y:1.06, x:0, font:{ size:12 },
             title:{ text:'Dataset', font:{ size:11 } } },
    font:{ family:'Inter, sans-serif', size:12 },
    shapes
  }, { responsive:true, displayModeBar:true,
       modeBarButtonsToRemove:['select2d','lasso2d','autoScale2d'] })

  container.on('plotly_click', async data => {
    const pt = data.points[0]
    if (!pt.customdata) return
    const gd = pt.customdata
    showGeneInfo(gd)
    // for combined view load expression without dataset filter — show all datasets
    await loadExpression(gd.gene_id, gd.gene_symbol, gd.dataset_id)
  })
}


init()
