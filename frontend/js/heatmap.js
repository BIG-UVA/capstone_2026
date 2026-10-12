// js/heatmap.js — Gene Explorer (Log2FC Heatmap + TPM Heatmap + Boxplot)
history.scrollRestoration = 'manual'
window.scrollTo(0, 0)

let selectedGenes = new Map()  // gene_id → { gene_id, gene_symbol, gene_name }
let searchTimeout = null
let activeTab     = 'lfc'
let lfcData       = []   // for export
let tpmData       = []   // for export

const TAB_LIMITS = { lfc: 100, tpm: 50, box: 20 }

const DATASETS = [
  { id:'GSE212277', label:"GSE212277 — 5xFAD vs WT",          condNum:'5xFAD',    condDenom:'WT (Control)' },
  { id:'GSE203655', label:"GSE203655 — STAT1-KO vs Control",   condNum:'STAT1-KO', condDenom:'Control' },
  { id:'GSE146680', label:"GSE146680 — Microglia vs Macrophage", condNum:'Microglia', condDenom:'Macrophage' },
]

// ── init ──────────────────────────────────────────────────────
function init() {
  document.getElementById('gene-search').addEventListener('input', e => {
    clearTimeout(searchTimeout)
    const q = e.target.value.trim()
    if (q.length < 2) {
      document.getElementById('gene-search-results').innerHTML =
        '<div class="no-results">Type at least 2 characters</div>'
      return
    }
    searchTimeout = setTimeout(() => searchGenes(q), 300)
  })

  document.querySelectorAll('#box-scale-toggle .scale-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#box-scale-toggle .scale-toggle-btn').forEach(b => {
        b.classList.remove('active')
        b.style.background = '#f8fafc'
        b.style.color      = '#64748b'
      })
      btn.classList.add('active')
      btn.style.background = 'var(--color-accent)'
      btn.style.color      = '#ffffff'
      boxScale = btn.dataset.value
      if (lastBoxGeneList.length > 0) renderBoxplot(lastBoxGeneList, tpmData)
    })
  })
}

// ── tab switching ─────────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'))
  document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add('active')
  document.getElementById(`tab-${tab}`).classList.add('active')

  // auto-trim selection to this tab's limit
  const limit = TAB_LIMITS[tab]
  if (selectedGenes.size > limit) {
    const trimmed  = [...selectedGenes.entries()].slice(0, limit)
    const removed  = selectedGenes.size - limit
    selectedGenes  = new Map(trimmed)
    renderSelectedList()
    // refresh search results if active
    const q = document.getElementById('gene-search').value.trim()
    if (q.length >= 2) searchGenes(q)
    // brief notification
    const warn = document.getElementById('tab-limit-warn')
    if (warn) warn.textContent = `${removed} gene${removed === 1 ? '' : 's'} removed to fit ${tab.toUpperCase()} limit (${limit})`
  }

  updateBuildButton()
}

// ── search genes ──────────────────────────────────────────────
async function searchGenes(query) {
  const el = document.getElementById('gene-search-results')
  el.innerHTML = '<div class="no-results">searching...</div>'
  try {
    const results = await apiFetch(`/genes/search?q=${encodeURIComponent(query)}&limit=30`)
    if (!results || results.length === 0) {
      el.innerHTML = '<div class="no-results">no genes found</div>'
      return
    }
    el.innerHTML = results.map(g => {
      const checked = selectedGenes.has(g.gene_id)
      return `
        <div class="gene-result-item ${checked ? 'checked' : ''}"
             onclick="toggleGene('${g.gene_id}',
               '${(g.gene_symbol||'').replace(/'/g,"\\'")}',
               '${(g.gene_name||'').replace(/'/g,"\\'")}')">
          <input type="checkbox" ${checked ? 'checked' : ''}
                 onclick="event.stopPropagation();toggleGene('${g.gene_id}',
                   '${(g.gene_symbol||'').replace(/'/g,"\\'")}',
                   '${(g.gene_name||'').replace(/'/g,"\\'")}')">
          <div class="gene-result-text">
            <div class="symbol">${g.gene_symbol || g.gene_id}</div>
            <div class="name">${g.gene_name || ''}</div>
          </div>
        </div>`
    }).join('')
  } catch (err) {
    el.innerHTML = `<div class="no-results">error: ${err.message}</div>`
  }
}

