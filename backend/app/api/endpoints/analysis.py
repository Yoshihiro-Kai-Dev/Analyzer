from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from app.db.session import get_db
from app.db import models
from app import schemas
from app.core.deps import get_current_user

router = APIRouter()

@router.get("/configs", response_model=List[schemas.AnalysisConfig])
def list_configs(project_id: int, db: Session = Depends(get_db)):
    """
    プロジェクトの分析設定一覧を取得する
    """
    return db.query(models.AnalysisConfig).filter(models.AnalysisConfig.project_id == project_id).all()

@router.post("/config", response_model=schemas.AnalysisConfig)
def create_config(project_id: int, config: schemas.AnalysisConfigCreate, db: Session = Depends(get_db)):
    """
    分析設定を保存する
    """
    # プロジェクト存在確認 (実質バリデーション)
    
    # メインテーブルの存在確認とプロジェクト整合性
    main_table = db.query(models.TableMetadata).filter(models.TableMetadata.id == config.main_table_id).first()
    if not main_table:
        raise HTTPException(status_code=404, detail="Main table not found")
    
    if main_table.project_id != project_id:
        raise HTTPException(status_code=400, detail="Main table does not belong to the project")
        
    # ターゲットカラムの存在確認
    target_col = db.query(models.ColumnMetadata).filter(models.ColumnMetadata.id == config.target_column_id).first()
    if not target_col:
        raise HTTPException(status_code=404, detail="Target column not found")
        
    db_config = models.AnalysisConfig(
        project_id=project_id,
        name=config.name,
        main_table_id=config.main_table_id,
        target_column_id=config.target_column_id,
        task_type=config.task_type,
        model_type=config.model_type or 'gradient_boosting',
        feature_settings=config.feature_settings
    )
    db.add(db_config)
    db.commit()
    db.refresh(db_config)
    
    return db_config

@router.put("/config/{config_id}", response_model=schemas.AnalysisConfig)
def update_config(
    project_id: int,
    config_id: int,
    config: schemas.AnalysisConfigCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    分析設定を更新する
    name, feature_settings, main_table_id, target_column_id, task_type, model_typeを更新可能
    """
    # 更新対象設定の取得（プロジェクト整合性チェック込み）
    db_config = db.query(models.AnalysisConfig).filter(
        models.AnalysisConfig.id == config_id,
        models.AnalysisConfig.project_id == project_id,
    ).first()
    if not db_config:
        raise HTTPException(status_code=404, detail="分析設定が見つかりません")

    # メインテーブルの存在確認とプロジェクト整合性
    main_table = db.query(models.TableMetadata).filter(
        models.TableMetadata.id == config.main_table_id
    ).first()
    if not main_table:
        raise HTTPException(status_code=404, detail="Main table not found")
    if main_table.project_id != project_id:
        raise HTTPException(status_code=400, detail="Main table does not belong to the project")

    # ターゲットカラムの存在確認
    target_col = db.query(models.ColumnMetadata).filter(
        models.ColumnMetadata.id == config.target_column_id
    ).first()
    if not target_col:
        raise HTTPException(status_code=404, detail="Target column not found")

    # 各フィールドを更新
    db_config.name = config.name
    db_config.main_table_id = config.main_table_id
    db_config.target_column_id = config.target_column_id
    db_config.task_type = config.task_type
    db_config.model_type = config.model_type or "gradient_boosting"
    db_config.feature_settings = config.feature_settings

    db.commit()
    db.refresh(db_config)
    return db_config


@router.delete("/config/{config_id}", response_model=schemas.AnalysisConfig)
def delete_config(
    project_id: int,
    config_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    分析設定を削除する
    関連するTrainJob（およびTrainResult）はDBのCascade設定で自動削除される
    """
    # 削除対象設定の取得（プロジェクト整合性チェック込み）
    db_config = db.query(models.AnalysisConfig).filter(
        models.AnalysisConfig.id == config_id,
        models.AnalysisConfig.project_id == project_id,
    ).first()
    if not db_config:
        raise HTTPException(status_code=404, detail="分析設定が見つかりません")

    # DBから設定を削除（TrainJob・TrainResultはCascadeで自動削除）
    db.delete(db_config)
    db.commit()
    return db_config


@router.get("/suggest_features")
def suggest_features(project_id: int, main_table_id: int, db: Session = Depends(get_db)):
    """
    選択されたメインテーブルに基づいて、生成可能な特徴量を提案する。
    結合されているテーブルのカラムを集約（合計、平均、件数など）する提案を行う。
    """
    # リレーション情報を取得
    # main_table_id が parent または child になっているリレーションを探す
    # 基本的に main_table が "Parent" (1側) で、"Child" (N側) を集約するのが一般的 (OneToManyの場合)
    # あるいは main_table が "Child" で "Parent" を結合する場合 (OneToOne, ManyToOne) はそのままカラムを使える
    
    suggestions = []
    
    # CASE 1: Main Table (1) <- Relation (N) Child Table
    # Child TableのデータをMain Tableのキーで集約する
    # DBの定義上は parent_id, child_id なので、どっちがどっちかを確認
    
    # main_table = parent (1) とした relation (OneToMany) を探す
    # つまり main_table が parent_table_id に一致し、cardinalityがOneToManyのもの
    
    relations_as_parent = db.query(models.RelationDefinition).filter(
        models.RelationDefinition.parent_table_id == main_table_id,
        models.RelationDefinition.cardinality == "OneToMany"
    ).all()
    
    for rel in relations_as_parent:
        child_table = db.query(models.TableMetadata).filter(models.TableMetadata.id == rel.child_table_id).first()
        if not child_table:
            continue
            
        # 子テーブルの全カラムについて集約を提案
        for col in child_table.columns:
            # 結合キー自体は集約しても意味がない場合が多いが、一旦全部チェック
            
            if col.inferred_type == "numeric":
                suggestions.append({
                    "suggestion_type": "aggregation",
                    "table_name": child_table.physical_table_name,
                    "column_name": col.physical_name,
                    "operations": ["sum", "mean", "min", "max"],
                    "description": f"{child_table.original_filename} の {col.display_name} の統計量"
                })
            elif col.inferred_type == "categorical":
                suggestions.append({
                    "suggestion_type": "aggregation",
                    "table_name": child_table.physical_table_name,
                    "column_name": col.physical_name,
                    "operations": ["count", "nunique"],
                    "description": f"{child_table.original_filename} の {col.display_name} の件数・種類数"
                })
        
        # レコード件数自体も特徴量になる
        suggestions.append({
            "suggestion_type": "count",
            "table_name": child_table.physical_table_name,
            "column_name": "*",
            "operations": ["count"],
            "description": f"{child_table.original_filename} のレコード件数"
        })

    # CASE 2: Main Table -> Relation -> Parent Table (ManyToOne / OneToOne)
    # これは単にJOINしてカラムを持ってくるだけなので、集約ではないが特徴量として使える
    # main_table = child とした relation
    
    relations_as_child = db.query(models.RelationDefinition).filter(
        models.RelationDefinition.child_table_id == main_table_id
    ).all()
    
    for rel in relations_as_child:
        parent_table = db.query(models.TableMetadata).filter(models.TableMetadata.id == rel.parent_table_id).first()
        if not parent_table:
            continue
            
        for col in parent_table.columns:
             suggestions.append({
                "suggestion_type": "join",
                "table_name": parent_table.physical_table_name,
                "column_name": col.physical_name,
                "operations": ["value"],
                "description": f"{parent_table.original_filename} の {col.display_name} (結合)"
            })

    return suggestions
