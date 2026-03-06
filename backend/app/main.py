from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv

# 環境変数の読み込み
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '.env'))

from app.db.session import engine, Base
# モデルをインポートしてcreate_allでテーブル作成されるようにする
from app.db import models

# テーブル作成（alembic導入前の一時的な処置）
Base.metadata.create_all(bind=engine)

# 既存テーブルへのカラム追加マイグレーション（冪等）
from sqlalchemy import text
with engine.connect() as _conn:
    _conn.execute(text("ALTER TABLE train_results ADD COLUMN IF NOT EXISTS tree_structure JSONB"))
    _conn.execute(text("ALTER TABLE train_results ADD COLUMN IF NOT EXISTS decision_rules JSONB"))
    _conn.execute(text("ALTER TABLE train_results ADD COLUMN IF NOT EXISTS model_type VARCHAR"))
    _conn.execute(text("ALTER TABLE train_results ADD COLUMN IF NOT EXISTS coef_stats JSONB"))
    _conn.execute(text("ALTER TABLE analysis_configs ADD COLUMN IF NOT EXISTS model_type VARCHAR DEFAULT 'gradient_boosting'"))
    _conn.commit()

app = FastAPI(title="wel-analyzer API", version="0.1.0")

# CORS設定
# 開発環境用：ポート3000からのアクセスをオリジン問わず許可
# （本番環境では allow_origins に特定ドメインを指定すること）
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://.*:3000",  # 任意のホストのポート3000を許可
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    """
    ヘルスチェック用エンドポイント
    """
    return {"message": "Welcome to wel-analyzer API"}

# ルーターの追加
from app.api.endpoints import projects, upload, tables, relations, analysis, train

app.include_router(projects.router, prefix="/api/projects", tags=["projects"])

# Project Scoped Routers
app.include_router(upload.router, prefix="/api/projects/{project_id}/upload", tags=["upload"])
app.include_router(tables.router, prefix="/api/projects/{project_id}/tables", tags=["tables"])
app.include_router(relations.router, prefix="/api/projects/{project_id}/relations", tags=["relations"])
app.include_router(analysis.router, prefix="/api/projects/{project_id}/analysis", tags=["analysis"])
app.include_router(train.router, prefix="/api/projects/{project_id}/train", tags=["train"])
