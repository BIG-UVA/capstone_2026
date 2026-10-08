// js/home.js
history.scrollRestoration = 'manual'
window.scrollTo(0, 0)

async function init() {
  try {
    const datasets = await getDatasets()

    document.getElementById('stat-datasets').textContent = datasets.length
    const totalSamples = datasets.reduce((sum, d) => sum + (d.n_samples || 0), 0)
    document.getElementById('stat-samples').textContent = totalSamples

    getGeneCount()
      .then(res => {
        document.getElementById('stat-genes').textContent = res.count.toLocaleString()
      })
      .catch(err => console.error('Failed to load gene count:', err))

    const grid = document.getElementById('dataset-grid')
    grid.innerHTML = datasets.map(d => {
      const isFeatured  = d.n_samples >= 16
      const platformShort = d.platform ? d.platform.split(' ')[1] || d.platform : ''
      const diseaseModel  = (d.disease_model || '').replace(/\u2014/g, '-')

      return `
        <div class="dataset-card ${isFeatured ? 'featured' : ''}"
             onclick="window.location='de-explorer.html?dataset=${d.dataset_id}'">
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <span class="badge badge-primary">${d.seq_type || 'bulk'} RNA-seq</span>
            ${isFeatured ? '<span class="badge badge-success">most samples</span>' : ''}
          </div>
          <div class="ds-id">${d.dataset_id}</div>
          <div class="ds-model">${diseaseModel}</div>
          <div class="ds-meta">
            <div class="ds-meta-item">
              <div class="label">samples</div>
              <div class="value">${d.n_samples}</div>
            </div>
            <div class="ds-meta-item">
              <div class="label">platform</div>
              <div class="value">${platformShort}</div>
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-top:8px;">
            <button class="explore-btn" style="flex:1;min-width:0;"
              onclick="event.stopPropagation();window.location='de-explorer.html?dataset=${d.dataset_id}'">
              Explore →
            </button>
            <button class="explore-btn"
              style="flex:0 0 auto;width:auto;padding:9px 14px;font-size:12px;
                     background:#f8fafc;border-color:#e2e8f0;color:#64748b;white-space:nowrap;"
              onclick="event.stopPropagation();openGEO('${d.dataset_id}','${d.geo_link||''}')"
              title="View raw data on NCBI GEO">
              Raw data ↗
            </button>
          </div>
        </div>
      `
    }).join('')

  } catch (err) {
    console.error('Failed to load datasets:', err)
    document.getElementById('dataset-grid').innerHTML =
      '<p style="color:#c0392b">Failed to load datasets. Is the API running?</p>'
  }
}

function openGEO(datasetId, geoLink) {
  // open GEO page for raw data download
  const url = geoLink ||
    `https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=${datasetId}`
  window.open(url, '_blank')
}

init()
