from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os

# 環境変数からDB接続情報を取得
# 実際の運用では Pydantic の Settings を使うのが推奨されるが、初期実装のため os.getenv を使用
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "password")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "wel_analyzer")

DB_CONNECTION_STRING = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
SQLALCHEMY_DATABASE_URL = DB_CONNECTION_STRING

# エンジンの作成
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    # echo=True  # デバッグ時にSQLログを出力する場合は有効化
)

# セッションファクトリの作成
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# モデルのベースクラス
Base = declarative_base()

# 依存性注入用関数
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
