# api/routers/datasets.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db

router = APIRouter()

@router.get("/")
def get_datasets(db: Session = Depends(get_db)):
    """returns metadata for all datasets — powers the dataset dropdown on every page"""
    result = db.execute(text("SELECT * FROM datasets ORDER BY dataset_id")).fetchall()
    return [dict(row._mapping) for row in result]