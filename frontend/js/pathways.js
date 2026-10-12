// js/pathways.js
history.scrollRestoration = 'manual'
window.scrollTo(0, 0)

let currentDatabase  = 'KEGG'
let currentDatasetId = null
let minDatasets      = 2
let topN             = 20
let directionFilter  = 'all'

// three-state sort state for each table
let genesSortCol   = null, genesSortState  = null
let sharedSortCol  = null, sharedSortState = null
let genesData      = []
let sharedData     = []

// ── three-state sort helpers ──────────────────────────────────
function handleSort(tableKey, col) {
  if (tableKey === 'genes') {
    if (genesSortCol !== col) { genesSortCol = col; genesSortState = 'desc' }
    else if (genesSortState === 'desc') genesSortState = 'asc'
    else { genesSortCol = null; genesSortState = null }
    updateSortHeaders('genes', genesSortCol, genesSortState)
    renderGenesTable()
  } else {
    if (sharedSortCol !== col) { sharedSortCol = col; sharedSortState = 'desc' }
    else if (sharedSortState === 'desc') sharedSortState = 'asc'
    else { sharedSortCol = null; sharedSortState = null }
    updateSortHeaders('shared', sharedSortCol, sharedSortState)
    renderSharedTable()
  }
}

function updateSortHeaders(tableKey, col, state) {
  document.querySelectorAll(`th[data-table="${tableKey}"]`).forEach(th => {
    th.classList.remove('sort-desc', 'sort-asc')
    if (th.dataset.col === col) {
      if (state === 'desc') th.classList.add('sort-desc')
      if (state === 'asc')  th.classList.add('sort-asc')
    }
  })
}

function sortData(data, col, state) {
  if (!col || !state) return [...data]
  return [...data].sort((a, b) => {
    let va = a[col], vb = b[col]
    if (va === null || va === undefined) va = ''
    if (vb === null || vb === undefined) vb = ''
    if (!isNaN(parseFloat(va)) && !isNaN(parseFloat(vb))) {
      return state === 'desc'
        ? parseFloat(vb) - parseFloat(va)
        : parseFloat(va) - parseFloat(vb)
    }
    va = String(va); vb = String(vb)
    return state === 'desc' ? vb.localeCompare(va) : va.localeCompare(vb)
  })
}

// ── init ──────────────────────────────────────────────────────
async function init() {
  await populateDatasetDropdown()
  await onDatasetChange()
  await loadSharedPathways()

  document.getElementById('dataset-select')
    .addEventListener('change', onDatasetChange)

  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.toggle-btn')
        .forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      currentDatabase = btn.dataset.value
      loadPathways()
      loadSharedPathways()
    })
  })

  document.querySelectorAll('.pw-dir-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pw-dir-btn')
        .forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      directionFilter = btn.dataset.value
      loadPathways()
    })
  })

  document.getElementById('topn-slider').addEventListener('input', e => {
    topN = parseInt(e.target.value)
    document.getElementById('topn-value').textContent = topN
    loadPathways()
  })

  document.querySelectorAll('.filter-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.filter-option')
        .forEach(o => o.classList.remove('active'))
      opt.classList.add('active')
      minDatasets = parseInt(opt.dataset.value)
      loadSharedPathways()
    })
  })

  // three-state sort for both tables
  document.querySelectorAll('thead th[data-table]').forEach(th => {
    th.addEventListener('click', () =>
      handleSort(th.dataset.table, th.dataset.col)
    )
  })
}

// ── populate dataset dropdown ─────────────────────────────────
async function populateDatasetDropdown() {
  try {
    const datasets = await getDatasets()
    const sel = document.getElementById('dataset-select')
    sel.innerHTML = datasets.map(d =>
      `<option value="${d.dataset_id}">${d.dataset_id} — ${(d.disease_model||'').replace(/\u2014/g,'-')}</option>`
    ).join('')
  } catch (err) {
    console.error('Failed to load datasets:', err)
  }
}

// ── dataset changes ───────────────────────────────────────────
async function onDatasetChange() {
  currentDatasetId = document.getElementById('dataset-select').value
  if (!currentDatasetId) return
  resetPathwayCard()
  await loadPathways()
}

