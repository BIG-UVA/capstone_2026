# api/routers/genes.py
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db

router = APIRouter()

@router.get("/search")
def search_genes(
    q:     str = Query(..., min_length=2, description="gene symbol search e.g. 'Trem'"),
    limit: int = Query(20),
    db: Session = Depends(get_db)
):
    """fuzzy gene symbol search — powers gene search box on pages 1 and 3"""
    result = db.execute(text("""
        SELECT gene_id, gene_symbol, gene_name
        FROM genes
        WHERE gene_symbol % :q
        ORDER BY similarity(gene_symbol, :q) DESC
        LIMIT :limit
    """), {"q": q, "limit": limit}).fetchall()
    return [dict(row._mapping) for row in result]

@router.get("/count")
def get_gene_count(db: Session = Depends(get_db)):
    """total genes in the database — powers the 'genes analyzed' stat card on the home page"""
    result = db.execute(text("SELECT COUNT(*) AS count FROM genes")).fetchone()
    return {"count": result.count}

@router.get("/{gene_id}")
def get_gene(gene_id: str, db: Session = Depends(get_db)):
    """returns DE stats for one gene across all datasets"""
    result = db.execute(text("""
        SELECT d.dataset_id, g.gene_symbol, g.gene_name,
               d.log2_fc, d.log2_fc_raw, d.padj, d.base_mean,
               d.direction, d.condition_num, d.condition_denom
        FROM de_results d
        JOIN genes g ON d.gene_id = g.gene_id
        WHERE d.gene_id = :gene_id
        ORDER BY d.dataset_id
    """), {"gene_id": gene_id}).fetchall()
    return [dict(row._mapping) for row in result]