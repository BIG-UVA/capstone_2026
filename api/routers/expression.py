# api/routers/expression.py
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db
from typing import Optional

router = APIRouter()

@router.get("/{gene_id}")
def get_expression(
    gene_id:    str,
    dataset_id: Optional[str] = Query(None, description="filter to one dataset — omit for all datasets"),
    db: Session = Depends(get_db)
):
    """
    returns TPM per sample for a gene
    with dataset_id: powers expression bar chart on page 1
    without dataset_id: powers multi-dataset chart on page 3
    example: GET /expression/ENSMUSG00000023992?dataset_id=GSE212310
    """
    query  = """
        SELECT e.sample_id, e.tpm, s.condition,
               s.dataset_id, g.gene_symbol
        FROM expression_tpm e
        JOIN samples s ON e.sample_id = s.sample_id
        JOIN genes   g ON e.gene_id   = g.gene_id
        WHERE e.gene_id = :gene_id
    """
    params = {"gene_id": gene_id}
    if dataset_id:
        query += " AND s.dataset_id = :dataset_id"
        params["dataset_id"] = dataset_id
    query += " ORDER BY s.dataset_id, s.condition, e.sample_id"

    result = db.execute(text(query), params).fetchall()
    return [dict(row._mapping) for row in result]