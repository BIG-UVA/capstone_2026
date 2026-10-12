# db/load_data.py
# loads real R output CSVs into local PostgreSQL
#
# ALL files below go in results/ :
#   genes_reference.csv                              (only after fetch_gene_symbols.py has run once;
#                                                       if absent, placeholder rows are used instead)
#   master_sample_table.csv
#   de_results_5xFAD_vs_WT.csv
#   de_results_STAT1KO_vs_Control.csv
#   de_results_Microglia_vs_Macrophage.csv
#   de_comparison_summary.csv                        (reference only, not loaded)
#   expression_tpm.csv
#   fgsea_{KEGG,HALLMARK,GO_BP,GO_MF,REACTOME,WIKIPATHWAYS}_{GSE146680,GSE203655,GSE212277}.csv
#
# Safe to re-run: every table has a real UNIQUE constraint (see schema.sql) so
# "ON CONFLICT DO NOTHING" actually does something now instead of duplicating rows.

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
import os
from dotenv import load_dotenv

load_dotenv()

DB_CONFIG = {
    "dbname":   "capstone_db",
    "user":     "postgres",
    "password": os.environ.get("PG_PASSWORD", "your_postgres_password"),
    "host":     "localhost",
    "port":     5432
}

# ── single results folder ───────────────────────────────────────
# results/ lives at the project root, one level up from this script (db/)
SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
RESULTS_DIR = os.path.join(SCRIPT_DIR, "..", "results")

PATHWAY_COLLECTIONS = ["KEGG", "HALLMARK", "GO_BP", "GO_MF", "REACTOME", "WIKIPATHWAYS"]
DATASET_IDS = ["GSE146680", "GSE203655", "GSE212277"]

# direction mapping — R labels → DB standard terms
DIRECTION_MAP = {
    "Up in 5xFAD":       "upregulated",
    "Down in 5xFAD":     "downregulated",
    "Up in STAT1-KO":    "upregulated",
    "Down in STAT1-KO":  "downregulated",
    "Up in Microglia":   "upregulated",
    "Up in Macrophage":  "downregulated",
    "NS":                "not_significant",
}

# DE file specs
DE_FILES = [
    {
        "file":           "de_results_5xFAD_vs_WT.csv",
        "dataset_id":     "GSE212277",
        "condition_num":  "5xFAD",
        "condition_denom":"WT (Control)",
    },
    {
        "file":           "de_results_STAT1KO_vs_Control.csv",
        "dataset_id":     "GSE203655",
        "condition_num":  "STAT1-KO",
        "condition_denom":"Control",
    },
    {
        "file":           "de_results_Microglia_vs_Macrophage.csv",
        "dataset_id":     "GSE146680",
        "condition_num":  "Microglia",
        "condition_denom":"Macrophage",
    },
]

conn = psycopg2.connect(**DB_CONFIG)
cur  = conn.cursor()

# ── 1. load genes ─────────────────────────────────────────────
# genes_reference.csv: gene_id, gene_symbol, gene_name, biotype
# (produced by fetch_gene_symbols.py). If it's not there yet, DE loading
# below will still insert placeholder rows so foreign keys don't break.
print("Loading genes...")
genes_path = f"{RESULTS_DIR}/genes_reference.csv"
if not os.path.exists(genes_path):
    print(f"  {genes_path} not found — skipping for now, "
          f"run fetch_gene_symbols.py after this to fill in real symbols")
else:
    df = pd.read_csv(genes_path)
    execute_values(cur,
        """INSERT INTO genes (gene_id, gene_symbol, gene_name, biotype) VALUES %s
           ON CONFLICT (gene_id) DO UPDATE SET
             gene_symbol = EXCLUDED.gene_symbol,
             gene_name   = EXCLUDED.gene_name,
             biotype     = EXCLUDED.biotype""",
        [tuple(r) for r in df[["gene_id","gene_symbol","gene_name","biotype"]].values]
    )
    conn.commit()
    print(f"  {len(df)} genes loaded from {genes_path}")

# ── 2. load samples ───────────────────────────────────────────
# master_sample_table.csv has real metadata for all 32 samples across all
# 3 datasets. condition = genotype_short (cleanest match to DE condition
# labels); everything else goes into metadata_json for flexibility.
print("\nLoading samples...")
samples_path = f"{RESULTS_DIR}/master_sample_table.csv"
if not os.path.exists(samples_path):
    print(f"  WARNING: {samples_path} not found — skipping")
