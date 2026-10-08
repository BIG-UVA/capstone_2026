// js/api.js
// all fetch calls to FastAPI in one place
// update API_BASE when deploying to Render

const API_BASE = ''

// ── helper ────────────────────────────────────────────────────
async function apiFetch(endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`)
  if (!res.ok) throw new Error(`API error: ${res.status} ${endpoint}`)
  return res.json()
}

// ── datasets ─────────────────────────────────────────────────
async function getDatasets() {
  return apiFetch('/datasets/')
}

// ── gene count (home page stat card) ────────────────────────────
async function getGeneCount() {
  return apiFetch('/genes/count')
}

// ── DE results ───────────────────────────────────────────────
async function getDEResults(datasetId, conditionNum, significantOnly = false) {
  const params = new URLSearchParams({
    dataset_id:       datasetId,
    condition_num:    conditionNum,
    significant_only: significantOnly,
    limit:            20000
  })

  if (significantOnly) {
    params.append('padj_max', '0.05')
  }
  return apiFetch(`/de_results/?${params}`)
}

async function getDESummary(datasetId, conditionNum) {
  return apiFetch(`/de_results/summary?dataset_id=${datasetId}&condition_num=${conditionNum}`)
}

async function getComparisons(datasetId) {
  return apiFetch(`/de_results/comparisons?dataset_id=${datasetId}`)
}

// ── genes ─────────────────────────────────────────────────────
async function searchGenes(query) {
  return apiFetch(`/genes/search?q=${encodeURIComponent(query)}&limit=20`)
}

// ── expression ───────────────────────────────────────────────
async function getExpression(geneId, datasetId = null) {
  const params = datasetId ? `?dataset_id=${datasetId}` : ''
  return apiFetch(`/expression/${geneId}${params}`)
}

// ── pathways ─────────────────────────────────────────────────
async function getPathways(datasetId, database = 'KEGG', topN = 20) {
  return apiFetch(`/pathways/?dataset_id=${datasetId}&database=${database}&top_n=${topN}`)
}

async function getSharedPathways(database = 'KEGG', minDatasets = 2) {
  return apiFetch(`/pathways/shared?database=${database}&min_datasets=${minDatasets}`)
}

async function getPathwayGenes(pathwayId, datasetId) {
  return apiFetch(`/pathways/${encodeURIComponent(pathwayId)}/genes?dataset_id=${datasetId}`)
}

// ── consensus ─────────────────────────────────────────────────
async function getConsensusGenes(minDatasets = 2, consistentOnly = false) {
  return apiFetch(`/consensus/?min_datasets=${minDatasets}&consistent_only=${consistentOnly}`)
}