// ── toggle gene ───────────────────────────────────────────────
function toggleGene(geneId, geneSymbol, geneName) {
  if (selectedGenes.has(geneId)) {
    selectedGenes.delete(geneId)
  } else {
    if (selectedGenes.size >= TAB_LIMITS[activeTab]) {
      alert(`Maximum ${TAB_LIMITS[activeTab]} genes for the ${activeTab.toUpperCase()} view. Remove some or switch tabs.`)
      return
    }
    selectedGenes.set(geneId, { gene_id:geneId, gene_symbol:geneSymbol, gene_name:geneName })
  }
  const q = document.getElementById('gene-search').value.trim()
  if (q.length >= 2) searchGenes(q)
  renderSelectedList()
  updateBuildButton()
}

function removeGene(geneId) {
  selectedGenes.delete(geneId)
  const q = document.getElementById('gene-search').value.trim()
  if (q.length >= 2) searchGenes(q)
  renderSelectedList()
  updateBuildButton()
}

function clearAll() {
  selectedGenes.clear()
  const q = document.getElementById('gene-search').value.trim()
  if (q.length >= 2) searchGenes(q)
  renderSelectedList()
  updateBuildButton()
  resetAllPlots()
}

function renderSelectedList() {
  document.getElementById('selected-count').textContent = selectedGenes.size
  const el = document.getElementById('selected-genes-list')
  if (selectedGenes.size === 0) {
    el.innerHTML = '<div class="no-results">No genes selected</div>'
    return
  }
  el.innerHTML = [...selectedGenes.values()].map(g => `
    <div class="selected-gene-tag">
      <span>${g.gene_symbol || g.gene_id}</span>
      <button onclick="removeGene('${g.gene_id}')">×</button>
    </div>
  `).join('')
}

function updateBuildButton() {
  const btn   = document.getElementById('build-btn')
  const limit = TAB_LIMITS[activeTab]
  const count = selectedGenes.size
  const labels = { lfc:'Build Log2FC Heatmap', tpm:'Build TPM Heatmap', box:'Build Boxplot' }
  btn.disabled = count === 0
  if (count === 0) {
    btn.textContent = 'Build'
    return
  }
  const overLimit = count > limit
  btn.textContent = overLimit
    ? `${labels[activeTab]} (${limit} of ${count} will be used)`
    : `${labels[activeTab]} (${count})`
  // warn text under button
  let warn = document.getElementById('tab-limit-warn')
  if (!warn) {
    warn = document.createElement('div')
    warn.id = 'tab-limit-warn'
    warn.style.cssText = 'font-size:11px;color:#f97316;text-align:center;margin-top:4px;'
    btn.parentNode.insertBefore(warn, btn.nextSibling)
  }
  warn.textContent = overLimit
    ? `⚠ ${activeTab.toUpperCase()} view limited to ${limit} genes`
    : ''
}

function resetAllPlots() {
  ;['lfc','tpm','box'].forEach(tab => {
    document.getElementById(`${tab}-placeholder`).style.display = 'flex'
    document.getElementById(`${tab}-plot`).style.display        = 'none'
    document.getElementById(`export-${tab}`).style.display      = 'none'
  })
}

