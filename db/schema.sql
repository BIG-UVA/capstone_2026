-- ============================================================
-- SCHEMA: capstone_db
-- Updated to match actual R script outputs:
--   - GSE212277 (not GSE212310) for Alzheimer's dataset
--   - GSE146680: Microglia vs Macrophage comparison
--   - GSE203655: STAT1-KO vs Control
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── datasets ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS datasets (
    dataset_id      VARCHAR(20) PRIMARY KEY,
    title           TEXT,
    organism        VARCHAR(50) DEFAULT 'Mus musculus',
    seq_type        VARCHAR(20),
    platform        VARCHAR(100),
    disease_model   TEXT,
    cell_type       VARCHAR(50) DEFAULT 'Microglia',
    n_samples       INTEGER,
    geo_link        TEXT,
    date_added      DATE DEFAULT CURRENT_DATE
);

INSERT INTO datasets VALUES
  ('GSE203655',
   'Microglial STAT1-sufficiency promotes resistance to T. gondii',
   'Mus musculus', 'bulk', 'Illumina HiSeq 4000',
   'T. gondii infection - STAT1-KO vs Control microglia',
   'Microglia', 8,
   'https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE203655',
   CURRENT_DATE),
  ('GSE146680',
   'Gasdermin-D IL-1a in microglial T. gondii response',
   'Mus musculus', 'bulk', 'Illumina MiSeq',
   'T. gondii infection - Microglia vs Macrophage',
   'Microglia + Macrophage', 8,
   'https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE146680',
   CURRENT_DATE),
  ('GSE212277',
   'SYK neuroprotective microglial signaling in 5xFAD (bulk subseries of GSE212310)',
   'Mus musculus', 'bulk', 'Illumina HiSeq 4000 + NextSeq 2000',
   '5xFAD Alzheimers model - multiple genotype comparisons',
   'Microglia', 16,
   'https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE212277',
   CURRENT_DATE)
ON CONFLICT DO NOTHING;

-- ── samples ──────────────────────────────────────────────────
-- R script metadata columns: sample, dataset, cell_type, condition, genotype
-- DB stores: sample_id=sample, dataset_id=dataset, condition=genotype, cell_type=cell_type
CREATE TABLE IF NOT EXISTS samples (
    sample_id       VARCHAR(50) PRIMARY KEY,
    dataset_id      VARCHAR(20) REFERENCES datasets(dataset_id),
    condition       VARCHAR(100),   -- stores genotype value e.g. "5xFAD", "STAT1-KO", "WT (Control)"
    cell_type       VARCHAR(50),    -- "Microglia" or "Macrophage"
    replicate_num   INTEGER,        -- NULL if not in metadata
    metadata_json   JSONB           -- for any extra metadata fields
);

-- ── genes ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS genes (
    gene_id         VARCHAR(50) PRIMARY KEY,
    gene_symbol     VARCHAR(50),
    gene_name       TEXT,
    biotype         VARCHAR(50)
);
CREATE INDEX IF NOT EXISTS idx_genes_symbol_trgm
    ON genes USING GIN (gene_symbol gin_trgm_ops);

-- ── de_results ───────────────────────────────────────────────
-- matches DESeq2 + build_results_table() output from DE_wg_working.R
-- direction stored as standard terms (upregulated/downregulated/not_significant)
-- R's descriptive labels ("Up in 5xFAD" etc.) are mapped during loading
CREATE TABLE IF NOT EXISTS de_results (
    result_id       SERIAL PRIMARY KEY,
    gene_id         VARCHAR(50) REFERENCES genes(gene_id),
    dataset_id      VARCHAR(20) REFERENCES datasets(dataset_id),
    condition_num   VARCHAR(100),   -- e.g. "5xFAD", "STAT1-KO", "Microglia"
    condition_denom VARCHAR(100),   -- e.g. "WT (Control)", "Control", "Macrophage"
    base_mean       FLOAT,          -- baseMean from DESeq2
    log2_fc         FLOAT,          -- log2FoldChange, apeglm-shrunk (default display value)
    log2_fc_raw     FLOAT,          -- unshrunk MLE log2FoldChange, for the shrunk/raw toggle
    lfc_se          FLOAT,          -- lfcSE
    pvalue          FLOAT,
    padj            FLOAT,          -- Benjamini-Hochberg adjusted p-value
    significant     BOOLEAN,        -- padj < 0.05 (R script threshold)
    direction       VARCHAR(20),    -- upregulated / downregulated / not_significant
    UNIQUE (gene_id, dataset_id, condition_num, condition_denom)
);
CREATE INDEX IF NOT EXISTS idx_de_gene      ON de_results(gene_id);
CREATE INDEX IF NOT EXISTS idx_de_dataset   ON de_results(dataset_id);
CREATE INDEX IF NOT EXISTS idx_de_padj      ON de_results(padj);
CREATE INDEX IF NOT EXISTS idx_de_direction ON de_results(direction);
CREATE INDEX IF NOT EXISTS idx_de_lfc       ON de_results(log2_fc);
CREATE INDEX IF NOT EXISTS idx_de_comparison ON de_results(dataset_id, condition_num, condition_denom);