// ── clean pathway name ────────────────────────────────────────
function cleanName(name) {
  return (name || '')
    .replace(/^KEGG_/, '').replace(/^GOBP_/, '')
    .replace(/^GOMF_/, '').replace(/^HALLMARK_/, '')
    .replace(/^REACTOME_/, '').replace(/^WP_/, '')
    .replace(/_/g, ' ').toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
}

// ── load pathway dot plot ─────────────────────────────────────
async function loadPathways() {
  if (!currentDatasetId) return

  const container = document.getElementById('pathway-plot')
  container.innerHTML =
    '<div class="loading" style="height:580px;"><div class="spinner"></div> loading pathways...</div>'

  try {
    let data = await getPathways(currentDatasetId, currentDatabase, topN)

    if (!data || data.length === 0) {
      container.innerHTML =
        '<div class="placeholder">no pathway results found for this dataset</div>'
      return
    }

    if (directionFilter !== 'all') {
      data = data.filter(d => d.direction === directionFilter)
    }

    if (data.length === 0) {
      container.innerHTML =
        `<div class="placeholder">no ${directionFilter} pathways found</div>`
      return
    }

    container.innerHTML = ''

    const negLog10Padj = data.map(d => -Math.log10(Math.max(d.padj, 1e-10)))
    const maxVal       = Math.max(...negLog10Padj)
    const minVal       = Math.min(...negLog10Padj)

    const trace = {
      x:    data.map(d => d.nes),
      y:    data.map(d => cleanName(d.pathway_name)),
      mode: 'markers',
      type: 'scatter',
      marker: {
        size:         data.map(d => Math.sqrt(d.overlap_size || 10) * 5),
        color:        negLog10Padj,
        colorscale:   [[0,'#f1f5f9'],[0.5,'#f97316'],[1,'#c0392b']],
        cmin:         minVal,
        cmax:         maxVal,
        showscale:    true,
        colorbar: {
          title:     { text: '-log10(padj)', side: 'right', font: { size: 11 } },
          thickness: 12,
          len:       0.6,
          tickfont:  { size: 10 }
        },
        line: { color: 'rgba(255,255,255,0.3)', width: 1 }
      },
      customdata: data.map(d => ({
        pathway_id:   d.pathway_id,
        pathway_name: cleanName(d.pathway_name),
        nes:          d.nes,
        padj:         d.padj,
        overlap_size: d.overlap_size,
        direction:    d.direction
      })),
      text: data.map(d =>
        `${cleanName(d.pathway_name)}<br>` +
        `NES: ${d.nes.toFixed(3)}<br>` +
        `padj: ${d.padj.toExponential(2)}<br>` +
        `genes: ${d.overlap_size || '—'}`
      ),
      hovertemplate: '%{text}<extra></extra>'
    }

    const plotHeight = Math.max(400, data.length * 28 + 80)
    document.getElementById('pathway-plot').style.height = plotHeight + 'px'

    Plotly.newPlot(container, [trace], {
      xaxis: {
        title:         'Normalized Enrichment Score (NES)',
        zeroline:      true,
        zerolinecolor: '#94a3b8',
        zerolinewidth: 1,
        gridcolor:     '#f1f5f9'
      },
      yaxis: {
        automargin:    true,
        categoryorder: 'total ascending',
        tickfont:      { size: 11 },
        gridcolor:     '#f1f5f9'
      },
      plot_bgcolor:  '#ffffff',
      paper_bgcolor: '#ffffff',
      margin:        { l: 300, r: 80, t: 40, b: 60 },
      font:          { family: 'Inter, sans-serif', size: 12 },
      shapes: [{
        type: 'line', x0: 0, x1: 0, y0: 0, y1: 1, yref: 'paper',
        line: { dash: 'dash', color: '#94a3b8', width: 1 }
      }],
      annotations: [
        { x: 0.02, y: 1.04, xref:'paper', yref:'paper',
          text: '← suppressed', showarrow: false,
          font: { size: 11, color: '#2471a3' }, xanchor: 'left' },
        { x: 0.98, y: 1.04, xref:'paper', yref:'paper',
          text: 'activated →', showarrow: false,
          font: { size: 11, color: '#c0392b' }, xanchor: 'right' }
      ]
    }, {
      responsive: true,
      displayModeBar: true,
      modeBarButtonsToRemove: ['select2d','lasso2d','autoScale2d']
    })

    container.on('plotly_click', async eventData => {
      const pt = eventData.points[0]
      if (!pt.customdata) return
      const cd = pt.customdata
      showPathwayCard(cd)
      await loadPathwayGenes(cd.pathway_id)
      await buildPathwayHeatmap(cd.pathway_id, cd.pathway_name)
      document.getElementById('pathway-gene-tbody')
        .closest('.section')
        .scrollIntoView({ behavior: 'smooth', block: 'start' })
    })

  } catch (err) {
    container.innerHTML =
      `<div class="placeholder">error: ${err.message}</div>`
  }
}