// ── bulk select ───────────────────────────────────────────────
async function bulkSelectDataset(datasetId, conditionNum, conditionDenom) {
  document.querySelectorAll('.bulk-btn').forEach(b => b.disabled = true)
  try {
    const sig       = await getDEResults(datasetId, conditionNum, true)
    const limit     = TAB_LIMITS[activeTab]
    const available = limit - selectedGenes.size
    if (available <= 0) { alert(`Maximum ${limit} genes for this view. Clear some first.`); return }
    const toAdd  = sig.slice(0, available)
    toAdd.forEach(d => selectedGenes.set(d.gene_id, {
      gene_id: d.gene_id, gene_symbol: d.gene_symbol || d.gene_id, gene_name: d.gene_name || ''
    }))
    renderSelectedList()
    updateBuildButton()
    const q = document.getElementById('gene-search').value.trim()
    if (q.length >= 2) searchGenes(q)
    if (sig.length > available) alert(`Added ${toAdd.length} genes. ${sig.length - available} skipped (100 gene limit).`)
  } catch (err) { alert(`Error: ${err.message}`) }
  finally { document.querySelectorAll('.bulk-btn').forEach(b => b.disabled = false) }
}

async function bulkSelectAll() {
  document.querySelectorAll('.bulk-btn').forEach(b => b.disabled = true)
  const allBtn = document.querySelector('.bulk-all')
  if (allBtn) allBtn.textContent = 'loading...'
  try {
    for (const ds of DATASETS) {
      if (selectedGenes.size >= TAB_LIMITS[activeTab]) break
      const sig       = await getDEResults(ds.id, ds.condNum, true)
      const available = 100 - selectedGenes.size
      sig.slice(0, available).forEach(d => selectedGenes.set(d.gene_id, {
        gene_id: d.gene_id, gene_symbol: d.gene_symbol || d.gene_id, gene_name: d.gene_name || ''
      }))
    }
    renderSelectedList()
    updateBuildButton()
  } catch (err) { alert(`Error: ${err.message}`) }
  finally {
    document.querySelectorAll('.bulk-btn').forEach(b => b.disabled = false)
    if (allBtn) allBtn.textContent = '+ Select all datasets'
  }
}

// ── build active tab ──────────────────────────────────────────
async function buildActiveTab() {
  if (activeTab === 'lfc') await buildLFCHeatmap()
  if (activeTab === 'tpm') await buildTPMHeatmap()
  if (activeTab === 'box') await buildBoxplot()
}

// ── LOG2FC HEATMAP ────────────────────────────────────────────
async function buildLFCHeatmap() {
  if (selectedGenes.size === 0) return alert('Select at least one gene.')
  const btn = document.getElementById('build-btn')
  btn.textContent = 'loading...'; btn.disabled = true

  document.getElementById('lfc-placeholder').style.display = 'none'
  const plotDiv = document.getElementById('lfc-plot')
  plotDiv.style.display = 'block'
  plotDiv.innerHTML = '<div class="loading" style="height:60px;"><div class="spinner"></div></div>'

  try {
    const limit    = TAB_LIMITS.lfc
    const geneList = [...selectedGenes.values()].slice(0, limit)
    const geneIds  = geneList.map(g => g.gene_id)
    lfcData        = []

    for (const ds of DATASETS) {
      const data = await getDEResults(ds.id, ds.condNum, false)
      data.filter(d => geneIds.includes(d.gene_id))
          .forEach(d => lfcData.push({ ...d, dataset_id: ds.id }))
    }

    renderLFCHeatmap(geneList, lfcData)
    document.getElementById('export-lfc').style.display = 'block'
  } catch (err) {
    plotDiv.innerHTML = `<div class="hm-placeholder">error: ${err.message}</div>`
  } finally {
    updateBuildButton()
  }
}

