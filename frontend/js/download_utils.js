// js/download_utils.js
// CSV download utilities

function toCSV(data, columns) {
  if (!data || data.length === 0) return ''
  const cols = columns || Object.keys(data[0]).map(k => ({ key: k, label: k }))
  const header = cols.map(c => `"${c.label}"`).join(',')
  const rows   = data.map(row =>
    cols.map(c => {
      const val = row[c.key]
      if (val === null || val === undefined) return ''
      const str = String(val)
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"` : str
    }).join(',')
  )
  return [header, ...rows].join('\n')
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `${filename}.csv`
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

function triggerDownload(btn, csv, filename) {
  if (!csv) return
  const original = btn.innerHTML
  btn.innerHTML = '⏳ downloading...'
  btn.disabled  = true
  downloadCSV(csv, filename)
  setTimeout(() => { btn.innerHTML = original; btn.disabled = false }, 1500)
}

// DE results columns
const DE_COLUMNS = [
  { key:'gene_id',         label:'gene_id' },
  { key:'gene_symbol',     label:'gene_symbol' },
  { key:'gene_name',       label:'gene_name' },
  { key:'log2_fc',         label:'log2FoldChange' },
  { key:'padj',            label:'padj' },
  { key:'pvalue',          label:'pvalue' },
  { key:'base_mean',       label:'baseMean' },
  { key:'lfc_se',          label:'lfcSE' },
  { key:'direction',       label:'direction' },
  { key:'significant',     label:'significant' },
  { key:'dataset_id',      label:'dataset_id' },
  { key:'condition_num',   label:'condition_num' },
  { key:'condition_denom', label:'condition_denom' },
]

// Pathway columns
const PATHWAY_COLUMNS = [
  { key:'pathway_name',  label:'pathway_name' },
  { key:'nes',           label:'NES' },
  { key:'padj',          label:'padj' },
  { key:'overlap_size',  label:'overlap_size' },
  { key:'direction',     label:'direction' },
  { key:'database',      label:'database' },
  { key:'dataset_id',    label:'dataset_id' },
]

const SHARED_COLUMNS = [
  { key:'pathway_name', label:'pathway_name' },
  { key:'database',     label:'database' },
  { key:'n_datasets',   label:'n_datasets' },
  { key:'mean_nes',     label:'mean_NES' },
  { key:'mean_padj',    label:'mean_padj' },
  { key:'datasets',     label:'datasets' },
]

const CONSENSUS_COLUMNS = [
  { key:'gene_id',        label:'gene_id' },
  { key:'gene_symbol',    label:'gene_symbol' },
  { key:'gene_name',      label:'gene_name' },
  { key:'n_datasets',     label:'n_datasets' },
  { key:'datasets_str',   label:'datasets' },
  { key:'consistent_dir', label:'consistent_direction' },
]
