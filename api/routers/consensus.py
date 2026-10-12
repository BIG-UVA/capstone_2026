# api/routers/consensus.py
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db

router = APIRouter()

@router.get("/")
def get_consensus_genes(
    min_datasets:    int  = Query(2),
    consistent_only: bool = Query(False),
    db: Session = Depends(get_db)
):
    """
    returns genes DE in 2+ or all 3 datasets
    powers the consensus gene table on page 3
    example: GET /consensus?min_datasets=2&consistent_only=false
    """
    query  = """
        SELECT c.gene_id, g.gene_symbol, g.gene_name,
               c.n_datasets, c.datasets_list, c.consistent_dir
        FROM consensus_genes c
        JOIN genes g ON c.gene_id = g.gene_id
        WHERE c.n_datasets >= :min_datasets
    """
    params = {"min_datasets": min_datasets}
    if consistent_only:
        query += " AND c.consistent_dir = TRUE"
    query += " ORDER BY c.n_datasets DESC, g.gene_symbol"

    result = db.execute(text(query), params).fetchall()
    return [dict(row._mapping) for row in result]