function renderLFCHeatmap(geneList, data) {
  const plotDiv = document.getElementById('lfc-plot')
  plotDiv.innerHTML = ''

  const lookup = {}
  data.forEach(d => { lookup[`${d.gene_id}__${d.dataset_id}`] = d })

  const sortedGenes = [...geneList].sort((a, b) => {
    const sumA = DATASETS.reduce((s, ds) => s + (parseFloat(lookup[`${a.gene_id}__${ds.id}`]?.log2_fc) || 0), 0)
    const sumB = DATASETS.reduce((s, ds) => s + (parseFloat(lookup[`${b.gene_id}__${ds.id}`]?.log2_fc) || 0), 0)
    return sumB - sumA
  })

  const yLabels = sortedGenes.map(g => g.gene_symbol || g.gene_id)
  const xLabels = DATASETS.map(ds => ds.label)
  const zMatrix = [], textMatrix = [], annotations = []

  sortedGenes.forEach((gene, ri) => {
    const zRow = [], textRow = []
    DATASETS.forEach((ds, ci) => {
      const d   = lookup[`${gene.gene_id}__${ds.id}`]
      const lfc = d ? parseFloat(d.log2_fc) || 0 : null
      zRow.push(lfc)
      textRow.push(d
        ? `<b>${gene.gene_symbol || gene.gene_id}</b><br>${ds.id}<br>log2FC: ${lfc.toFixed(3)}<br>padj: ${parseFloat(d.padj).toExponential(2)}`
        : `<b>${gene.gene_symbol || gene.gene_id}</b><br>${ds.id}<br>not tested`)
      if (d && parseFloat(d.padj) < 0.05)
        annotations.push({ x:ci, y:ri, text:'★', showarrow:false,
          font:{ size:14, color:'#ffffff' }, xref:'x', yref:'y' })
    })
    zMatrix.push(zRow)
    textMatrix.push(textRow)
  })

  const allLFC    = zMatrix.flat().filter(v => v !== null)
  const maxAbsLFC = Math.min(Math.ceil(Math.max(...allLFC.map(Math.abs))), 8)
  const plotH     = Math.max(400, sortedGenes.length * 22 + 120)
  plotDiv.style.height = plotH + 'px'

  Plotly.newPlot(plotDiv, [{
    type:'heatmap', z:zMatrix, x:xLabels, y:yLabels,
    colorscale:[
      [0,'#1a5276'],[0.25,'#2980b9'],[0.4,'#aed6f1'],
      [0.5,'#ffffff'],[0.6,'#f1948a'],[0.75,'#e74c3c'],[1,'#922b21']
    ],
    zmid:0, zmin:-maxAbsLFC, zmax:maxAbsLFC,
    colorbar:{ title:{ text:'log2FC', side:'right', font:{ size:11 } }, thickness:14, len:0.5, tickfont:{ size:10 } },
    text:textMatrix, hovertemplate:'%{text}<extra></extra>',
    showscale:true, xgap:2, ygap:2,
  }], {
    annotations,
    xaxis:{ side:'top', tickfont:{ size:11 }, tickangle:-20 },
    yaxis:{ tickfont:{ size:11 }, autorange:'reversed' },
    plot_bgcolor:'#ffffff', paper_bgcolor:'#ffffff',
    margin:{ l:130, r:20, t:80, b:20 },
    font:{ family:'Inter, sans-serif', size:12 },
  }, { responsive:true, displayModeBar:true,
       modeBarButtonsToRemove:['select2d','lasso2d','autoScale2d'] })
}

