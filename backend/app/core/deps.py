"""
FastAPI依存関係: JWTによる認証・認可ユーティリティ
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from jose import JWTError

from app.db.session import get_db
from app.db import models
from app.core.security import decode_token

# OAuth2トークンの取得先URL（ログインエンドポイント）
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    """
    JWTトークンを検証して現在のユーザーを返すFastAPI依存関係
    トークンが無効・期限切れの場合は401エラーを返す
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="認証情報が無効です",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # トークンをデコードしてusernameを取得
        payload = decode_token(token)
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # DBからユーザーを取得
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise credentials_exception
    return user


def get_project_member(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> models.ProjectMember:
    """
    指定プロジェクトへのアクセス権限を確認するFastAPI依存関係
    プロジェクトが存在しない場合は404、メンバーでない場合は403エラーを返す
    """
    # プロジェクトの存在確認
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=404, detail="プロジェクトが見つかりません")

    # メンバーシップの確認
    member = (
        db.query(models.ProjectMember)
        .filter(
            models.ProjectMember.project_id == project_id,
            models.ProjectMember.user_id == current_user.id,
        )
        .first()
    )
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="このプロジェクトへのアクセス権限がありません",
        )
    return member


def require_editor(
    member: models.ProjectMember = Depends(get_project_member),
) -> models.ProjectMember:
    """
    編集者以上のロール（owner / editor）を要求するFastAPI依存関係
    閲覧者（viewer）の場合は403エラーを返す
    """
    if member.role not in ("owner", "editor"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="この操作には編集者以上の権限が必要です",
        )
    return member


def require_owner(
    member: models.ProjectMember = Depends(get_project_member),
) -> models.ProjectMember:
    """
    オーナーロールを要求するFastAPI依存関係
    オーナー以外の場合は403エラーを返す
    """
    if member.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="この操作にはオーナー権限が必要です",
        )
    return member
