from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_db
from app.db import models
from app import schemas

import sqlalchemy

router = APIRouter()

@router.get("/", response_model=List[schemas.Project])
def read_projects(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """
    プロジェクト一覧を取得
    """
    projects = db.query(models.Project).offset(skip).limit(limit).all()
    return projects

@router.post("/", response_model=schemas.Project)
def create_project(project: schemas.ProjectCreate, db: Session = Depends(get_db)):
    """
    新規プロジェクト作成
    """
    db_project = models.Project(name=project.name, description=project.description)
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

@router.get("/{project_id}", response_model=schemas.Project)
def read_project(project_id: int, db: Session = Depends(get_db)):
    """
    プロジェクト詳細を取得
    """
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.delete("/{project_id}", response_model=schemas.Project)
def delete_project(project_id: int, db: Session = Depends(get_db)):
    """
    プロジェクトを削除 (関連データもCascade削除される想定)
    """
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # 物理テーブルの削除
    # Project削除に伴いTableMetadataはCascade削除されるが、物理テーブルは残るため手動で削除
    for table in project.tables:
        if table.physical_table_name:
            try:
                # SQLインジェクション注意: table.physical_table_nameはシステム生成であり安全とみなす
                drop_stmt = f'DROP TABLE IF EXISTS "{table.physical_table_name}" CASCADE'
                db.execute(sqlalchemy.text(drop_stmt))
            except Exception as e:
                print(f"Failed to drop table {table.physical_table_name}: {e}")

    db.delete(project)
    db.commit()
    return project
