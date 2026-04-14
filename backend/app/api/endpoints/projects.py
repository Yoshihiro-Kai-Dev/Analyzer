"""
プロジェクト管理エンドポイント
JWT認証が必須。自分がオーナーまたはメンバーのプロジェクトのみ操作可能。
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.db import models
from app import schemas
from app.core.deps import get_current_user, get_project_member, require_owner

import sqlalchemy

router = APIRouter()


@router.get("/", response_model=List[schemas.Project])
def read_projects(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    自分がオーナーまたはメンバーであるプロジェクト一覧を取得する
    各プロジェクトにリクエストユーザーのロール（my_role）を付加して返す
    """
    # 自分のメンバーシップを取得（ロール情報含む）
    memberships = (
        db.query(models.ProjectMember)
        .filter(models.ProjectMember.user_id == current_user.id)
        .all()
    )
    role_map = {m.project_id: m.role for m in memberships}

    projects = (
        db.query(models.Project)
        .filter(models.Project.id.in_(role_map.keys()))
        .offset(skip)
        .limit(limit)
        .all()
    )

    # my_role を付加して返す
    for p in projects:
        p.my_role = role_map.get(p.id)

    return projects


@router.post("/", response_model=schemas.Project, status_code=status.HTTP_201_CREATED)
def create_project(
    project: schemas.ProjectCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    新規プロジェクトを作成し、作成者をオーナーとして登録する
    """
    # プロジェクトをオーナー情報付きで作成
    db_project = models.Project(
        name=project.name,
        description=project.description,
        owner_id=current_user.id,
    )
    db.add(db_project)
    db.flush()  # IDを確定させてからメンバーに追加する

    # 作成者をownerロールでメンバーに追加
    member = models.ProjectMember(
        project_id=db_project.id,
        user_id=current_user.id,
        role="owner",
    )
    db.add(member)
    db.commit()
    db.refresh(db_project)
    # 作成者は必ずオーナーなので my_role を設定する
    db_project.my_role = "owner"
    return db_project


@router.get("/{project_id}", response_model=schemas.Project)
def read_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    member: models.ProjectMember = Depends(get_project_member),
):
    """
    プロジェクト詳細を取得する（メンバーのみアクセス可能）
    """
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=404, detail="プロジェクトが見つかりません")
    project.my_role = member.role
    return project


@router.delete("/{project_id}", response_model=schemas.Project)
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _member: models.ProjectMember = Depends(require_owner),
):
    """
    プロジェクトを削除する（オーナーのみ実行可能）
    関連データはCascade削除、物理テーブルは手動削除する
    """

    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=404, detail="プロジェクトが見つかりません")

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


@router.get("/{project_id}/members", response_model=List[schemas.ProjectMemberResponse])
def get_members(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _member: models.ProjectMember = Depends(get_project_member),
):
    """
    プロジェクトのメンバー一覧を取得する（メンバーのみアクセス可能）
    """
    members = (
        db.query(models.ProjectMember)
        .filter(models.ProjectMember.project_id == project_id)
        .all()
    )
    # usernameを含むレスポンスを構築する
    result = []
    for m in members:
        result.append(
            schemas.ProjectMemberResponse(
                id=m.id,
                user_id=m.user_id,
                username=m.user.username,
                role=m.role,
            )
        )
    return result


@router.post("/{project_id}/members", response_model=schemas.ProjectMemberResponse, status_code=status.HTTP_201_CREATED)
def add_member(
    project_id: int,
    body: schemas.ProjectMemberAdd,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _member: models.ProjectMember = Depends(require_owner),
):
    """
    プロジェクトにメンバーを追加する（オーナーのみ実行可能）
    指定ユーザーが存在しない場合は404、すでにメンバーの場合は400エラーを返す
    """

    # 追加対象ユーザーの存在確認
    target_user = db.query(models.User).filter(models.User.username == body.username).first()
    if target_user is None:
        raise HTTPException(status_code=404, detail="指定されたユーザーが見つかりません")

    # すでにメンバーでないか確認
    existing = (
        db.query(models.ProjectMember)
        .filter(
            models.ProjectMember.project_id == project_id,
            models.ProjectMember.user_id == target_user.id,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="このユーザーはすでにメンバーです",
        )

    # メンバーを追加
    new_member = models.ProjectMember(
        project_id=project_id,
        user_id=target_user.id,
        role=body.role,
    )
    db.add(new_member)
    db.commit()
    db.refresh(new_member)

    return schemas.ProjectMemberResponse(
        id=new_member.id,
        user_id=new_member.user_id,
        username=target_user.username,
        role=new_member.role,
    )


@router.delete("/{project_id}/members/{user_id}", response_model=schemas.ProjectMemberResponse)
def remove_member(
    project_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _member: models.ProjectMember = Depends(require_owner),
):
    """
    プロジェクトからメンバーを削除する（オーナーのみ実行可能）
    オーナー自身は削除不可
    """

    # オーナー自身の削除を禁止
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="オーナー自身をメンバーから削除することはできません",
        )

    # 削除対象メンバーの取得
    target_member = (
        db.query(models.ProjectMember)
        .filter(
            models.ProjectMember.project_id == project_id,
            models.ProjectMember.user_id == user_id,
        )
        .first()
    )
    if target_member is None:
        raise HTTPException(status_code=404, detail="指定されたメンバーが見つかりません")

    # usernameを取得してからメンバーを削除する（レスポンス用）
    target_user = db.query(models.User).filter(models.User.id == user_id).first()

    response = schemas.ProjectMemberResponse(
        id=target_member.id,
        user_id=target_member.user_id,
        username=target_user.username if target_user else "",
        role=target_member.role,
    )

    db.delete(target_member)
    db.commit()
    return response
