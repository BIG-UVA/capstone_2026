# api/routers/pathways.py
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db
from typing import Optional

router = APIRouter()

@router.get("/")
def get_pathways(
    dataset_id: str           = Query(...),
    database:   Optional[str] = Query("KEGG", description="KEGG | GO_BP | GO_MF | HALLMARK | REACTOME | WIKIPATHWAYS — default is KEGG for initial page load, user can switch via toggle"),
    top_n:      int           = Query(20),
    db: Session = Depends(get_db)
):
    """
    returns top N enriched pathways for a dataset
    powers the pathway dot plot on page 2
    example: GET /pathways?dataset_id=GSE212310&database=KEGG
    """
    result = db.execute(text("""
        SELECT p.pathway_id, p.pathway_name, p.database,
               pr.nes, pr.padj, pr.overlap_size, pr.direction
        FROM pathway_results pr
        JOIN pathways p ON pr.pathway_id = p.pathway_id
        WHERE pr.dataset_id  = :dataset_id
          AND p.database     = :database
          AND pr.significant = TRUE
        ORDER BY pr.padj ASC
        LIMIT :top_n
    """), {"dataset_id": dataset_id, "database": database, "top_n": top_n}).fetchall()
    return [dict(row._mapping) for row in result]


@router.get("/shared")
def get_shared_pathways(
    database:     Optional[str] = Query("KEGG"),
    min_datasets: int           = Query(2),
    db: Session = Depends(get_db)
):
    """
    returns pathways significant in 2+ or all 3 datasets
    powers the cross-dataset pathway comparison table on page 2
    """
    result = db.execute(text("""
        SELECT p.pathway_name, p.database,
               COUNT(DISTINCT pr.dataset_id) as n_datasets,
               AVG(pr.nes)  as mean_nes,
               AVG(pr.padj) as mean_padj,
               ARRAY_AGG(DISTINCT pr.dataset_id) as datasets
        FROM pathway_results pr
        JOIN pathways p ON pr.pathway_id = p.pathway_id
        WHERE p.database = :database AND pr.significant = TRUE
        GROUP BY p.pathway_id, p.pathway_name, p.database
        HAVING COUNT(DISTINCT pr.dataset_id) >= :min_datasets
        ORDER BY mean_padj ASC
    """), {"database": database, "min_datasets": min_datasets}).fetchall()
    return [dict(row._mapping) for row in result]


@router.get("/{pathway_id}/genes")
def get_pathway_genes(
    pathway_id:  str,
    dataset_id:  str = Query(...),
    db: Session = Depends(get_db)
):
    """
    returns the DE genes in a clicked pathway's leading edge —
    the specific genes fgsea identified as driving that pathway's enrichment score
    powers the gene table that updates when you click a pathway dot
    """
    result = db.execute(text("""
        SELECT g.gene_symbol, g.gene_name,
               d.log2_fc, d.padj, d.direction
        FROM pathway_results pr
        JOIN de_results d
          ON d.gene_id    = ANY(string_to_array(pr.leading_edge, ','))
         AND d.dataset_id = pr.dataset_id
        JOIN genes g ON d.gene_id = g.gene_id
        WHERE pr.pathway_id = :pathway_id
          AND pr.dataset_id = :dataset_id
        ORDER BY d.padj ASC
    """), {"dataset_id": dataset_id, "pathway_id": pathway_id}).fetchall()
    return [dict(row._mapping) for row in result]