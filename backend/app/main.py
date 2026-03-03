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

app = FastAPI(title="wel-analyzer API", version="0.1.0")

# CORS設定
# ローカル開発用に全オリジンを許可（本番環境では適切に制限すること）
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
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
