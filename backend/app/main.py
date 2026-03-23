from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv

# 環境変数の読み込み
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '.env'))

# モデルをインポート（Alembicのautogenerateで認識されるために必要）
from app.db import models  # noqa: F401

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
