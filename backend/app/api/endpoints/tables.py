from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_db
from app.db import models
from app import schemas
from app.core.deps import get_current_user
import sqlalchemy

router = APIRouter()

@router.get("/", response_model=List[schemas.Table])
def read_tables(project_id: int, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """
    登録されているテーブル一覧を取得する（カラム情報含む）
    """
    tables = db.query(models.TableMetadata).filter(models.TableMetadata.project_id == project_id).offset(skip).limit(limit).all()
    return tables

@router.delete("/{table_id}", response_model=schemas.Table)
def delete_table(
    project_id: int,
    table_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    テーブルメタデータと物理テーブルを削除する
    関連するカラム・リレーションはCascade削除、物理テーブルは手動でDROPする
    """
    # 削除対象テーブルの取得（プロジェクト整合性チェック込み）
    table = db.query(models.TableMetadata).filter(
        models.TableMetadata.id == table_id,
        models.TableMetadata.project_id == project_id,
    ).first()
    if not table:
        raise HTTPException(status_code=404, detail="テーブルが見つかりません")

    # 物理テーブルの削除
    # physical_table_nameはシステム生成であり、SQLインジェクションリスクはないとみなす
    if table.physical_table_name:
        try:
            drop_stmt = f'DROP TABLE IF EXISTS "{table.physical_table_name}" CASCADE'
            db.execute(sqlalchemy.text(drop_stmt))
        except Exception as e:
            print(f"Failed to drop table {table.physical_table_name}: {e}")

    # DBからTableMetadataを削除（カラム・リレーション・分析設定はCascadeで自動削除）
    db.delete(table)
    db.commit()
    return table


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
