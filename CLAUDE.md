# CLAUDE.md — 分析くん（wel-analyzer）

このファイルは Claude Code が本プロジェクトを引き継ぐ際に最初に読む設定・コンテキストファイルです。

---

## プロジェクト概要

**分析くん（wel-analyzer）** は、CSV データをアップロードするだけで LightGBM / 線形回帰 / ロジスティック回帰による機械学習モデルの学習・評価・予測が行えるノーコード Web アプリケーションです。社内複数ユーザーでの利用を想定しており、プロジェクト単位でデータ・モデルを管理します。

---

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | Next.js 16 (App Router), React 19, TypeScript, TailwindCSS 4, shadcn/ui, Radix UI, ReactFlow, Recharts |
| バックエンド | FastAPI, SQLAlchemy 2, Alembic, Uvicorn |
| 機械学習 | LightGBM, scikit-learn, statsmodels |
| データベース | PostgreSQL 16 |
| キャッシュ | Redis 7 |
| インフラ | Docker Compose, nginx（リバースプロキシ） |

---

## ディレクトリ構成

```
.
├── backend/
│   ├── app/
│   │   ├── api/endpoints/   # FastAPI ルーター（projects, tables, relations, analysis, train, predict, upload, auth）
│   │   ├── core/            # security.py（JWT）, deps.py（認証依存関係）
│   │   ├── db/
│   │   │   ├── models.py    # SQLAlchemy モデル全定義
│   │   │   └── session.py   # DB セッション
│   │   ├── services/
│   │   │   ├── ml_service.py       # 学習処理（LightGBM / 線形・ロジスティック回帰）
│   │   │   └── predict_service.py  # 予測処理（学習時と同じ前処理を再現）
│   │   └── main.py
│   ├── alembic/             # DBマイグレーション
│   ├── models/              # 学習済みモデルファイル（.txt / .pkl）の保存先 ※volume mount
│   ├── temp/                # 予測結果CSVの一時保存先 ※volume mount
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── projects/[projectId]/
│       │   │   ├── layout.tsx       # プロジェクトレイアウト（サイドバー・トップバー）
│       │   │   ├── error.tsx        # [projectId]レベルのエラーバウンダリ
│       │   │   ├── data/page.tsx    # Step1: データ管理
│       │   │   ├── relations/page.tsx # Step2: リレーション設定
│       │   │   ├── analysis/page.tsx  # Step3: 分析設定
│       │   │   ├── dashboard/page.tsx # Step4: 学習・ダッシュボード
│       │   │   └── predict/page.tsx   # Step5: 予測実行
│       │   ├── login/page.tsx
│       │   └── register/page.tsx
│       ├── components/
│       │   ├── sidebar-nav.tsx  # ナビゲーション（Step1〜5）
│       │   ├── top-bar.tsx      # パンくずナビ
│       │   └── auth-provider.tsx # 認証チェック（useEffect内でlocalStorageアクセス）
│       └── lib/
│           ├── api.ts   # axios インスタンス（APIベースURL・Authヘッダー・401リダイレクト）
│           └── auth.ts  # localStorage ベースのJWTトークン管理
├── nginx/nginx.conf
├── docker-compose.yml
└── test/
```

---

## 起動方法

**本プロジェクトは Docker Compose による起動が標準。**

```bash
# 初回 / ソース変更後（必ず --build を付ける）
docker compose up --build -d

# ソース変更なしの再起動
docker compose up -d

# 停止
docker compose down
```

アクセス先:
- アプリ: http://localhost
- API ドキュメント: http://localhost/api/docs

### ⚠️ 重要：フロントエンドはプロダクションビルド

`frontend/Dockerfile` は `next build` でビルドしたバイナリを実行する。
**ソースを変更しても `docker compose build frontend`（または `--build`）しないと反映されない。**
`docker compose restart frontend` だけでは変更は反映されない。

```bash
# フロントエンドのソース変更後
docker compose build frontend && docker compose up -d frontend
```

---

## DBスキーマ（主要テーブル）

```
users                  → ユーザー（id, username, hashed_password）
projects               → プロジェクト（id, name, owner_id）
project_members        → プロジェクトメンバー（project_id, user_id, role: owner/editor/viewer）
table_metadata         → アップロードCSVのメタ情報（id, project_id, physical_table_name）
column_metadata        → テーブルのカラム情報（id, table_id, display_name, inferred_type）
relation_definitions   → テーブル結合定義（parent_table_id, child_table_id, join_keys, cardinality）
analysis_configs       → 分析設定（id, project_id, target_column_id, task_type, model_type, feature_settings）
train_jobs             → 学習ジョブ（id, config_id, status: pending/running/completed/failed）
train_results          → 学習結果（job_id, metrics, feature_importance, model_path, coef_stats）
prediction_jobs        → 予測ジョブ（id: UUID, config_id, status, result_path, row_count）
upload_tasks           → アップロードタスク進捗（id: UUID, project_id, status, progress）
```