else:
    import json
    df = pd.read_csv(samples_path)
    extra_cols = ["condition", "genotype", "comparison_group", "strain", "sex",
                  "timepoint", "treatment", "disease_model", "syk_status"]
    extra_cols = [c for c in extra_cols if c in df.columns]

    rows = []
    for _, row in df.iterrows():
        metadata = {c: row[c] for c in extra_cols if pd.notna(row[c])}
        rows.append((
            row["sample"],
            row["dataset"],
            row["genotype_short"],
            row["cell_type"],
            None,  # replicate_num — not in metadata, leave NULL
            json.dumps(metadata),
        ))
    execute_values(cur,
        """INSERT INTO samples (sample_id, dataset_id, condition, cell_type, replicate_num, metadata_json)
           VALUES %s
           ON CONFLICT (sample_id) DO UPDATE SET
             condition     = EXCLUDED.condition,
             cell_type     = EXCLUDED.cell_type,
             metadata_json = EXCLUDED.metadata_json""",
        rows
    )
    conn.commit()
    for ds in DATASET_IDS:
        n = (df["dataset"] == ds).sum()
        print(f"  {ds}: {n} samples loaded")

# ── 3. load DE results ────────────────────────────────────────
print("\nLoading DE results...")

all_de_rows = []
for spec in DE_FILES:
    path = f"{RESULTS_DIR}/{spec['file']}"
    if not os.path.exists(path):
        print(f"  WARNING: {path} not found — skipping")
        continue

    df = pd.read_csv(path)
    print(f"  {spec['file']}: {len(df)} rows read")

    # ── handle edge cases from real DESeq2 output ─────────────
    df["significant"] = df["significant"].astype(str).str.strip().str.upper().map({"TRUE": True, "FALSE": False}).fillna(False)
    df["pvalue"] = pd.to_numeric(df["pvalue"], errors="coerce").fillna(1.0)
    df["padj"]   = pd.to_numeric(df["padj"],   errors="coerce").fillna(1.0)
    df["padj"]   = df["padj"].clip(lower=1e-300)
    df["pvalue"] = df["pvalue"].clip(lower=1e-300)
    df["direction_db"] = df["direction"].map(DIRECTION_MAP).fillna("not_significant")

    # insert placeholder gene rows for any gene_id not yet in genes table
    cur.execute("SELECT gene_id FROM genes")
    existing = set(r[0] for r in cur.fetchall())
    new_gene_ids = set(df["gene_id"].tolist()) - existing
    if new_gene_ids:
        execute_values(cur,
            """INSERT INTO genes (gene_id, gene_symbol, gene_name, biotype)
               VALUES %s ON CONFLICT DO NOTHING""",
            [(gid, gid, "", "unknown") for gid in new_gene_ids]
        )
        conn.commit()
        print(f"    inserted {len(new_gene_ids)} placeholder gene rows")

    rows = []
    has_raw = "log2FoldChange_raw" in df.columns
    for _, row in df.iterrows():
        rows.append((
            row["gene_id"],
            spec["dataset_id"],
            spec["condition_num"],
            spec["condition_denom"],
            float(row["baseMean"])         if pd.notna(row["baseMean"])       else None,
            float(row["log2FoldChange"])   if pd.notna(row["log2FoldChange"]) else None,
            float(row["log2FoldChange_raw"]) if has_raw and pd.notna(row["log2FoldChange_raw"]) else None,
            float(row["lfcSE"])            if pd.notna(row["lfcSE"])          else None,
            float(row["pvalue"]),
            float(row["padj"]),
            bool(row["significant"]),
            row["direction_db"],
        ))

    execute_values(cur,
        """INSERT INTO de_results
           (gene_id, dataset_id, condition_num, condition_denom,
            base_mean, log2_fc, log2_fc_raw, lfc_se, pvalue, padj, significant, direction)
           VALUES %s
           ON CONFLICT (gene_id, dataset_id, condition_num, condition_denom) DO UPDATE SET
             base_mean = EXCLUDED.base_mean, log2_fc = EXCLUDED.log2_fc,
             log2_fc_raw = EXCLUDED.log2_fc_raw,
             lfc_se = EXCLUDED.lfc_se, pvalue = EXCLUDED.pvalue, padj = EXCLUDED.padj,
             significant = EXCLUDED.significant, direction = EXCLUDED.direction""",
        rows
    )
    conn.commit()
    sig = df["significant"].sum()
    print(f"    {len(rows)} rows written, {sig} significant")
    all_de_rows.append(df.assign(
        dataset_id    = spec["dataset_id"],
        direction_db  = df["direction_db"],
        condition_num = spec["condition_num"],
    ))

# ── 4. load TPM expression ────────────────────────────────────
# expression_tpm.csv is already long format: gene_id, sample_id, tpm
# (matches the table directly — no per-dataset split or melt needed)
print("\nLoading TPM expression...")
tpm_path = f"{RESULTS_DIR}/expression_tpm.csv"
if not os.path.exists(tpm_path):
    print(f"  WARNING: {tpm_path} not found — skipping")
