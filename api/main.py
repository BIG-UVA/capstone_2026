# api/main.py
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from routers import datasets, de_results, genes, expression, pathways, consensus
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db

app = FastAPI(
    title="Microglial Transcriptomics API",
    description="""
    Query differential expression, pathway enrichment, and TPM expression
    data across three microglial RNA-seq datasets studying neurodegeneration.
    
    Datasets:
    - GSE203655: T. gondii infection — STAT1-KO vs wildtype microglia
    - GSE146680: T. gondii infection — microglia only
    - GSE212310: 5xFAD Alzheimer's model — multiple comparisons
    """,
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"]
)

app.include_router(datasets.router,   prefix="/datasets",   tags=["Datasets"])
app.include_router(de_results.router, prefix="/de_results", tags=["Differential Expression"])
app.include_router(genes.router,      prefix="/genes",      tags=["Genes"])
app.include_router(expression.router, prefix="/expression", tags=["Expression"])
app.include_router(pathways.router,   prefix="/pathways",   tags=["Pathways"])
app.include_router(consensus.router,  prefix="/consensus",  tags=["Consensus Genes"])

@app.get("/api", tags=["Root"])
def root(db: Session = Depends(get_db)):
    datasets = db.execute(text("SELECT dataset_id FROM datasets ORDER BY dataset_id")).fetchall()
    return {
        "message": "Microglial Transcriptomics API",
        "docs":    "/docs",
        "datasets": [row.dataset_id for row in datasets]
    }

@app.get("/health", tags=["Root"])
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"ok": True}

from fastapi.staticfiles import StaticFiles
app.mount("/", StaticFiles(directory="../frontend", html=True), name="static")