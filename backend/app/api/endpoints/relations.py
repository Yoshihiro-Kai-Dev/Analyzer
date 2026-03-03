from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Set
from app.db.session import get_db
from app.db import models
from app import schemas

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
def create_relation(project_id: int, relation: schemas.RelationCreate, db: Session = Depends(get_db)):
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

@router.get("/", response_model=List[schemas.Relation])
def read_relations(project_id: int, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """
    リレーション定義の一覧を取得する
    """
    # プロジェクト内のテーブルに関連するリレーションのみ取得
    # RelationDefinition -> TableMetadata (parent) -> project_id check
    relations = db.query(models.RelationDefinition).join(
        models.TableMetadata, models.RelationDefinition.parent_table_id == models.TableMetadata.id
    ).filter(
        models.TableMetadata.project_id == project_id
    ).offset(skip).limit(limit).all()
    
    return relations