// ── TPM HEATMAP ───────────────────────────────────────────────
async function buildTPMHeatmap() {
  if (selectedGenes.size === 0) return alert('Select at least one gene.')
  const btn = document.getElementById('build-btn')
  btn.textContent = 'loading...'; btn.disabled = true

  document.getElementById('tpm-placeholder').style.display = 'none'
  const plotDiv = document.getElementById('tpm-plot')
  plotDiv.style.display = 'block'
  plotDiv.innerHTML = '<div class="loading" style="height:60px;"><div class="spinner"></div></div>'

  try {
    const limit    = TAB_LIMITS.tpm
    const geneList = [...selectedGenes.values()].slice(0, limit)
    const geneIds  = geneList.map(g => g.gene_id)
    tpmData        = []

    for (const geneId of geneIds) {
      const data = await getExpression(geneId)
      if (data) data.forEach(d => tpmData.push({ ...d, gene_id: geneId,
        gene_symbol: selectedGenes.get(geneId)?.gene_symbol || geneId }))
    }

    // filter out genes with no TPM data
    const genesWithData = geneList.filter(g =>
      tpmData.some(d => d.gene_id === g.gene_id)
    )
    const genesNoData = geneList.filter(g =>
      !tpmData.some(d => d.gene_id === g.gene_id)
    )

    if (genesWithData.length === 0) {
      plotDiv.innerHTML = `
        <div class="hm-placeholder" style="opacity:1;">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
               stroke="#94a3b8" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4m0 4h.01"/>
          </svg>
          <div style="text-align:center;max-width:340px;">
            <div style="font-weight:600;color:#475569;margin-bottom:4px;">
              No TPM data available
            </div>
            <div style="font-size:12px;color:#94a3b8;line-height:1.5;">
              TPM expression data is not yet loaded for real genes.
              This will populate once the R pipeline outputs TPM files.
              Try using the dummy genes (Trem2, Apoe, Cx3cr1) to test this view.
            </div>
          </div>
        </div>`
      return
    }

    if (genesNoData.length > 0) {
      // show notification about excluded genes
      const notif = document.createElement('div')
      notif.style.cssText = 'background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:#92400e;'
      notif.innerHTML = `⚠ ${genesNoData.length} gene${genesNoData.length===1?'':'s'} excluded (no TPM data): <b>${genesNoData.map(g=>g.gene_symbol||g.gene_id).join(', ')}</b>`
      plotDiv.parentNode.insertBefore(notif, plotDiv)
    }

    renderTPMHeatmap(genesWithData, tpmData)
    document.getElementById('export-tpm').style.display = 'block'
  } catch (err) {
    plotDiv.innerHTML = `<div class="hm-placeholder">error: ${err.message}</div>`
  } finally { updateBuildButton() }
}

function renderTPMHeatmap(geneList, data) {
  const plotDiv = document.getElementById('tpm-plot')
  plotDiv.innerHTML = ''

  // get all unique samples ordered by dataset
  // insert a null spacer column between datasets for visual separation
  const samples = []
  const xAnnotations = []
  const SPACER = '__spacer__'
  let dsColors2 = ['#1d4ed8','#c0392b','#16a085']

  for (let di = 0; di < DATASETS.length; di++) {
    const ds = DATASETS[di]
    const dsSamples = [...new Set(data.filter(d => d.dataset_id === ds.id).map(d => d.sample_id))]
    if (dsSamples.length === 0) continue
    // add spacer between datasets
    if (samples.length > 0) samples.push(`${SPACER}${di}`)
    const startIdx = samples.length
    samples.push(...dsSamples)
    xAnnotations.push({
      x: startIdx + dsSamples.length / 2 - 0.5,
      y: 1.1, xref:'x', yref:'paper',
      text:`<b>${ds.id}</b>`, showarrow:false,
      font:{ size:12, color: dsColors2[di], family:'Inter, sans-serif' },
      xanchor:'center'
    })
  }

  // build lookup: gene_id × sample_id → tpm
  const lookup = {}
  data.forEach(d => { lookup[`${d.gene_id}__${d.sample_id}`] = d.tpm })

  const sortedGenes = [...geneList]
  const yLabels     = sortedGenes.map(g => g.gene_symbol || g.gene_id)
  const zMatrix     = [], textMatrix = []

  sortedGenes.forEach(gene => {
    const zRow = [], textRow = []
    samples.forEach(s => {
      if (s.startsWith('__spacer__')) {
        // spacer column — null value renders as gray gap
        zRow.push(null)
        textRow.push('')
        return
      }
      const tpm = lookup[`${gene.gene_id}__${s}`] ?? null
      zRow.push(tpm)
      textRow.push(`<b>${gene.gene_symbol || gene.gene_id}</b><br>Sample: ${s}<br>TPM: ${tpm !== null ? parseFloat(tpm).toFixed(2) : 'N/A'}`)
    })
    zMatrix.push(zRow)
    textMatrix.push(textRow)
  })

  const plotH = Math.max(400, sortedGenes.length * 22 + 140)
  plotDiv.style.height = plotH + 'px'

  Plotly.newPlot(plotDiv, [{
    type:'heatmap', z:zMatrix, x:samples, y:yLabels,
    colorscale:'YlOrRd',
    colorbar:{ title:{ text:'TPM', side:'right', font:{ size:11 } }, thickness:14, len:0.5, tickfont:{ size:10 } },
    text:textMatrix, hovertemplate:'%{text}<extra></extra>',
    showscale:true, xgap:1, ygap:2,
  }], {
    annotations: xAnnotations,
    xaxis:{ showticklabels:false, tickfont:{ size:10 } },
    yaxis:{ tickfont:{ size:11 }, autorange:'reversed' },
    plot_bgcolor:'#ffffff', paper_bgcolor:'#ffffff',
    margin:{ l:130, r:20, t:80, b:20 },
    font:{ family:'Inter, sans-serif', size:12 },
  }, { responsive:true, displayModeBar:true,
       modeBarButtonsToRemove:['select2d','lasso2d','autoScale2d'] })
}

