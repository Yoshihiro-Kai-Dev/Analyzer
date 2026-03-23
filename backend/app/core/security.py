"""
JWT生成・検証、パスワードハッシュ化のユーティリティ
"""
import os
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from jose import JWTError, jwt

# JWTの署名に使用するシークレットキー（本番環境では必ず環境変数で上書きすること）
SECRET_KEY = os.getenv("SECRET_KEY", "change-this-to-a-random-secret-key-32chars-min")
# JWTのアルゴリズム
ALGORITHM = "HS256"
# アクセストークンの有効期限（分）: 24時間
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24


def verify_password(plain: str, hashed: str) -> bool:
    """
    平文パスワードとハッシュ化パスワードを照合する
    """
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def get_password_hash(password: str) -> str:
    """
    パスワードをbcryptでハッシュ化して返す
    """
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    JWTアクセストークンを生成して返す
    """
    to_encode = data.copy()
    # 有効期限を設定
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    # JWTをエンコードして返す
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """
    JWTトークンをデコードしてペイロードを返す
    無効・期限切れの場合は JWTError を送出する
    """
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