-- ── expression_tpm ────────────────────────────────────────────
-- from txi$abundance (tximport) — one row per gene per sample
CREATE TABLE IF NOT EXISTS expression_tpm (
    tpm_id      SERIAL PRIMARY KEY,
    gene_id     VARCHAR(50) REFERENCES genes(gene_id),
    sample_id   VARCHAR(50) REFERENCES samples(sample_id),
    tpm         FLOAT,
    UNIQUE (gene_id, sample_id)
);
CREATE INDEX IF NOT EXISTS idx_tpm_gene   ON expression_tpm(gene_id);
CREATE INDEX IF NOT EXISTS idx_tpm_sample ON expression_tpm(sample_id);

-- ── pathways ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pathways (
    pathway_id   VARCHAR(200) PRIMARY KEY,
    pathway_name TEXT,
    database     VARCHAR(50)   -- KEGG or GO_BP
);

-- ── pathway_results ───────────────────────────────────────────
-- from fgsea output
CREATE TABLE IF NOT EXISTS pathway_results (
    pathway_result_id   SERIAL PRIMARY KEY,
    pathway_id          VARCHAR(200) REFERENCES pathways(pathway_id),
    dataset_id          VARCHAR(20)  REFERENCES datasets(dataset_id),
    method              VARCHAR(20),     -- fgsea
    nes                 FLOAT,           -- normalized enrichment score
    padj                FLOAT,
    overlap_size        INTEGER,         -- number of genes in pathway
    significant         BOOLEAN,         -- padj < 0.05
    direction           VARCHAR(20),     -- activated or suppressed
    leading_edge        TEXT,            -- comma-separated gene_ids from fgsea's leadingEdge column
    UNIQUE (pathway_id, dataset_id)
);
CREATE INDEX IF NOT EXISTS idx_pr_dataset ON pathway_results(dataset_id);
CREATE INDEX IF NOT EXISTS idx_pr_padj    ON pathway_results(padj);

-- ── consensus_genes ───────────────────────────────────────────
-- genes significant in 2+ datasets
CREATE TABLE IF NOT EXISTS consensus_genes (
    gene_id         VARCHAR(50) PRIMARY KEY REFERENCES genes(gene_id),
    n_datasets      INTEGER,
    datasets_list   TEXT[],
    consistent_dir  BOOLEAN
);

-- ── transcript_results ────────────────────────────────────────
-- stretch goal — DTU analysis
CREATE TABLE IF NOT EXISTS transcript_results (
    result_id        SERIAL PRIMARY KEY,
    gene_id          VARCHAR(50) REFERENCES genes(gene_id),
    transcript_id    VARCHAR(50),
    dataset_id       VARCHAR(20) REFERENCES datasets(dataset_id),
    condition_num    VARCHAR(100),
    condition_denom  VARCHAR(100),
    delta_proportion FLOAT,
    adj_pvalue       FLOAT,
    significant      BOOLEAN
);

-- ============================================================
-- VIEWS
-- ============================================================

-- significant DE genes with symbols (volcano plot + DE table)
CREATE OR REPLACE VIEW v_sig_de AS
SELECT
    d.result_id,
    d.dataset_id,
    g.gene_symbol,
    g.gene_name,
    d.gene_id,
    d.condition_num,
    d.condition_denom,
    d.log2_fc,
    d.padj,
    d.base_mean,
    d.direction
FROM de_results d
JOIN genes g ON d.gene_id = g.gene_id
WHERE d.significant = TRUE;

-- consensus genes with symbols
CREATE OR REPLACE VIEW v_consensus AS
SELECT
    c.gene_id,
    g.gene_symbol,
    g.gene_name,
    c.n_datasets,
    c.datasets_list,
    c.consistent_dir
FROM consensus_genes c
JOIN genes g ON c.gene_id = g.gene_id
ORDER BY c.n_datasets DESC;

-- top pathways per dataset
CREATE OR REPLACE VIEW v_top_pathways AS
SELECT
    pr.dataset_id,
    p.pathway_name,
    p.pathway_id,
    p.database,
    pr.nes,
    pr.padj,
    pr.overlap_size,
    pr.direction
FROM pathway_results pr
JOIN pathways p ON pr.pathway_id = p.pathway_id
WHERE pr.significant = TRUE
ORDER BY pr.dataset_id, pr.padj ASC;
