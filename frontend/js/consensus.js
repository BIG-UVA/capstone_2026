// js/consensus.js
history.scrollRestoration = 'manual'
window.scrollTo(0, 0)

let allGenes       = []
let displayGenes   = []
let searchQuery    = ''
let overlapFilter  = 'any2'
let consistentOnly = false
let sortCol        = null
let sortState      = null
let consensusPage  = 1
const PAGE_SIZE    = 50

const INFECTION_DATASETS = ['GSE203655', 'GSE146680']
const ALZ_DATASET        = 'GSE212277'

// ── init ──────────────────────────────────────────────────────
async function init() {
  await loadAll()

  document.querySelectorAll('.overlap-option').forEach(opt => {
    opt.addEventListener('click', async () => {
      document.querySelectorAll('.overlap-option')
        .forEach(o => o.classList.remove('active'))
      opt.classList.add('active')
      overlapFilter = opt.dataset.value
      await loadAll()
    })
  })

  document.getElementById('consistent-only').addEventListener('change', e => {
    consistentOnly = e.target.checked
    applyFiltersAndRender()
  })

  document.getElementById('gene-search').addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase()
    applyFiltersAndRender()
  })

  document.querySelectorAll('thead th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col
      if (sortCol !== col) { sortCol = col; sortState = 'desc' }
      else if (sortState === 'desc') sortState = 'asc'
      else { sortState = null; sortCol = null }
      updateSortHeaders()
      applyFiltersAndRender()
    })
  })
}

// ── load all genes from API ───────────────────────────────────
async function loadAll() {
  const tbody = document.getElementById('consensus-tbody')
  tbody.innerHTML =
    '<tr><td colspan="6" style="text-align:center;padding:24px;color:#64748b;">loading...</td></tr>'
  try {
    allGenes = await getConsensusGenes(1, false)
    applyFiltersAndRender()
  } catch (err) {
    tbody.innerHTML =
      `<tr><td colspan="6" style="text-align:center;padding:24px;color:#c0392b;">error: ${err.message}</td></tr>`
  }
}

// ── apply all filters then render ─────────────────────────────
function applyFiltersAndRender() {
  let data = [...allGenes]

  data = data.filter(d => {
    const ds = Array.isArray(d.datasets_list)
      ? d.datasets_list
      : (d.datasets_list || '').split(',').map(s => s.trim())

    if (overlapFilter === 'any2')         return d.n_datasets >= 2
    if (overlapFilter === 'all3')         return d.n_datasets === 3
    if (overlapFilter === 'infection')    return INFECTION_DATASETS.every(id => ds.includes(id))
    if (overlapFilter === 'alz_infection')
      return ds.includes(ALZ_DATASET) && INFECTION_DATASETS.some(id => ds.includes(id))
    return true
  })

  if (consistentOnly) data = data.filter(d => d.consistent_dir === true)

  if (searchQuery) {
    data = data.filter(d =>
      (d.gene_symbol || '').toLowerCase().includes(searchQuery) ||
      (d.gene_name   || '').toLowerCase().includes(searchQuery)
    )
  }

  if (sortCol && sortState) {
    data.sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol]
      if (Array.isArray(va)) va = va.join(', ')
      if (Array.isArray(vb)) vb = vb.join(', ')
      if (typeof va === 'boolean') {
        va = va ? 1 : 0; vb = vb ? 1 : 0
        return sortState === 'desc' ? vb - va : va - vb
      }
      if (!isNaN(parseFloat(va)) && !isNaN(parseFloat(vb))) {
        return sortState === 'desc'
          ? parseFloat(vb) - parseFloat(va)
          : parseFloat(va) - parseFloat(vb)
      }
      va = String(va || ''); vb = String(vb || '')
      return sortState === 'desc' ? vb.localeCompare(va) : va.localeCompare(vb)
    })
  }

  displayGenes  = data
  consensusPage = 1   // reset to page 1 whenever filters change
  renderTable()
}

// ── update sort headers ───────────────────────────────────────
function updateSortHeaders() {
  document.querySelectorAll('thead th[data-col]').forEach(th => {
    th.classList.remove('sort-desc', 'sort-asc')
    if (th.dataset.col === sortCol) {
      if (sortState === 'desc') th.classList.add('sort-desc')
      if (sortState === 'asc')  th.classList.add('sort-asc')
    }
  })
}

