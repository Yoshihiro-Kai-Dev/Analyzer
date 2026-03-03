from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_db
from app.db import models
from app import schemas

router = APIRouter()

@router.get("/", response_model=List[schemas.Table])
def read_tables(project_id: int, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """
    登録されているテーブル一覧を取得する（カラム情報含む）
    """
    tables = db.query(models.TableMetadata).filter(models.TableMetadata.project_id == project_id).offset(skip).limit(limit).all()
    return tables