// ── BOXPLOT ───────────────────────────────────────────────────
async function buildBoxplot() {
  if (selectedGenes.size === 0) return alert('Select at least one gene.')
  const btn = document.getElementById('build-btn')
  btn.textContent = 'loading...'; btn.disabled = true

  document.getElementById('box-placeholder').style.display = 'none'
  const plotDiv = document.getElementById('box-plot')
  plotDiv.style.display = 'block'
  plotDiv.innerHTML = '<div class="loading" style="height:60px;"><div class="spinner"></div></div>'

  try {
    const limit    = TAB_LIMITS.box
    const geneList = [...selectedGenes.values()].slice(0, limit)
    const geneIds  = geneList.map(g => g.gene_id)
    tpmData        = []

    for (const geneId of geneIds) {
      const data = await getExpression(geneId)
      if (data) data.forEach(d => tpmData.push({ ...d, gene_id:geneId,
        gene_symbol: selectedGenes.get(geneId)?.gene_symbol || geneId }))
    }

    const genesWithDataBox = geneList.filter(g =>
      tpmData.some(d => d.gene_id === g.gene_id)
    )
    const genesNoDataBox = geneList.filter(g =>
      !tpmData.some(d => d.gene_id === g.gene_id)
    )

    if (genesWithDataBox.length === 0) {
      plotDiv.innerHTML = `
        <div class="hm-placeholder" style="opacity:1;">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
               stroke="#94a3b8" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4m0 4h.01"/>
          </svg>
          <div style="text-align:center;max-width:340px;">
            <div style="font-weight:600;color:#475569;margin-bottom:4px;">
              No TPM data available
            </div>
            <div style="font-size:12px;color:#94a3b8;line-height:1.5;">
              No TPM expression rows found for the selected gene(s) in the database.
            </div>
          </div>
        </div>`
      return
    }

    if (genesNoDataBox.length > 0) {
      const notif = document.createElement('div')
      notif.style.cssText = 'background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:#92400e;'
      notif.innerHTML = `⚠ ${genesNoDataBox.length} gene${genesNoDataBox.length===1?'':'s'} excluded (no TPM data): <b>${genesNoDataBox.map(g=>g.gene_symbol||g.gene_id).join(', ')}</b>`
      plotDiv.parentNode.insertBefore(notif, plotDiv)
    }

    renderBoxplot(genesWithDataBox, tpmData)
    document.getElementById('export-box').style.display = 'block'
  } catch (err) {
    plotDiv.innerHTML = `<div class="hm-placeholder">error: ${err.message}</div>`
  } finally { updateBuildButton() }
}

