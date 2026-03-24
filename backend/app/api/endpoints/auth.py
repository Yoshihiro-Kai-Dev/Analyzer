"""
認証エンドポイント: ユーザー登録・ログイン・ユーザー情報取得
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db import models
from app import schemas
from app.core.security import verify_password, get_password_hash, create_access_token
from app.core.deps import get_current_user

router = APIRouter()


@router.post("/register", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_in: schemas.UserCreate, db: Session = Depends(get_db)):
    """
    新規ユーザーを登録する
    すでに同名のユーザーが存在する場合は400エラーを返す
    """
    # ユーザー名の重複チェック
    existing = db.query(models.User).filter(models.User.username == user_in.username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="このユーザー名はすでに使用されています",
        )
    # パスワードをハッシュ化してユーザーを作成
    hashed_pw = get_password_hash(user_in.password)
    user = models.User(username=user_in.username, hashed_password=hashed_pw)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=schemas.Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    ユーザー名・パスワードで認証し、JWTアクセストークンを返す
    認証失敗時は401エラーを返す
    """
    # ユーザーの存在確認
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ユーザー名またはパスワードが正しくありません",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # JWTトークンを生成して返す（subにユーザー名を格納）
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    """
    現在ログイン中のユーザー情報を返す
    """
    return current_user
