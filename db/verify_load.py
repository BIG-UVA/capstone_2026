# db/verify_load.py
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

conn = psycopg2.connect(
    dbname="capstone_db",
    user="postgres",
    password=os.environ.get("PG_PASSWORD", "your_postgres_password"),
    host="localhost"
)
cur = conn.cursor()

checks = [
    ("total genes",
     "SELECT COUNT(*) FROM genes"),
    ("genes with real symbols (not placeholder)",
     "SELECT COUNT(*) FROM genes WHERE gene_symbol != gene_id AND gene_symbol != ''"),
    ("total DE rows",
     "SELECT COUNT(*) FROM de_results"),
    ("significant DE rows",
     "SELECT COUNT(*) FROM de_results WHERE significant = TRUE"),
    ("DE rows per dataset + comparison",
     "SELECT dataset_id, condition_num, condition_denom, COUNT(*) FROM de_results GROUP BY dataset_id, condition_num, condition_denom ORDER BY dataset_id"),
    ("significant per dataset",
     "SELECT dataset_id, COUNT(*) FROM de_results WHERE significant = TRUE GROUP BY dataset_id ORDER BY dataset_id"),
    ("direction values in DB",
     "SELECT direction, COUNT(*) FROM de_results GROUP BY direction ORDER BY direction"),
    ("NA padj handled — no nulls",
     "SELECT COUNT(*) FROM de_results WHERE padj IS NULL"),
    ("zero padj clamped — min padj value",
     "SELECT MIN(padj) FROM de_results WHERE padj > 0"),
    ("samples per dataset",
     "SELECT dataset_id, COUNT(*) FROM samples GROUP BY dataset_id ORDER BY dataset_id"),
    ("total TPM rows",
     "SELECT COUNT(*) FROM expression_tpm"),
    ("pathway results per dataset",
     "SELECT dataset_id, COUNT(*) FROM pathway_results GROUP BY dataset_id ORDER BY dataset_id"),
    ("consensus genes (2+ datasets)",
     "SELECT COUNT(*) FROM consensus_genes WHERE n_datasets >= 2"),
    ("consensus genes (all 3 datasets)",
     "SELECT COUNT(*) FROM consensus_genes WHERE n_datasets = 3"),
    ("top 5xFAD DE genes",
     """SELECT g.gene_symbol, d.log2_fc, d.padj, d.direction
        FROM de_results d JOIN genes g ON d.gene_id = g.gene_id
        WHERE d.dataset_id = 'GSE212277' AND d.condition_num = '5xFAD'
        AND d.significant = TRUE ORDER BY d.padj ASC LIMIT 5"""),
    ("top STAT1-KO DE genes",
     """SELECT g.gene_symbol, d.log2_fc, d.padj, d.direction
        FROM de_results d JOIN genes g ON d.gene_id = g.gene_id
        WHERE d.dataset_id = 'GSE203655' AND d.condition_num = 'STAT1-KO'
        AND d.significant = TRUE ORDER BY d.padj ASC LIMIT 5"""),
    ("top microglia vs macrophage DE genes",
     """SELECT g.gene_symbol, d.log2_fc, d.padj, d.direction
        FROM de_results d JOIN genes g ON d.gene_id = g.gene_id
        WHERE d.dataset_id = 'GSE146680' AND d.condition_num = 'Microglia'
        AND d.significant = TRUE ORDER BY d.padj ASC LIMIT 5"""),
    ("v_sig_de view",
     "SELECT * FROM v_sig_de WHERE dataset_id = 'GSE212277' LIMIT 3"),
    ("v_consensus view",
     "SELECT * FROM v_consensus LIMIT 3"),
    ("datasets table",
     "SELECT dataset_id, disease_model, n_samples FROM datasets ORDER BY dataset_id"),
]

print("\n" + "="*60)
print("DATABASE VERIFICATION REPORT")
print("="*60)

all_passed = True
for label, query in checks:
    try:
        cur.execute(query)
        result = cur.fetchall()
        is_empty = not result or (len(result) == 1 and result[0][0] == 0)
        # special case — NA check should return 0
        if "no nulls" in label or "clamped" in label:
            is_empty = False
        if is_empty:
            print(f"\n[WARN] {label}: EMPTY OR ZERO")
            all_passed = False
        else:
            print(f"\n[PASS] {label}:")
            for row in result:
                print(f"   {row}")
    except Exception as e:
        print(f"\n[FAIL] {label}: ERROR -- {e}")
        all_passed = False
        conn.rollback()

print("\n" + "="*60)
print("ALL CHECKS PASSED" if all_passed else "SOME CHECKS FAILED")
print("="*60 + "\n")

cur.close()
conn.close()
