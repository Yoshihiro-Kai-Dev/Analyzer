from fastapi import APIRouter, Depends, HTTPException
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

@router.patch("/{table_id}/columns/{column_id}", response_model=schemas.Column)
def update_column_type(project_id: int, table_id: int, column_id: int, update: schemas.ColumnUpdate, db: Session = Depends(get_db)):
    """
    カラムの推論型を更新する
    """
    col = db.query(models.ColumnMetadata).filter(
        models.ColumnMetadata.id == column_id,
        models.ColumnMetadata.table_id == table_id
    ).first()
    if not col:
        raise HTTPException(status_code=404, detail="Column not found")
    col.inferred_type = update.inferred_type
    db.commit()
    db.refresh(col)
    return col
