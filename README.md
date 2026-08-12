# Microglial Transcriptomics Explorer

An integrative analysis platform for exploring differential gene expression, pathway enrichment, and consensus signals across three microglial RNA-seq datasets studying neurodegeneration.

Built as a UVA Data Science capstone project in collaboration with the Harrislab (UVA Neuroscience).

---

## Datasets

| Dataset | Description | Comparison | Samples |
|---------|-------------|------------|---------|
| GSE203655 | T. gondii infection — microglia | STAT1-KO vs Control | 8 |
| GSE146680 | T. gondii infection — microglia vs macrophage | Microglia vs Macrophage | 8 |
| GSE212277 | 5xFAD Alzheimer's model | 5xFAD vs WT (Control) | 16 |

Raw data available on [NCBI GEO](https://www.ncbi.nlm.nih.gov/geo/).

---

## Project Structure

```
capstone/
├── api/                          ← FastAPI REST API
│   ├── main.py
│   ├── database.py
│   ├── requirements.txt
│   └── routers/
│       ├── datasets.py
│       ├── de_results.py
│       ├── expression.py
│       ├── genes.py
│       ├── pathways.py
│       └── consensus.py
├── db/
│   ├── schema.sql               ← PostgreSQL schema
│   ├── load_data.py             ← loads everything in results/ into the database
│   └── verify_load.py           ← optional — prints row counts / spot checks
├── frontend/                    ← plain HTML/CSS/JS frontend
│   ├── index.html               ← home page
│   ├── de-explorer.html         ← differential expression explorer
│   ├── pathways.html            ← pathway analysis
│   ├── consensus.html           ← consensus genes
│   ├── heatmap.html             ← gene explorer (log2FC/TPM heatmaps + boxplot)
│   ├── style.css
│   └── js/
│       ├── api.js
│       ├── home.js
│       ├── de-explorer.js
│       ├── pathways.js
│       ├── consensus.js
│       ├── heatmap.js
│       └── download_utils.js
├── analysis/                    ← R pipeline + setup notebooks
├── results/                     ← all real R pipeline outputs — gitignored, see below
├── db_dump/                     ← optional — pg_dump snapshots for quick sharing, gitignored
├── fetch_gene_symbols.py        ← enriches gene_id → gene_symbol/gene_name via Ensembl REST API
├── .env                         ← gitignored — your local credentials, never share this file directly
├── .env.example                 ← safe-to-share template — copy this to .env and fill in your own password
└── .gitignore
```

### What goes in `results/`

Everything the R pipeline (`de_results_5xFAD_vs_WT.csv`, `genes_reference.csv`, etc.) produces goes directly in `results/` — this is the one folder `load_data.py` reads from:

- `master_sample_table.csv`
- `de_results_5xFAD_vs_WT.csv`, `de_results_STAT1KO_vs_Control.csv`, `de_results_Microglia_vs_Macrophage.csv`
- `expression_tpm.csv`
- `fgsea_{KEGG,HALLMARK,GO_BP,GO_MF,REACTOME,WIKIPATHWAYS}_{GSE146680,GSE203655,GSE212277}.csv` (18 files)
- `genes_reference.csv` — produced by `fetch_gene_symbols.py`, not required before the first `load_data.py` run
- `de_comparison_summary.csv` — reference only, not loaded into the database

`results/` is gitignored, it's regenerated data output, not source code, and too large to keep in the repo. That's what Quick Setup below is for: getting that data to a teammate without git.

---

## Prerequisites

You need three things installed before starting:

- **Python 3.10+**
- **PostgreSQL 16**
- **VS Code** (recommended) or any code editor

---

## Quick Setup (Sharing This Project)

If you're picking up a zip from a teammate instead of starting from an empty repo, start here. There are two kinds of zip you might receive — check with whoever sent it, or look for a `db_dump/` folder to tell them apart.

### If you received a database snapshot (a `.dump` file)

This is the fast path — the data's already loaded, you just need to restore it.

1. Install PostgreSQL and VS Code (see Full Setup Steps 1–2 below if you haven't already)
2. Create the database and restore the snapshot:
   ```bash
   psql -U postgres -c "CREATE DATABASE capstone_db;"
   pg_restore -U postgres -d capstone_db db_dump\capstone_db.dump
   ```
3. Copy `.env.example` to `.env` and fill in your own Postgres password (see Step 7 in Full Setup below)
4. Set up your virtual environment and install packages (Full Setup Steps 4–5)
5. Skip straight to **Running the App** — no need to run `load_data.py` or `fetch_gene_symbols.py`, the data's already there

### If you received the full project folder

You have everything, including `results/`, so you'll run the whole pipeline yourself. Follow **Full Setup — Windows** or **Full Setup — Mac** below from the top.

### Creating a zip to send (for whoever's sharing)

**Database snapshot package** — smaller, faster for the other person, good for "just let me explore the app":
```powershell
cd C:\Users\shriy\Documents\capstone
pg_dump -U postgres -d capstone_db -F c -f db_dump\capstone_db.dump
robocopy . ..\capstone_share_dump /E /XD venv .git logs __pycache__ results analysis db /XF .env fetch_gene_symbols.py generate_dummy_data.py
Compress-Archive -Path ..\capstone_share_dump\* -DestinationPath ..\capstone_db_snapshot.zip
```

**Full project package** — everything needed to run the pipeline from scratch, including `results/`:
```powershell
cd C:\Users\shriy\Documents\capstone
robocopy . ..\capstone_share_full /E /XD venv .git logs __pycache__ db_dump /XF .env
Compress-Archive -Path ..\capstone_share_full\* -DestinationPath ..\capstone_full_setup.zip
```

`robocopy` reports success with exit code `1`, not `0` — if PowerShell shows a nonzero code after it runs, that's normal, not an error.

Either way, never include your real `.env` — both commands above exclude it automatically, and `.env.example` is what ships instead.

---

## Full Setup — Windows

### 1. Install PostgreSQL

1. Go to [postgresql.org/download/windows](https://www.postgresql.org/download/windows/)
2. Download and run the EDB installer
3. During installation set a password — write it down
4. Leave port as `5432`
5. After install add PostgreSQL to your PATH:
   - Search "environment variables" in Windows search
   - Edit System Environment Variables → Environment Variables
   - Under System Variables find **Path** → double-click → New
   - Add: `C:\Program Files\PostgreSQL\16\bin`
   - Click OK → OK → OK
6. Open a new Command Prompt and verify:
   ```
   psql -U postgres
   ```
   Enter your password — you should see `postgres=#`
   Type `\q` to exit

### 2. Install VS Code

1. Download from [code.visualstudio.com](https://code.visualstudio.com)
2. Install with all defaults
3. Open VS Code → Extensions → install:
   - **Python** by Microsoft
   - **Pylance** by Microsoft
   - **Live Server** by Ritwick Dey

### 3. Clone or open the project

If you have the folder already:
- VS Code → **File** → **Open Folder** → select the `capstone` folder

If cloning from GitHub:
```bash
git clone https://github.com/shriyakuruba/capstone_2026.git
cd capstone_2026
```

### 4. Create virtual environment

In VS Code terminal (Ctrl+`):
```bash
python -m venv venv
venv\Scripts\activate
```
You should see `(venv)` at the start of the line.

### 5. Install Python packages

```bash
pip install pandas psycopg2-binary numpy sqlalchemy fastapi uvicorn requests python-dotenv
```

### 6. Create the database

```bash
psql -U postgres -c "CREATE DATABASE capstone_db;"
psql -U postgres -d capstone_db -f db\schema.sql
```

### 7. Create your .env file

Copy `.env.example` to `.env` in the capstone root folder, then fill in your password:
```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/capstone_db
PG_PASSWORD=YOUR_PASSWORD
API_BASE_URL=http://localhost:8000
```
Replace `YOUR_PASSWORD` with the PostgreSQL password you set during install. Both `DATABASE_URL` and `PG_PASSWORD` need to match — the API reads `DATABASE_URL`, the loader scripts read `PG_PASSWORD`.

`.env` is gitignored and should never be committed or shared. `.env.example` is the placeholder version that's safe to include if you're sending this project to someone else.

### 8. Load the data

Make sure `results/` contains the files listed above (see "What goes in `results/`"), then:
```bash
python db\load_data.py
python fetch_gene_symbols.py
```
`fetch_gene_symbols.py` looks up real gene symbols/names via the Ensembl REST API for any gene still showing a placeholder — this can take a few minutes depending on how many genes need resolving. It's safe to re-run if it gets interrupted; it only re-queries genes that still need a real symbol.

Optionally, verify everything landed:
```bash
python db\verify_load.py
```

---

## Full Setup — Mac

### 1. Install PostgreSQL

**Option A — using Homebrew (recommended):**
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install postgresql@16
brew services start postgresql@16
```

Add to PATH (add this line to `~/.zshrc` or `~/.bash_profile`):
```bash
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
```
Then reload:
```bash
source ~/.zshrc
```

Verify:
```bash
psql postgres
```
You should see `postgres=#`. Type `\q` to exit.

**Option B — using Postgres.app:**
1. Download from [postgresapp.com](https://postgresapp.com)
2. Move to Applications and open it
3. Click **Initialize** — PostgreSQL starts automatically
4. Add to PATH — follow the instructions on the Postgres.app website
5. Verify with `psql postgres` in Terminal

### 2. Install VS Code

1. Download from [code.visualstudio.com](https://code.visualstudio.com)
2. Install it — drag to Applications
3. Open VS Code → Extensions (Cmd+Shift+X) → install:
   - **Python** by Microsoft
   - **Pylance** by Microsoft
   - **Live Server** by Ritwick Dey

### 3. Clone or open the project

If you have the folder already:
- VS Code → **File** → **Open Folder** → select the `capstone` folder

If cloning from GitHub:
```bash
git clone https://github.com/shriyakuruba/capstone_2026.git
cd capstone_2026
```

### 4. Create virtual environment

In VS Code terminal (Ctrl+`):
```bash
python3 -m venv venv
source venv/bin/activate
```
You should see `(venv)` at the start of the line.

### 5. Install Python packages

```bash
pip install pandas psycopg2-binary numpy sqlalchemy fastapi uvicorn requests python-dotenv
```

If psycopg2-binary fails on Mac:
```bash
pip install psycopg2-binary --only-binary :all:
```

### 6. Create the database

```bash
psql postgres -c "CREATE DATABASE capstone_db;"
psql capstone_db -f db/schema.sql
```

Note: on Mac with Homebrew you connect as your system user, not postgres:
```bash
psql postgres
```

### 7. Create your .env file

Copy `.env.example` to `.env` in the capstone root folder, then fill in your details:

**Mac with Homebrew or Postgres.app (no password by default):**
```
DATABASE_URL=postgresql://YOUR_MAC_USERNAME@localhost:5432/capstone_db
PG_PASSWORD=
API_BASE_URL=http://localhost:8000
```

Replace `YOUR_MAC_USERNAME` with your Mac username (run `whoami` in terminal to find it).

`.env` is gitignored and should never be committed or shared. `.env.example` is the placeholder version that's safe to include if you're sending this project to someone else.

### 8. Load the data

Make sure `results/` contains the files listed above (see "What goes in `results/`"), then:
```bash
python3 db/load_data.py
python3 fetch_gene_symbols.py
```
`fetch_gene_symbols.py` looks up real gene symbols/names via the Ensembl REST API for any gene still showing a placeholder — this can take a few minutes depending on how many genes need resolving. It's safe to re-run if it gets interrupted; it only re-queries genes that still need a real symbol.

Optionally, verify everything landed:
```bash
python3 db/verify_load.py
```

---

## Running the App

You need two terminal tabs running simultaneously.

### Terminal tab 1 — start the API

**Windows:**
```bash
venv\Scripts\activate
cd api
uvicorn main:app --host 0.0.0.0 --port 8000
```

**Mac:**
```bash
source venv/bin/activate
cd api
uvicorn main:app --host 0.0.0.0 --port 8000
```

You should see:
```
Uvicorn running on http://0.0.0.0:8000
Application startup complete.
```

Verify the API is working by opening:
```
http://localhost:8000/docs
```

### Terminal tab 2 — open the frontend

**Option A — VS Code Live Server (easiest, recommended):**
1. In VS Code left sidebar find `frontend/index.html`
2. Right-click → **Open with Live Server**
3. Browser opens automatically at `http://127.0.0.1:5500/frontend/index.html`
4. Pages auto-reload when you save any file

**Option B — Python simple server:**

Windows:
```bash
cd frontend
python -m http.server 5500
```

Mac:
```bash
cd frontend
python3 -m http.server 5500
```

Then open `http://localhost:5500` in your browser.

**Option C — Node.js http-server (if you have Node installed):**
```bash
npm install -g http-server
cd frontend
http-server -p 5500
```

Then open `http://localhost:5500` in your browser.

**Option D — open HTML files directly (no server needed):**

Just double-click `frontend/index.html` in File Explorer (Windows) or Finder (Mac). The app will open in your browser.

> ⚠️ Note: if you open files directly (Option D) some browsers block fetch requests to localhost for security reasons. If the app loads but shows no data, use Live Server or the Python server instead.

---

## Verifying Everything Works

With the API running and frontend open:

1. Home page loads with 3 dataset cards, and **genes analyzed** shows a real number (not `—`)
2. Click **Explore →** on any card — should navigate to DE Explorer
3. Volcano plot loads with colored dots
4. DE Explorer sidebar has a **log2FC estimate** toggle (Shrunk / Raw) — switching it updates the volcano plot, table column, and gene-info card
5. Click a dot — expression chart loads below
6. Click **Pathway Analysis** in navbar — dot plot loads, and the **Gene Set Database** toggle shows all 6 options (KEGG, GO Biological Process, GO Molecular Function, Hallmark, Reactome, WikiPathways)
7. Click **Consensus Genes** — gene table loads
8. Click **Gene Explorer** → Boxplot tab — has a **Log scale / Linear scale** toggle for the TPM axis
9. **↓ Export CSV** downloads a CSV file
10. **↺ Reset filters** clears all filters

---

## API Reference

Interactive API documentation available at `http://localhost:8000/docs` when the API is running.

| Endpoint | Description |
|----------|-------------|
| `GET /datasets` | List all datasets |
| `GET /de_results` | DE results with filters (includes both `log2_fc` shrunk and `log2_fc_raw`) |
| `GET /de_results/summary` | Summary stats for a comparison |
| `GET /de_results/comparisons` | Available comparisons for a dataset |
| `GET /genes/search?q=` | Fuzzy gene symbol search |
| `GET /genes/count` | Total genes in the database — powers the home page stat |
| `GET /genes/{gene_id}` | DE stats for one gene across all datasets |
| `GET /expression/{gene_id}` | TPM expression per sample |
| `GET /pathways` | Pathway enrichment results — `database` param accepts `KEGG`, `GO_BP`, `GO_MF`, `HALLMARK`, `REACTOME`, `WIKIPATHWAYS` |
| `GET /pathways/shared` | Pathways shared across datasets |
| `GET /pathways/{pathway_id}/genes` | Genes in a selected pathway |
| `GET /consensus` | Consensus DE genes across 2+ datasets |

---

## Troubleshooting

### `psql is not recognized` (Windows)
PostgreSQL is not in your PATH. Follow Step 1 of the Windows setup to add it.

### `command not found: psql` (Mac)
PostgreSQL is not in your PATH. Add the export line to your `~/.zshrc` as described in Step 1 of the Mac setup, then run `source ~/.zshrc`.

### `ModuleNotFoundError: No module named 'X'`
Your virtual environment is not activated. Run:
- Windows: `venv\Scripts\activate`
- Mac: `source venv/bin/activate`

### `connection refused` when starting the API
PostgreSQL is not running.
- Windows: Search "Services" → find postgresql → right-click → Start
- Mac Homebrew: `brew services start postgresql@16`
- Mac Postgres.app: open Postgres.app and click Initialize

### `psycopg2.OperationalError: password authentication failed`
Wrong password in your `.env` file. Double-check `PG_PASSWORD` and `DATABASE_URL` both match what you set during PostgreSQL installation — they need to agree with each other.

### `column "log2_fc_raw" does not exist`
Your schema predates the shrunk/raw log2FC toggle. Run:
```bash
psql -U postgres -d capstone_db -c "ALTER TABLE de_results ADD COLUMN IF NOT EXISTS log2_fc_raw FLOAT;"
python db\load_data.py
```
(or the Mac equivalents) to add the column and backfill it.

### App loads but shows no data
The API is not running. Make sure you have `uvicorn main:app --host 0.0.0.0 --port 8000` running in a terminal tab.

### `CORS error` in browser console
The API is running on a different port than expected. Check that `API_BASE` in `frontend/js/api.js` matches the port uvicorn is running on (default `http://localhost:8000`).

### `fetch` errors when opening HTML files directly
Use VS Code Live Server or `python -m http.server 5500` instead of opening files directly. See Running the App → Option A or B.

### Plots don't appear / blank charts
Plotly.js is loaded from a CDN. Check your internet connection — you need to be online for the charts to load. If you need offline support, download Plotly.js and reference it locally.

### `pip install psycopg2-binary` fails on Mac
Try:
```bash
pip install psycopg2-binary --only-binary :all:
```
Or install with conda:
```bash
conda install psycopg2
```

### Port already in use
If port 8000 is already taken:
```bash
uvicorn main:app --host 0.0.0.0 --port 8001
```
Then update `API_BASE` in `frontend/js/api.js` to `http://localhost:8001`.

### Reloading data after updating CSVs in `results/`
`load_data.py` is safe to re-run any time — every table has a real `UNIQUE` constraint, so it updates existing rows (`ON CONFLICT ... DO UPDATE`) instead of duplicating them. No need to truncate or drop tables first unless the schema itself changed (see the `log2_fc_raw` troubleshooting entry above for an example of that).

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Database | PostgreSQL 16 |
| API | FastAPI + SQLAlchemy |
| Frontend | HTML + CSS + Vanilla JS |
| Charts | Plotly.js |
| Data analysis | R (DESeq2, tximport, fgsea) |

---

## Data Pipeline

Raw RNA-seq data (quant.sf files from Salmon) → R analysis pipeline (DESeq2 + fgsea on Rivanna HPC) → `results/` → PostgreSQL database → FastAPI → browser

R pipeline produces, all landing directly in `results/`:
- `master_sample_table.csv` — sample metadata across all 3 datasets (`01_Build_Master_Sample_Table.ipynb` + `metadata_helpers.R`)
- `de_results_5xFAD_vs_WT.csv`, `de_results_STAT1KO_vs_Control.csv`, `de_results_Microglia_vs_Macrophage.csv` (`DE_analysis.R`) — includes both shrunk (apeglm) and raw (MLE) log2FoldChange
- `expression_tpm.csv` — combined TPM, already in long format (`expression_tpm_format.R`)
- `fgsea_{COLLECTION}_{GSE_ID}.csv` — 18 files, 6 gene-set collections × 3 datasets (`pathway_helpers.R`)
- `de_comparison_summary.csv` — reference summary, not loaded into the database

`consensus_genes` (genes DE in 2+ datasets) is computed by `load_data.py` itself from the loaded DE results — it's not a separate R output.

Adding a 4th dataset requires touching several specific places across the R scripts, `load_data.py`, and a couple of frontend files that are still hardcoded to 3 datasets — see the project's chat history / dev notes for the full list of what needs updating.

---

## Authors

Shriya Kuruba, Willoughby Gasperini, Kristina Quintana, Ethan Barath
UVA School of Data Science — Capstone 2026
Sponsor: Mark Lawson, Harrislab, UVA Neuroscience
Mentor: Christian Wernz

---

## License

MIT License — see LICENSE file