// ── show pathway card ─────────────────────────────────────────
function showPathwayCard(cd) {
  document.getElementById('pathway-selected-card').classList.add('visible')
  document.getElementById('pathway-selected-name').textContent =
    cd.pathway_name || '—'
  document.getElementById('pathway-nes').textContent =
    parseFloat(cd.nes).toFixed(3)
  document.getElementById('pathway-padj').textContent =
    parseFloat(cd.padj).toExponential(2)
  const dirEl = document.getElementById('pathway-dir')
  dirEl.textContent = cd.direction || '—'
  dirEl.className   = `value ${cd.direction}`
}

// ── reset pathway card ────────────────────────────────────────
function resetPathwayCard() {
  document.getElementById('pathway-selected-card').classList.remove('visible')
  genesData = []
  genesSortCol = null; genesSortState = null
  updateSortHeaders('genes', null, null)
  document.getElementById('pathway-gene-tbody').innerHTML =
    '<tr><td colspan="4" style="text-align:center;padding:24px;color:#64748b;">click a pathway in the dot plot to load genes</td></tr>'
  document.getElementById('pathway-heatmap-section').style.display = 'none'
  document.getElementById('pathway-plot')
    .scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// ── load and render genes table ───────────────────────────────
async function loadPathwayGenes(pathwayId) {
  document.getElementById('pathway-gene-tbody').innerHTML =
    '<tr><td colspan="4" style="text-align:center;padding:16px;color:#64748b;">loading...</td></tr>'
  try {
    genesData    = await getPathwayGenes(pathwayId, currentDatasetId)
    genesSortCol = null; genesSortState = null
    updateSortHeaders('genes', null, null)
    renderGenesTable()
  } catch (err) {
    document.getElementById('pathway-gene-tbody').innerHTML =
      `<tr><td colspan="4" style="text-align:center;color:#c0392b;padding:16px;">error: ${err.message}</td></tr>`
  }
}

function renderGenesTable() {
  const sorted = sortData(genesData, genesSortCol, genesSortState)
  const tbody  = document.getElementById('pathway-gene-tbody')

  if (!sorted || sorted.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="4" style="text-align:center;padding:24px;color:#64748b;">no significant DE genes found in this pathway</td></tr>'
    return
  }

  tbody.innerHTML = sorted.map(d => `
    <tr>
      <td class="gene-symbol">${d.gene_symbol || ''}</td>
      <td class="numeric ${parseFloat(d.log2_fc) > 0 ? 'up' : 'down'}">
        ${parseFloat(d.log2_fc).toFixed(3)}
      </td>
      <td class="numeric">${parseFloat(d.padj).toExponential(2)}</td>
      <td class="${d.direction === 'upregulated' ? 'up' : 'down'}">${d.direction}</td>
    </tr>
  `).join('')
}

// ── load and render shared pathways table ─────────────────────
async function loadSharedPathways() {
  document.getElementById('shared-tbody').innerHTML =
    '<tr><td colspan="5" style="text-align:center;padding:16px;color:#64748b;">loading...</td></tr>'
  try {
    sharedData    = await getSharedPathways(currentDatabase, minDatasets)
    sharedSortCol = null; sharedSortState = null
    updateSortHeaders('shared', null, null)
    renderSharedTable()
  } catch (err) {
    document.getElementById('shared-tbody').innerHTML =
      `<tr><td colspan="5" style="text-align:center;color:#c0392b;padding:16px;">error: ${err.message}</td></tr>`
  }
}

function renderSharedTable() {
  const sorted = sortData(sharedData, sharedSortCol, sharedSortState)
  const tbody  = document.getElementById('shared-tbody')

  if (!sorted || sorted.length === 0) {
    const label = minDatasets === 1 ? 'any dataset' :
                  minDatasets === 3 ? 'all 3 datasets' : 'any 2 datasets'
    tbody.innerHTML =
      `<tr><td colspan="5" style="text-align:center;padding:24px;color:#64748b;">no shared pathways found in ${label}</td></tr>`
    return
  }

  tbody.innerHTML = sorted.map(d => `
    <tr>
      <td>${cleanName(d.pathway_name)}</td>
      <td>
        <span style="font-size:10px;font-weight:700;background:#dbeafe;color:#1e40af;padding:2px 6px;border-radius:3px;">
          ${d.database}
        </span>
      </td>
      <td style="text-align:center;font-weight:600;">${d.n_datasets}</td>
      <td class="numeric ${parseFloat(d.mean_nes) > 0 ? 'up' : 'down'}">
        ${parseFloat(d.mean_nes).toFixed(3)}
      </td>
      <td class="numeric">${parseFloat(d.mean_padj).toExponential(2)}</td>
    </tr>
  `).join('')
}

init()

// ── reset all filters ─────────────────────────────────────────
function resetFilters() {
  document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'))
  document.querySelector('.toggle-btn[data-value="KEGG"]').classList.add('active')
  currentDatabase = 'KEGG'

  document.querySelectorAll('.pw-dir-btn').forEach(b => b.classList.remove('active'))
  document.querySelector('.pw-dir-btn[data-value="all"]').classList.add('active')
  directionFilter = 'all'

  topN = 20
  document.getElementById('topn-slider').value = '20'
  document.getElementById('topn-value').textContent = '20'

  document.querySelectorAll('.filter-option').forEach(o => o.classList.remove('active'))
  document.querySelector('.filter-option[data-value="2"]').classList.add('active')
  minDatasets = 2

  loadPathways()
  loadSharedPathways()
}

// ── single export button ──────────────────────────────────────
// exports pathway results for current dataset + database
// with direction filter applied
// also appends shared pathways as a second sheet (separate CSV)
async function downloadPathwayCSV() {
  const btn = document.getElementById('download-pathways-btn')
  btn.textContent = 'exporting...'
  btn.disabled    = true
  try {
    if (!currentDatasetId) return alert('Select a dataset first.')

    // fetch all pathways (no top N limit) for current dataset + database
    const data = await getPathways(currentDatasetId, currentDatabase, 9999)
    let filtered = directionFilter !== 'all'
      ? data.filter(d => d.direction === directionFilter)
      : data

    if (!filtered || filtered.length === 0) return alert('No pathway results match current filters.')

    const rows = filtered.map(d => ({
      pathway_name: cleanName(d.pathway_name),
      pathway_id:   d.pathway_id,
      nes:          d.nes,
      padj:         d.padj,
      overlap_size: d.overlap_size,
      direction:    d.direction,
      database:     currentDatabase,
      dataset_id:   currentDatasetId,
    }))

    const columns = [
      { key:'pathway_name', label:'pathway_name' },
      { key:'pathway_id',   label:'pathway_id' },
      { key:'nes',          label:'NES' },
      { key:'padj',         label:'padj' },
      { key:'overlap_size', label:'overlap_size' },
      { key:'direction',    label:'direction' },
      { key:'database',     label:'database' },
      { key:'dataset_id',   label:'dataset_id' },
    ]

    const suffix   = directionFilter !== 'all' ? `_${directionFilter}` : ''
    const filename = `pathways_${currentDatasetId}_${currentDatabase}${suffix}`
    downloadCSV(toCSV(rows, columns), filename)

  } catch (err) { alert(`Export failed: ${err.message}`) }
  finally { btn.textContent = '↓ Export CSV'; btn.disabled = false }
}


// ── export shared pathways table ──────────────────────────────
async function downloadSharedCSV() {
  const btn = document.getElementById('download-shared-btn')
  btn.textContent = 'exporting...'
  btn.disabled    = true
  try {
    const data = await getSharedPathways(currentDatabase, minDatasets)
    if (!data || data.length === 0) return alert('No shared pathway data to export.')
    const rows = data.map(d => ({
      pathway_name: cleanName(d.pathway_name),
      database:     d.database,
      n_datasets:   d.n_datasets,
      mean_nes:     d.mean_nes,
      mean_padj:    d.mean_padj,
    }))
    const columns = [
      { key:'pathway_name', label:'pathway_name' },
      { key:'database',     label:'database' },
      { key:'n_datasets',   label:'n_datasets' },
      { key:'mean_nes',     label:'mean_NES' },
      { key:'mean_padj',    label:'mean_padj' },
    ]
    const filename = `shared_pathways_${currentDatabase}_min${minDatasets}datasets`
    downloadCSV(toCSV(rows, columns), filename)
  } catch (err) { alert(`Export failed: ${err.message}`) }
  finally { btn.textContent = '↓ Export CSV'; btn.disabled = false }
}

// ── pathway gene heatmap ──────────────────────────────────────
let pathwayHeatmapData = []

async function buildPathwayHeatmap(pathwayId, pathwayName) {
  const section = document.getElementById('pathway-heatmap-section')
  const plotDiv = document.getElementById('pathway-heatmap-plot')
  section.style.display = 'block'
  plotDiv.style.height  = '80px'
  plotDiv.innerHTML     =
    '<div class="loading" style="height:80px;"><div class="spinner"></div> building heatmap...</div>'

  try {
    // fetch DE results for all genes in this pathway across all 3 datasets
    const DATASETS = [
      { id:'GSE212277', condNum:'5xFAD',    condDenom:'WT (Control)' },
      { id:'GSE203655', condNum:'STAT1-KO', condDenom:'Control' },
      { id:'GSE146680', condNum:'Microglia', condDenom:'Macrophage' },
    ]
    const DS_LABELS = {
      'GSE212277': '5xFAD vs WT',
      'GSE203655': 'STAT1-KO vs Control',
      'GSE146680': 'Microglia vs Macrophage',
    }

    // get pathway genes from current dataset first to know which genes to look up
    const pathwayGenes = await getPathwayGenes(pathwayId, currentDatasetId)
    if (!pathwayGenes || pathwayGenes.length === 0) {
      plotDiv.innerHTML =
        '<div style="text-align:center;padding:24px;color:#64748b;">no significant DE genes in this pathway</div>'
      return
    }

    // API returns gene_symbol — use that as the key
    const geneSymbols = [...new Set(pathwayGenes.map(g => g.gene_symbol).filter(Boolean))]

    // fetch DE data across all datasets and match by gene_symbol
    pathwayHeatmapData = []
    for (const ds of DATASETS) {
      const data = await getDEResults(ds.id, ds.condNum, false)
      data.filter(d => geneSymbols.includes(d.gene_symbol))
          .forEach(d => pathwayHeatmapData.push({ ...d, dataset_id: ds.id }))
    }

    if (pathwayHeatmapData.length === 0) {
      plotDiv.innerHTML =
        '<div style="text-align:center;padding:24px;color:#64748b;">no matching DE data found for pathway genes</div>'
      return
    }

    // build matrix keyed by gene_symbol × dataset
    const lookup = {}
    pathwayHeatmapData.forEach(d => { lookup[`${d.gene_symbol}__${d.dataset_id}`] = d })

    // sort genes by mean LFC across datasets
    const sortedSymbols = [...geneSymbols].sort((a, b) => {
      const sumA = DATASETS.reduce((s, ds) => s + (parseFloat(lookup[`${a}__${ds.id}`]?.log2_fc) || 0), 0)
      const sumB = DATASETS.reduce((s, ds) => s + (parseFloat(lookup[`${b}__${ds.id}`]?.log2_fc) || 0), 0)
      return sumB - sumA
    })

    const yLabels = sortedSymbols
    const xLabels = DATASETS.map(ds => DS_LABELS[ds.id])
    const zMatrix = [], textMatrix = [], annotations = []

    sortedSymbols.forEach((sym, ri) => {
      const zRow = [], textRow = []
      DATASETS.forEach((ds, ci) => {
        const d   = lookup[`${sym}__${ds.id}`]
        const lfc = d ? parseFloat(d.log2_fc) || 0 : null
        zRow.push(lfc)
        textRow.push(d
          ? `<b>${sym}</b><br>${DS_LABELS[ds.id]}<br>log2FC: ${lfc.toFixed(3)}<br>padj: ${parseFloat(d.padj).toExponential(2)}`
          : `<b>${sym}</b><br>${DS_LABELS[ds.id]}<br>not tested`)
        if (d && parseFloat(d.padj) < 0.05)
          annotations.push({ x:ci, y:ri, text:'★', showarrow:false,
            font:{ size:14, color:'#ffffff' }, xref:'x', yref:'y' })
      })
      zMatrix.push(zRow)
      textMatrix.push(textRow)
    })

    const allLFC    = zMatrix.flat().filter(v => v !== null)
    const maxAbsLFC = allLFC.length > 0
      ? Math.min(Math.ceil(Math.max(...allLFC.map(Math.abs))), 8)
      : 4
    const plotH     = Math.max(300, sortedSymbols.length * 22 + 120)
    plotDiv.innerHTML    = ''
    plotDiv.style.height = plotH + 'px'

    Plotly.newPlot(plotDiv, [{
      type:'heatmap', z:zMatrix, x:xLabels, y:yLabels,
      colorscale:[
        [0,'#1a5276'],[0.25,'#2980b9'],[0.4,'#aed6f1'],
        [0.5,'#ffffff'],[0.6,'#f1948a'],[0.75,'#e74c3c'],[1,'#922b21']
      ],
      zmid:0, zmin:-maxAbsLFC, zmax:maxAbsLFC,
      colorbar:{ title:{ text:'log2FC', side:'right', font:{ size:11 } },
                 thickness:14, len:0.5, tickfont:{ size:10 } },
      text:textMatrix, hovertemplate:'%{text}<extra></extra>',
      showscale:true, xgap:2, ygap:2,
    }], {
      annotations,
      title:{ text:`${pathwayName} — leading-edge genes from ${currentDatasetId}`,
              font:{ size:13 }, x:0, xanchor:'left', y:0.98, yanchor:'top' },
      xaxis:{ side:'top', tickfont:{ size:12 }, tickangle:0 },
      yaxis:{ tickfont:{ size:11 }, autorange:'reversed' },
      plot_bgcolor:'#ffffff', paper_bgcolor:'#ffffff',
      margin:{ l:130, r:20, t:95, b:20 },
      font:{ family:'Inter, sans-serif', size:12 },
    }, { responsive:true, displayModeBar:true,
         modeBarButtonsToRemove:['select2d','lasso2d','autoScale2d'] })

    // scroll to heatmap
    section.scrollIntoView({ behavior:'smooth', block:'start' })

  } catch (err) {
    plotDiv.innerHTML =
      `<div style="text-align:center;padding:24px;color:#c0392b;">error: ${err.message}</div>`
  }
}

function downloadPathwayHeatmapCSV() {
  if (!pathwayHeatmapData || pathwayHeatmapData.length === 0)
    return alert('No heatmap data to export.')
  const cols = [
    { key:'gene_id',    label:'gene_id' },
    { key:'gene_symbol',label:'gene_symbol' },
    { key:'dataset_id', label:'dataset_id' },
    { key:'log2_fc',    label:'log2FoldChange' },
    { key:'padj',       label:'padj' },
    { key:'direction',  label:'direction' },
  ]
  downloadCSV(toCSV(pathwayHeatmapData, cols), `pathway_heatmap_${currentDatasetId}`)
}