else:
    df = pd.read_csv(tpm_path, usecols=["gene_id", "sample_id", "tpm"])
    df = df[df["tpm"] > 0]

    # insert placeholder gene rows for any gene_id not yet in genes table
    # (expression_tpm.csv covers more low-expression genes than the DE results do)
    cur.execute("SELECT gene_id FROM genes")
    existing = set(r[0] for r in cur.fetchall())
    new_gene_ids = set(df["gene_id"].unique()) - existing
    if new_gene_ids:
        execute_values(cur,
            """INSERT INTO genes (gene_id, gene_symbol, gene_name, biotype)
               VALUES %s ON CONFLICT DO NOTHING""",
            [(gid, gid, "", "unknown") for gid in new_gene_ids]
        )
        conn.commit()
        print(f"    inserted {len(new_gene_ids)} placeholder gene rows")

    execute_values(cur,
        """INSERT INTO expression_tpm (gene_id, sample_id, tpm) VALUES %s
           ON CONFLICT (gene_id, sample_id) DO UPDATE SET tpm = EXCLUDED.tpm""",
        [tuple(r) for r in df[["gene_id","sample_id","tpm"]].values]
    )
    conn.commit()
    print(f"  {len(df)} TPM rows written")

# ── 5. load pathway results ───────────────────────────────────
print("\nLoading pathway results...")
for ds in DATASET_IDS:
    for collection in PATHWAY_COLLECTIONS:
        path = f"{RESULTS_DIR}/fgsea_{collection}_{ds}.csv"
        if not os.path.exists(path):
            print(f"  WARNING: {path} not found — skipping")
            continue
        df = pd.read_csv(path)
        execute_values(cur,
            "INSERT INTO pathways (pathway_id, pathway_name, database) VALUES %s ON CONFLICT DO NOTHING",
            [(row["pathway"], row["pathway"], collection) for _, row in df.iterrows()]
        )
        df["dataset_id"]  = ds
        df["method"]      = "fgsea"
        df["significant"] = df["padj"] < 0.05
        df["direction"]   = df["NES"].apply(lambda x: "activated" if x > 0 else "suppressed")
        execute_values(cur,
            """INSERT INTO pathway_results
               (pathway_id, dataset_id, method, nes, padj, overlap_size, significant, direction, leading_edge)
               VALUES %s
               ON CONFLICT (pathway_id, dataset_id) DO UPDATE SET
                 nes = EXCLUDED.nes, padj = EXCLUDED.padj,
                 overlap_size = EXCLUDED.overlap_size,
                 significant = EXCLUDED.significant, direction = EXCLUDED.direction,
                 leading_edge = EXCLUDED.leading_edge""",
            [(r["pathway"], r["dataset_id"], r["method"],
              r["NES"], r["padj"], r.get("size", None),
              r["significant"], r["direction"],
              r.get("leadingEdge", None))
             for _, r in df.iterrows()]
        )
        conn.commit()
        print(f"  {ds} {collection}: {len(df)} pathways written")

# ── 6. load consensus genes ───────────────────────────────────
print("\nLoading consensus genes...")
if all_de_rows:
    de_all = pd.concat(all_de_rows, ignore_index=True)
    sig_all = de_all[de_all["significant"] == True]
    grouped = sig_all.groupby("gene_id").agg(
        n_datasets    = ("dataset_id", "nunique"),
        datasets_list = ("dataset_id", lambda x: list(x.unique())),
    ).reset_index()
    dir_check = sig_all.groupby("gene_id")["direction_db"].nunique()
    grouped["consistent_dir"] = grouped["gene_id"].map(lambda g: dir_check.get(g, 1) == 1)
    filtered = grouped[grouped["n_datasets"] >= 2]
    for _, row in filtered.iterrows():
        cur.execute(
            """INSERT INTO consensus_genes (gene_id, n_datasets, datasets_list, consistent_dir)
               VALUES (%s, %s, %s, %s)
               ON CONFLICT (gene_id) DO UPDATE SET
                 n_datasets = EXCLUDED.n_datasets,
                 datasets_list = EXCLUDED.datasets_list,
                 consistent_dir = EXCLUDED.consistent_dir""",
            (row["gene_id"], int(row["n_datasets"]),
             row["datasets_list"], bool(row["consistent_dir"]))
        )
    conn.commit()
    print(f"  {len(filtered)} consensus genes (in 2+ datasets)")
else:
    print("  skipped — no DE data loaded")

cur.close()
conn.close()
print("\nAll data loaded successfully.")