let boxScale = 'log'   // 'log' or 'linear' — log is the default since TPM spans orders of magnitude between genes
let lastBoxGeneList = []

function renderBoxplot(geneList, data) {
  lastBoxGeneList = geneList
  const plotDiv = document.getElementById('box-plot')
  plotDiv.innerHTML = ''

  const palette   = ['#3b82f6','#e74c3c','#2ecc71']
  const nGenes    = geneList.length
  // compact: genes are rows on a shared y-axis, datasets are grouped
  // side-by-side boxes within each row — no more one subplot per gene
  const rowHeight = 90
  const plotH     = Math.max(220, nGenes * rowHeight + 100)
  plotDiv.style.height = plotH + 'px'

  // keep genes in selection order, top to bottom
  const geneOrder = geneList.map(g => g.gene_symbol || g.gene_id)

  const traces = DATASETS.map((ds, di) => {
    const subset = data.filter(d => d.dataset_id === ds.id &&
      geneList.some(g => g.gene_id === d.gene_id))
    return {
      type:        'box',
      orientation: 'h',
      name:        ds.id,
      y:           subset.map(d => d.gene_symbol || d.gene_id),
      x:           subset.map(d => d.tpm),
      marker:      { color: palette[di], opacity:0.8, size:4 },
      line:        { color: palette[di], width:1.5 },
      fillcolor:   palette[di] + '55',
      boxmean:     true,
      hovertemplate: `<b>%{y}</b><br>${ds.id}<br>TPM: %{x:.2f}<extra></extra>`
    }
  }).filter(t => t.y.length > 0)

  const layout = {
    plot_bgcolor:  '#ffffff',
    paper_bgcolor: '#ffffff',
    font:    { family:'Inter, sans-serif', size:11 },
    legend:  { orientation:'h', y:1.06, x:0 },
    showlegend: true,
    boxmode: 'group',
    margin:  { l:110, r:20, t:30, b:40 },
    xaxis: {
      title:     { text: boxScale === 'log' ? 'TPM (log scale)' : 'TPM', font:{ size:12 } },
      type:      boxScale === 'log' ? 'log' : 'linear',
      gridcolor: '#f1f5f9',
      zeroline:  false,
    },
    yaxis: {
      type:          'category',
      categoryorder: 'array',
      categoryarray: geneOrder,
      autorange:     'reversed',   // first selected gene on top
      tickfont:      { size:12, weight:700 },
      gridcolor:     '#f1f5f9',
    },
  }

  Plotly.newPlot(plotDiv, traces, layout, {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: ['select2d','lasso2d','autoScale2d']
  })
}

// ── exports ───────────────────────────────────────────────────
function downloadLFCCSV() {
  if (!lfcData.length) return alert('Build the heatmap first.')
  const cols = [
    { key:'gene_id', label:'gene_id' }, { key:'gene_symbol', label:'gene_symbol' },
    { key:'dataset_id', label:'dataset_id' }, { key:'log2_fc', label:'log2FoldChange' },
    { key:'padj', label:'padj' }, { key:'direction', label:'direction' },
  ]
  downloadCSV(toCSV(lfcData, cols), 'gene_explorer_lfc')
}

function downloadTPMCSV() {
  if (!tpmData.length) return alert('Build the plot first.')
  const cols = [
    { key:'gene_id', label:'gene_id' }, { key:'gene_symbol', label:'gene_symbol' },
    { key:'sample_id', label:'sample_id' }, { key:'dataset_id', label:'dataset_id' },
    { key:'condition', label:'condition' }, { key:'tpm', label:'tpm' },
  ]
  downloadCSV(toCSV(tpmData, cols), 'gene_explorer_tpm')
}

init()
