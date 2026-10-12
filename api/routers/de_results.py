# api/routers/de_results.py
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db
from typing import Optional

router = APIRouter()

@router.get("/")
def get_de_results(
    dataset_id:       str            = Query(..., description="e.g. GSE212310"),
    condition_num:    Optional[str]  = Query(None, description="e.g. 5xFAD"),
    direction:        Optional[str]  = Query(None, description="upregulated | downregulated | not_significant"),
    padj_max:         Optional[float]= Query(None),
    lfc_min:          Optional[float]= Query(None),
    significant_only: bool           = Query(True),
    limit:            int            = Query(5000),
    db: Session = Depends(get_db)
):
    """
    returns DE results for a dataset — powers volcano plot and DE table
    example: GET /de_results?dataset_id=GSE212310&condition_num=5xFAD&significant_only=true
    """
    query  = """
        SELECT d.gene_id, g.gene_symbol, g.gene_name,
               d.log2_fc, d.log2_fc_raw, d.padj, d.base_mean,
               d.direction, d.condition_num, d.condition_denom,
               d.dataset_id
        FROM de_results d
        JOIN genes g ON d.gene_id = g.gene_id
        WHERE d.dataset_id = :dataset_id
    """
    params = {"dataset_id": dataset_id}

    if condition_num:
        query += " AND d.condition_num = :condition_num"
        params["condition_num"] = condition_num
    if significant_only:
        query += " AND d.significant = TRUE"
    if direction:
        query += " AND d.direction = :direction"
        params["direction"] = direction
    if padj_max is not None:
        query += " AND d.padj <= :padj_max"
        params["padj_max"] = padj_max
    if lfc_min is not None:
        query += " AND ABS(d.log2_fc) >= :lfc_min"
        params["lfc_min"] = lfc_min

    query += " ORDER BY d.padj ASC LIMIT :limit"
    params["limit"] = limit

    result = db.execute(text(query), params).fetchall()
    return [dict(row._mapping) for row in result]


@router.get("/summary")
def get_de_summary(
    dataset_id:    str           = Query(...),
    condition_num: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    returns up/down/total counts + actual condition_denom for summary stats bar
    condition_denom is pulled from DB — not hardcoded — so it works for any comparison
    example: GET /de_results/summary?dataset_id=GSE212310&condition_num=5xFAD
    """
    count_query  = """
        SELECT direction, COUNT(*) as count
        FROM de_results
        WHERE dataset_id = :dataset_id AND significant = TRUE
    """
    params = {"dataset_id": dataset_id}
    if condition_num:
        count_query += " AND condition_num = :condition_num"
        params["condition_num"] = condition_num
    count_query += " GROUP BY direction"

    result  = db.execute(text(count_query), params).fetchall()
    summary = {row.direction: row.count for row in result}
    summary["total"] = sum(summary.values())

    # get actual condition_denom from DB — no hardcoding
    if condition_num:
        denom_result = db.execute(text("""
            SELECT DISTINCT condition_denom
            FROM de_results
            WHERE dataset_id = :dataset_id
            AND condition_num = :condition_num
            LIMIT 1
        """), params).fetchone()
        summary["condition_denom"] = denom_result.condition_denom if denom_result else "control"
    else:
        summary["condition_denom"] = ""

    return summary


@router.get("/comparisons")
def get_comparisons(
    dataset_id: str = Query(...),
    db: Session = Depends(get_db)
):
    """
    returns all available comparisons for a dataset — pulled from DB dynamically
    example: GET /de_results/comparisons?dataset_id=GSE212310
    returns: [{condition_num: '5xFAD', condition_denom: 'control'}, ...]
    """
    result = db.execute(text("""
        SELECT DISTINCT condition_num, condition_denom
        FROM de_results
        WHERE dataset_id = :dataset_id
        ORDER BY condition_num
    """), {"dataset_id": dataset_id}).fetchall()
    return [dict(row._mapping) for row in result]