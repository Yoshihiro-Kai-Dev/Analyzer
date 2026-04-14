import sqlalchemy
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Set
from app.db.session import get_db
from app.db import models
from app import schemas
from app.core.deps import get_current_user, get_project_member, require_editor

router = APIRouter()

def check_cycle(db: Session, new_parent_id: int, new_child_id: int) -> bool:
    """
    新しいリレーション (parent -> child) を追加した際にサイクルが発生しないかチェックする。
    DFSでグラフ探索を行う。
    """
    # 既存の全リレーションを取得
    existing_relations = db.query(models.RelationDefinition).all()
    
    # 隣接リストを作成
    adj_list = {}
    for rel in existing_relations:
        if rel.parent_table_id not in adj_list:
            adj_list[rel.parent_table_id] = []
        adj_list[rel.parent_table_id].append(rel.child_table_id)
    
    # 新しいリレーションを一時的に追加
    if new_parent_id not in adj_list:
        adj_list[new_parent_id] = []
    adj_list[new_parent_id].append(new_child_id)
    
    # サイクル検出 (DFS)
    visited = set()
    recursion_stack = set()
    
    def dfs(node_id):
        visited.add(node_id)
        recursion_stack.add(node_id)
        
        if node_id in adj_list:
            for neighbor in adj_list[node_id]:
                if neighbor not in visited:
                    if dfs(neighbor):
                        return True
                elif neighbor in recursion_stack:
                    return True
        
        recursion_stack.remove(node_id)
        return False

    # グラフ内の全ノードについて実施（非連結グラフも考慮）
    # 新しいリレーションの影響範囲だけ見れば十分だが、念のため全探索
    # 最適化: new_parent_id から探索開始するだけで十分なはず
    if dfs(new_parent_id):
        return True
        
    return False

@router.post("/", response_model=schemas.Relation)
def create_relation(
    project_id: int,
    relation: schemas.RelationCreate,
    db: Session = Depends(get_db),
    _member: models.ProjectMember = Depends(require_editor),
):
    """
    新しいリレーションを作成する。
    N:Mの禁止、循環参照のチェックを行う。
    """
    # 0. バリデーション: プロジェクト整合性チェック
    # 親テーブルと子テーブルが指定されたプロジェクトに属しているか確認
    parent_table = db.query(models.TableMetadata).filter(models.TableMetadata.id == relation.parent_table_id).first()
    child_table = db.query(models.TableMetadata).filter(models.TableMetadata.id == relation.child_table_id).first()
    
    if not parent_table or not child_table:
        raise HTTPException(status_code=404, detail="Table not found")
        
    if parent_table.project_id != project_id or child_table.project_id != project_id:
        raise HTTPException(status_code=400, detail="Tables must belong to the specified project")

    # 1. バリデーション: 自己参照チェック
    if relation.parent_table_id == relation.child_table_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="自分自身へのリレーションは定義できません。"
        )

    # 2. バリデーション: N:Mチェック (フロントエンドでも制限するがAPIでも弾く)
    if relation.cardinality not in ["OneToOne", "OneToMany"]:
         raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="サポートされていないカーディナリティです。Only 'OneToOne' or 'OneToMany' are allowed."
        )

    # 3. バリデーション: 既存リレーションの重複チェック
    # 同じテーブルペアで既にリレーションがある場合はエラー（多重定義防止）
    # 逆方向（Child -> Parent）もチェックすべきかは仕様によるが、循環チェックで弾かれるのでここでは同一方向のみチェック
    existing = db.query(models.RelationDefinition).filter(
        models.RelationDefinition.parent_table_id == relation.parent_table_id,
        models.RelationDefinition.child_table_id == relation.child_table_id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="このテーブル間のリレーションは既に存在します。"
        )

    # 4. バリデーション: 循環参照チェック
    if check_cycle(db, relation.parent_table_id, relation.child_table_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="循環参照（ループ）が発生するため、このリレーションは作成できません。"
        )

    # 5. 保存
    db_relation = models.RelationDefinition(
        parent_table_id=relation.parent_table_id,
        child_table_id=relation.child_table_id,
        join_keys=relation.join_keys,
        cardinality=relation.cardinality
    )
    db.add(db_relation)
    db.commit()
    db.refresh(db_relation)
    
    return db_relation

@router.delete("/{relation_id}", response_model=schemas.Relation)
def delete_relation(
    project_id: int,
    relation_id: int,
    db: Session = Depends(get_db),
    _member: models.ProjectMember = Depends(require_editor),
):
    """
    リレーション定義を削除する
    リレーションがプロジェクトに属するか（親テーブル経由で）確認する
    """
    # 削除対象リレーションの取得
    relation = db.query(models.RelationDefinition).filter(
        models.RelationDefinition.id == relation_id
    ).first()
    if not relation:
        raise HTTPException(status_code=404, detail="リレーションが見つかりません")

    # リレーションの親テーブルがプロジェクトに属するか確認する（IDOR防止）
    parent_table = db.query(models.TableMetadata).filter(
        models.TableMetadata.id == relation.parent_table_id
    ).first()
    if not parent_table or parent_table.project_id != project_id:
        raise HTTPException(status_code=404, detail="リレーションが見つかりません")

    # DBからリレーションを削除してコミット
    db.delete(relation)
    db.commit()
    return relation


@router.get("/")
def read_relations(
    project_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _member: models.ProjectMember = Depends(get_project_member),
):
    """
    リレーション定義の一覧を取得する
    各リレーションにテーブル結合のマッチ率（%）を付加して返す
    """
    # プロジェクト内のテーブルに関連するリレーションのみ取得
    # RelationDefinition -> TableMetadata (parent) -> project_id check
    relations = db.query(models.RelationDefinition).join(
        models.TableMetadata, models.RelationDefinition.parent_table_id == models.TableMetadata.id
    ).filter(
        models.TableMetadata.project_id == project_id
    ).offset(skip).limit(limit).all()

    result = []
    for rel in relations:
        # マッチ率を計算する（子テーブルの結合キーが親テーブルに存在する割合）
        match_rate = None
        try:
            parent_table = db.query(models.TableMetadata).filter(
                models.TableMetadata.id == rel.parent_table_id
            ).first()
            child_table = db.query(models.TableMetadata).filter(
                models.TableMetadata.id == rel.child_table_id
            ).first()

            if parent_table and child_table and rel.join_keys:
                parent_col = rel.join_keys.get("parent_col")
                child_col = rel.join_keys.get("child_col")
                pt = parent_table.physical_table_name
                ct = child_table.physical_table_name

                if parent_col and child_col:
                    # 子テーブルの総件数を取得する
                    total = db.execute(sqlalchemy.text(
                        f'SELECT COUNT(*) FROM "{ct}" WHERE "{child_col}" IS NOT NULL'
                    )).scalar() or 0

                    if total > 0:
                        # 親テーブルにマッチする子テーブルの件数を取得する
                        matched = db.execute(sqlalchemy.text(
                            f'SELECT COUNT(*) FROM "{ct}" WHERE "{child_col}" IN '
                            f'(SELECT "{parent_col}" FROM "{pt}")'
                        )).scalar() or 0
                        match_rate = round(matched / total * 100, 1)
        except Exception:
            # マッチ率の計算失敗は無視する（通常のリレーション情報は返す）
            pass

        result.append({
            "id": rel.id,
            "parent_table_id": rel.parent_table_id,
            "child_table_id": rel.child_table_id,
            "join_keys": rel.join_keys,
            "cardinality": rel.cardinality,
            "match_rate": match_rate,
        })

    return result
