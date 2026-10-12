# fetch_gene_symbols.py
# fetches gene symbols and names from Ensembl REST API
# for all Ensembl IDs currently in the genes table that don't have a
# real symbol yet (gene_symbol == gene_id means still a placeholder)
# run from capstone root:  python fetch_gene_symbols.py
#
# saves to results/genes_reference.csv and updates the genes table directly

import requests
from requests.adapters import HTTPAdapter, Retry
import psycopg2
import pandas as pd
import os
import time
from dotenv import load_dotenv

load_dotenv()

DB_CONFIG = {
    "dbname":   "capstone_db",
    "user":     "postgres",
    "password": os.environ.get("PG_PASSWORD", ""),
    "host":     "localhost",
    "port":     5432
}

ENSEMBL_URL = "https://rest.ensembl.org/lookup/id"
BATCH_SIZE  = 500          # smaller batches = faster individual requests, less to lose on a timeout
REQUEST_TIMEOUT = 120       # generous timeout — Ensembl can be slow under load
MAX_RETRIES_PER_BATCH = 4
SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
OUT_FILE    = os.path.join(SCRIPT_DIR, "results", "genes_reference.csv")

# session with automatic retry on connection errors / 5xx / 429
session = requests.Session()
retries = Retry(
    total=3,
    backoff_factor=2,                      # 2s, 4s, 8s between urllib3-level retries
    status_forcelist=[429, 500, 502, 503, 504],
    allowed_methods=["POST"],
)
session.mount("https://", HTTPAdapter(max_retries=retries))

# ── get Ensembl IDs still needing lookup ────────────────────────
# only fetch genes that don't have a real symbol yet (gene_symbol == gene_id)
# so re-running this doesn't waste time re-querying genes already resolved
print("Fetching unresolved Ensembl IDs from database...")
conn = psycopg2.connect(**DB_CONFIG)
cur  = conn.cursor()
cur.execute("SELECT gene_id FROM genes WHERE gene_symbol = gene_id OR gene_symbol IS NULL OR gene_symbol = ''")
all_ids = [r[0] for r in cur.fetchall()]
cur.close()
conn.close()
print(f"  {len(all_ids)} Ensembl IDs still need real symbols")

if not all_ids:
    print("Nothing to do — every gene already has a resolved symbol.")
    raise SystemExit(0)

# ── batch query Ensembl REST API ──────────────────────────────
results = []
batches = [all_ids[i:i+BATCH_SIZE] for i in range(0, len(all_ids), BATCH_SIZE)]
print(f"  querying Ensembl in {len(batches)} batches of up to {BATCH_SIZE}...")

for i, batch in enumerate(batches):
    print(f"  batch {i+1}/{len(batches)} ({len(batch)} IDs)...", end=" ", flush=True)

    attempt = 0
    while True:
        attempt += 1
        try:
            resp = session.post(
                ENSEMBL_URL,
                headers={"Content-Type": "application/json", "Accept": "application/json"},
                json={"ids": batch},
                timeout=REQUEST_TIMEOUT
            )
            if resp.status_code == 200:
                data = resp.json()
                for gene_id in batch:
                    info = data.get(gene_id)
                    if info is None:
                        results.append({
                            "gene_id":     gene_id,
                            "gene_symbol": gene_id,   # fallback to Ensembl ID
                            "gene_name":   "",
                            "biotype":     "unknown"
                        })
                    else:
                        results.append({
                            "gene_id":     gene_id,
                            "gene_symbol": info.get("display_name") or info.get("id", gene_id),
                            "gene_name":   info.get("description", "").split("[")[0].strip(),
                            "biotype":     info.get("biotype", "unknown")
                        })
                print(f"OK ({len(data)} returned)")
                break
            else:
                print(f"HTTP {resp.status_code}", end=" ")
                raise requests.exceptions.RequestException(f"status {resp.status_code}")

        except Exception as e:
            if attempt <= MAX_RETRIES_PER_BATCH:
                wait = 5 * attempt
                print(f"— {e}, retrying in {wait}s (attempt {attempt}/{MAX_RETRIES_PER_BATCH})...", end=" ", flush=True)
                time.sleep(wait)
                continue
            else:
                print(f"— giving up after {MAX_RETRIES_PER_BATCH} retries, filling with placeholders")
                for gene_id in batch:
                    results.append({
                        "gene_id":     gene_id,
                        "gene_symbol": gene_id,
                        "gene_name":   "",
                        "biotype":     "unknown"
                    })
                break
    # be polite to Ensembl between batches
    time.sleep(0.5)

# ── merge with any existing genes_reference.csv rows ────────────
new_df = pd.DataFrame(results)
if os.path.exists(OUT_FILE):
    old_df = pd.read_csv(OUT_FILE)
    df = pd.concat([old_df, new_df], ignore_index=True).drop_duplicates(subset="gene_id", keep="last")
else:
    df = new_df.drop_duplicates(subset="gene_id")

os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
df.to_csv(OUT_FILE, index=False)
print(f"\nSaved {len(df)} total gene records to {OUT_FILE}")

has_symbol = df[df["gene_symbol"] != df["gene_id"]]
print(f"  {len(has_symbol)} genes with real symbols ({len(df)-len(has_symbol)} still using Ensembl ID as fallback)")

# ── update DB directly ────────────────────────────────────────
print("\nUpdating genes table in database...")
conn = psycopg2.connect(**DB_CONFIG)
cur  = conn.cursor()
updated = 0
for _, row in new_df.iterrows():
    cur.execute(
        """UPDATE genes
           SET gene_symbol = %s,
               gene_name   = %s,
               biotype     = %s
           WHERE gene_id = %s""",
        (row["gene_symbol"], row["gene_name"], row["biotype"], row["gene_id"])
    )
    updated += cur.rowcount
conn.commit()
cur.close()
conn.close()
print(f"  {updated} rows updated in genes table")
print("\nDone. Restart the API for changes to take effect.")