// ── render table with pagination ──────────────────────────────
function renderTable() {
  const total    = displayGenes.length
  const start    = (consensusPage - 1) * PAGE_SIZE
  const pageData = displayGenes.slice(start, start + PAGE_SIZE)

  // result count
  const countEl = document.getElementById('result-count')
  countEl.innerHTML = total
    ? `showing <strong>${Math.min(start+1,total)}–${Math.min(start+PAGE_SIZE,total)}</strong> of <strong>${total}</strong> gene${total === 1 ? '' : 's'}`
    : ''

  const tbody = document.getElementById('consensus-tbody')
  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"
      style="text-align:center;padding:24px;color:#64748b;">
      ${searchQuery ? `no genes matching "${searchQuery}"` : 'no genes found for current filters'}
    </td></tr>`
  } else {
    tbody.innerHTML = pageData.map(d => {
      const datasets = Array.isArray(d.datasets_list)
        ? d.datasets_list.join(', ')
        : (d.datasets_list || '—')

      const consistentBadge = d.consistent_dir
        ? '<span style="font-size:10px;font-weight:700;background:#dcfce7;color:#166534;padding:2px 7px;border-radius:3px;">yes</span>'
        : '<span style="font-size:10px;font-weight:700;background:#f1f5f9;color:#64748b;padding:2px 7px;border-radius:3px;">no</span>'

      const nColor = d.n_datasets === 3 ? '#7c3aed' : '#1a2332'

      return `
        <tr onclick="selectGene(event,
          '${d.gene_id}',
          '${(d.gene_symbol||'').replace(/'/g,"\\'")}',
          '${(d.gene_name||'').replace(/'/g,"\\'")}')">
          <td class="gene-symbol">${d.gene_symbol || ''}</td>
          <td class="gene-name">${d.gene_name || ''}</td>
          <td style="font-size:11px;color:var(--color-muted);font-family:var(--font-mono);white-space:nowrap;">${d.gene_id || ''}</td>
          <td style="text-align:center;font-weight:700;color:${nColor};white-space:nowrap;">${d.n_datasets}</td>
          <td style="font-size:12px;color:var(--color-muted);">${datasets}</td>
          <td style="text-align:center;white-space:nowrap;">${consistentBadge}</td>
        </tr>
      `
    }).join('')
  }

  // pagination controls
  document.getElementById('consensus-page-info').textContent =
    total === 0 ? '—' :
    `${Math.min(start+1,total)}–${Math.min(start+PAGE_SIZE,total)} of ${total}`
  document.getElementById('consensus-prev-btn').disabled = consensusPage === 1
  document.getElementById('consensus-next-btn').disabled = start + PAGE_SIZE >= total
}

function changeConsensusPage(dir) {
  consensusPage += dir
  renderTable()
  // scroll back to top of table
  document.getElementById('consensus-tbody')
    .closest('.section')
    .scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// ── select gene and load expression ──────────────────────────
async function selectGene(e, geneId, geneSymbol, geneName) {
  document.querySelectorAll('#consensus-tbody tr')
    .forEach(tr => tr.classList.remove('selected'))
  e.currentTarget.classList.add('selected')

  document.getElementById('gene-selected-card').classList.add('visible')
  document.getElementById('gene-selected-symbol').textContent = geneSymbol
  document.getElementById('gene-selected-name').textContent   = geneName

  document.getElementById('expression-placeholder').style.display = 'none'
  const plotDiv = document.getElementById('expression-plot')
  plotDiv.style.display = 'block'
  plotDiv.innerHTML =
    '<div class="loading" style="height:440px;"><div class="spinner"></div> loading expression...</div>'

  document.getElementById('expression-wrap')
    .scrollIntoView({ behavior: 'smooth', block: 'start' })

  try {
    const data = await getExpression(geneId)
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

    const datasets      = [...new Set(data.map(d => d.dataset_id))].sort()
    const allConditions = [...new Set(data.map(d => d.condition))].sort()
    const palette       = ['#3498db','#e74c3c','#2ecc71','#9b59b6',
                           '#f39c12','#1abc9c','#e67e22','#16a085']
    const colorMap      = Object.fromEntries(
      allConditions.map((c, i) => [c, palette[i % palette.length]])
    )

    const traces = allConditions.map(cond => {
      const subset = data.filter(d => d.condition === cond)
      if (subset.length === 0) return null
      return {
        name:  cond,
        type:  'bar',
        x:     subset.map(d => `${d.dataset_id}||${d.sample_id}`),
        y:     subset.map(d => d.tpm),
        marker: { color: colorMap[cond] },
        hovertemplate: `<b>${cond}</b><br>TPM: %{y:.2f}<extra></extra>`
      }
    }).filter(Boolean)

    const annotations = []
    let xOffset = 0
    datasets.forEach(ds => {
      const dsData = data.filter(d => d.dataset_id === ds)
      if (dsData.length === 0) return
      annotations.push({
        x: xOffset + dsData.length / 2 - 0.5,
        y: 1.06, xref: 'x', yref: 'paper',
        text: `<b>${ds}</b>`, showarrow: false,
        font: { size: 11, color: '#1a2332' }, xanchor: 'center'
      })
      xOffset += dsData.length
    })

    Plotly.newPlot(plotDiv, traces, {
      barmode: 'group',
      xaxis: { showticklabels: false, gridcolor: '#f1f5f9' },
      yaxis: { title: 'TPM', gridcolor: '#f1f5f9' },
      plot_bgcolor: '#ffffff', paper_bgcolor: '#ffffff',
      margin: { l: 55, r: 20, t: 55, b: 40 },
      font:   { family: 'Inter, sans-serif', size: 11 },
      legend: { orientation: 'h', y: -0.1, x: 0, font: { size: 11 } },
      annotations, bargap: 0.15, bargroupgap: 0.05
    }, { responsive: true, displayModeBar: false })

  } catch (err) {
    plotDiv.innerHTML = `<div class="expr-placeholder">error: ${err.message}</div>`
  }
}

// ── reset expression ──────────────────────────────────────────
function resetExpression() {
  document.getElementById('gene-selected-card').classList.remove('visible')
  document.getElementById('expression-placeholder').style.display = 'flex'
  document.getElementById('expression-plot').style.display        = 'none'
  document.querySelectorAll('#consensus-tbody tr')
    .forEach(tr => tr.classList.remove('selected'))
  document.querySelector('.section')
    .scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// ── reset all filters ─────────────────────────────────────────
function resetFilters() {
  document.querySelectorAll('.overlap-option').forEach(o => o.classList.remove('active'))
  document.querySelector('.overlap-option[data-value="any2"]').classList.add('active')
  overlapFilter  = 'any2'
  consistentOnly = false
  searchQuery    = ''
  sortCol        = null
  sortState      = null
  consensusPage  = 1
  document.getElementById('consistent-only').checked = false
  document.getElementById('gene-search').value       = ''
  updateSortHeaders()
  loadAll()
}

// ── export CSV ────────────────────────────────────────────────
function downloadConsensusCSV() {
  const btn = document.getElementById('download-consensus-btn')
  if (!displayGenes || displayGenes.length === 0) return alert('No genes match current filters.')
  btn.textContent = 'exporting...'
  btn.disabled    = true
  try {
    const rows = displayGenes.map(d => ({
      gene_id:        d.gene_id     || '',
      gene_symbol:    d.gene_symbol || '',
      gene_name:      d.gene_name   || '',
      n_datasets:     d.n_datasets,
      datasets:       Array.isArray(d.datasets_list)
                        ? d.datasets_list.join('; ')
                        : (d.datasets_list || ''),
      consistent_dir: d.consistent_dir ? 'yes' : 'no',
    }))
    const columns = [
      { key:'gene_id',        label:'gene_id' },
      { key:'gene_symbol',    label:'gene_symbol' },
      { key:'gene_name',      label:'gene_name' },
      { key:'n_datasets',     label:'n_datasets' },
      { key:'datasets',       label:'datasets' },
      { key:'consistent_dir', label:'consistent_direction' },
    ]
    const label    = overlapFilter === 'all3'          ? 'all3_datasets'     :
                     overlapFilter === 'infection'     ? 'infection_only'    :
                     overlapFilter === 'alz_infection' ? 'alz_and_infection' : 'any2plus'
    const suffix   = consistentOnly ? '_consistent' : ''
    const search   = searchQuery    ? `_q-${searchQuery}` : ''
    downloadCSV(toCSV(rows, columns), `consensus_genes_${label}${suffix}${search}`)
  } catch (err) { alert(`Export failed: ${err.message}`) }
  finally { btn.textContent = '↓ Export CSV'; btn.disabled = false }
}

init()