**DBマイグレーション**: Alembic を使用。モデル変更時は `alembic revision --autogenerate` → `alembic upgrade head`。

---

## APIエンドポイント構成

| プレフィックス | 説明 |
|---|---|
| `POST /auth/register`, `POST /auth/login` | ユーザー登録・ログイン（JWT発行） |
| `GET/POST /api/projects/` | プロジェクト一覧・作成 |
| `POST /api/projects/{id}/tables/upload` | CSV アップロード |
| `GET /api/projects/{id}/tables/` | テーブル一覧 |
| `GET/POST /api/projects/{id}/relations/` | リレーション一覧・作成 |
| `GET/POST /api/projects/{id}/analysis/configs` | 分析設定一覧・作成 |
| `POST /api/projects/{id}/train/start/{config_id}` | 学習開始 |
| `GET /api/projects/{id}/train/jobs` | 学習ジョブ一覧 |
| `POST /api/projects/{id}/predict/run/{config_id}` | 予測実行（CSV アップロード） |
| `GET /api/projects/{id}/predict/status/{job_id}` | 予測ジョブステータス |
| `GET /api/projects/{id}/predict/download/{job_id}` | 予測結果 CSV ダウンロード |

---

## 実装済みフェーズ（全5フェーズ完了）

| フェーズ | 内容 | コミット |
|---|---|---|
| Phase 1 | Docker 動作確認 + Alembic 導入 + アップロードタスク DB 永続化 | `0f28be9`, `84e0fc4` |
| Phase 2 | JWT 認証 + ユーザー登録/ログイン + プロジェクト共有 | `4f62d0d` |
| Phase 3 | CRUD 補完（削除・編集）+ ジョブキャンセル + エラーハンドリング改善 | `09b8e55` |
| Phase 4 | UI/UX モダン化（デザイン統一・ダッシュボード充実） | `517612c` |
| Phase 5 | 予測実行・CSV 出力（predicted_value, rank 列） | `9ca4d2a` |

その後のバグ修正:
- `ce45741`: `GET /train/jobs` エンドポイント追加
- `ab82cbc`: `predict_service` 完全リライト（学習時と同じテーブル結合を再現）
- `5606cd7`: フロントエンド `predict/page.tsx` の型定義を API レスポンスに合わせて修正

---

## 重要な実装知識

### predict_service の前処理
学習時（`ml_service.py`）と同じテーブル結合を予測時も再現する必要がある:
- `OneToMany` カーディナリティ: 子テーブルを集計してメインテーブルに結合
- `ManyToOne` カーディナリティ: 親テーブルをプレフィックス付きで結合
- モデルファイル（`scaler.pkl`）の `feature_names_in_` でカラム順序を合わせる

### AnalysisConfig の API レスポンス形式
フロントエンドで `AnalysisConfig` を扱う際は以下の型を使うこと:
```typescript
interface AnalysisConfig {
  id: number
  name: string
  target_column_id: number        // ← target_column ではない
  task_type: string
  feature_settings: {
    details?: { description: string }[]
  } | null                        // ← feature_columns 配列ではない
}
```

### Next.js の error.tsx の適用範囲
- `[projectId]/error.tsx` は `[projectId]/layout.tsx` 内のエラーを捕捉できない
- layout 内のエラーを捕捉するには親セグメント（`projects/error.tsx` 等）に配置する

### FastAPI の BackgroundTasks + File の引数順序
```python
# 正しい順序（BackgroundTasks が File より前）
async def run_prediction(
    config_id: int,
    background_tasks: BackgroundTasks,  # ← File より前
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
```

---

## コード規約

- **コメントはすべて日本語で記述する**（プロジェクト規約）
- フロントエンド: Radix UI + Tailwind CSS の構成を維持する
- フロントエンドとバックエンドは REST API で通信する
- DB スキーマ変更時は必ず Alembic マイグレーションを生成する

---

## Claude Code 設定

- **コマンド実行・ファイル編集の承認確認は不要**（`.claude/settings.local.json` で `bypassPermissions` 設定済み）

---

## 将来対応予定

- **DBeaver から Docker の PostgreSQL に接続**: `docker-compose.yml` の `postgres` サービスに `ports: "5433:5432"` を追加するだけで対応可能
