# 分析くん（wel-analyzer）

CSV をアップロードするだけで、テーブル結合・特徴量選択・機械学習モデルの学習・予測までをブラウザ上で完結できるノーコード Web アプリケーションです。
複数ユーザーによるプロジェクト共有に対応しており、社内での共同利用を想定しています。

---

## 目次

1. [機能一覧](#1-機能一覧)
2. [技術スタック](#2-技術スタック)
3. [事前準備](#3-事前準備)
4. [セットアップ](#4-セットアップ)
5. [起動方法](#5-起動方法)
6. [使い方の流れ](#6-使い方の流れ)
7. [テストデータ](#7-テストデータ)
8. [トラブルシューティング](#8-トラブルシューティング)

---

## 1. 機能一覧

### 認証・ユーザー管理
- ユーザー登録・ログイン（JWT 認証）
- プロジェクト単位のメンバー共有（オーナー / 編集者 / 閲覧者 の 3 ロール）

### ポータル
- プロジェクト一覧・作成・削除
- プロジェクト名によるキーワード検索
- アップロード・学習・予測の完了通知（ベルアイコン）

### Step 1 — データ管理
- CSV アップロード（バックグラウンド処理、進捗バー表示）
- カラムの型推定（数値 / カテゴリ / 日時）と手動変更
- カテゴリ変数への値ラベル設定（例: `0 → 女児`、`1 → 男児`）
- カラムをクリックして統計情報・分布グラフを確認（数値型: ヒストグラム、カテゴリ型: 棒グラフ）
- テーブルのコピー・データ差し替え・データ追加

### Step 2 — リレーション設定
- ReactFlow によるグラフ UI でテーブル間の結合キーを設定
- カーディナリティ選択（1:1 / 1:多）
- 結合マッチ率の表示（低マッチ率は警告色）

### Step 3 — 分析設定
- 目的変数・タスク種別（回帰 / 分類）の選択
- 特徴量ごとの使用 / 除外・集計方法の設定
- モデル種別の選択（LightGBM / 線形回帰 / ロジスティック回帰）

### Step 4 — 学習・ダッシュボード
- バックグラウンド学習（進捗バー）・学習キャンセル
- 評価指標（Accuracy / F1 / RMSE 等）・混同行列
- 特徴量重要度グラフ（上位 20 件）
- 決定木の可視化（ReactFlow）・IF/THEN ルール一覧
- **係数統計**（ロジスティック / 線形回帰）
  - オッズ比 / 標準化偏回帰係数・95% 信頼区間・p 値・有意性
  - **方向バッジ**：OR > 1 なら「値↑→リスク↑」、OR < 1 なら「値↑→リスク↓」
  - **値ラベル凡例**：設定済みカテゴリ変数の値の意味を変数名の下に表示
  - 係数は StandardScaler 標準化済み（1 SD 変化あたりの効果）
- 数式の出力（`log-odds = a₁x₁ + a₂x₂ + ... + const`）
- **値のシミュレーション**：特徴量の値を変えて予測値をリアルタイム計算（カテゴリ変数はドロップダウンで値ラベル表示）
- 過去の学習ジョブ履歴の閲覧

### Step 5 — 予測実行
- CSV アップロードによる新規データへの一括予測
- 予測完了後のアプリ内プレビュー（先頭 20 行・統計サマリー、値ラベルで翻訳表示）
- 予測結果 CSV ダウンロード（`predicted_value`・`rank` 列付き）
- 過去の予測ジョブ一覧・名称変更

---

## 2. 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | Next.js 16 (App Router), React 19, TypeScript, TailwindCSS 4, shadcn/ui, Radix UI, ReactFlow, Recharts |
| バックエンド | FastAPI, SQLAlchemy 2, Alembic, Uvicorn |
| 機械学習 | LightGBM, scikit-learn, statsmodels |
| データベース | PostgreSQL 16 |
| キャッシュ | Redis 7 |
| インフラ | Docker Compose, nginx（リバースプロキシ） |

---

## 3. 事前準備

**Docker Desktop** のみ必要です。Python・Node.js・PostgreSQL の個別インストールは不要です。

| ソフトウェア | バージョン目安 | ダウンロード先 |
|---|---|---|
| **Docker Desktop** | 4.x 以上 | https://www.docker.com/products/docker-desktop/ |
| **Git** | 2.40 以上 | https://git-scm.com/ |

> [!IMPORTANT]
> Docker Desktop を起動した状態でセットアップを進めてください。

---

## 4. セットアップ

### 4.1 リポジトリの取得

```bash
git clone https://github.com/Yoshihiro-Kai-Dev/Analyzer.git
cd Analyzer
```

### 4.2 環境変数の設定

`.env.example` をコピーして `.env` を作成し、必要に応じて値を変更します。

```bash
# Windows (PowerShell)
Copy-Item .env.example .env

# macOS / Linux
cp .env.example .env
```

`.env` の内容（最低限 `DB_PASSWORD` と `SECRET_KEY` を変更してください）:

```dotenv
DB_USER=postgres
DB_PASSWORD=changeme              # 任意のパスワードに変更
DB_HOST=localhost
DB_PORT=5432
DB_NAME=wel_analyzer
SECRET_KEY=change-this-to-a-random-secret-key-32chars-min   # 後述の方法で生成した文字列に変更
REDIS_URL=redis://redis:6379/0
APP_ENV=development
```

#### SECRET_KEY について

ログイン時に発行する **JWT トークンの署名キー**です。サーバーはこのキーでトークンを署名し、以降のリクエストで「自分が発行した正規のトークンか」を検証します。**漏洩すると第三者がトークンを偽造できる**ため、推測されにくいランダムな文字列を設定してください。

以下のコマンドで生成できます（Python が手元にある場合）:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

> [!NOTE]
> 社内ネットワーク内のみでの利用であれば、デフォルト値のままでも動作します。ただし本番運用や外部公開時は必ず変更してください。

> [!CAUTION]
> `.env` ファイルは `.gitignore` に登録済みです。Git にはコミットされませんが、取り扱いにご注意ください。

---

## 5. 起動方法

### 初回起動・ソース変更後

```bash
docker compose up --build -d
```

### 2 回目以降（ソース変更なし）

```bash
docker compose up -d
```

### 停止

```bash
docker compose down
```

### フロントエンドのソースのみ変更した場合

```bash
docker compose build frontend && docker compose up -d frontend
```

> [!WARNING]
> フロントエンドはプロダクションビルドで動作します。ソースを変更しただけでは反映されません。必ず上記の `build` を実行してください。

### アクセス先

| URL | 内容 |
|---|---|
| http://localhost | アプリケーション |
| http://localhost/api/docs | API ドキュメント（Swagger UI） |

---

## 6. 使い方の流れ

1. **ユーザー登録・ログイン** — トップページからアカウントを作成してログインします。
2. **プロジェクト作成** — 「新規プロジェクト」ボタンからプロジェクトを作成します。必要に応じてメンバーを招待できます。
3. **Step 1: データ管理** — CSV をアップロードします。カラムの型・値ラベルを必要に応じて設定します。
4. **Step 2: リレーション設定** — 複数テーブルを使う場合、結合キーを設定します（単一テーブルの場合は省略可）。
5. **Step 3: 分析設定** — 目的変数・タスク種別・モデルを選択します。
6. **Step 4: ダッシュボード** — 「学習実行」ボタンを押して学習を開始します。完了後に評価指標・特徴量重要度・係数統計などを確認できます。
7. **Step 5: 予測** — 予測対象の CSV をアップロードして予測を実行します。結果をアプリ内でプレビューするか CSV でダウンロードできます。

---

## 7. テストデータ

`test/` ディレクトリに 3 種類のサンプルデータ生成スクリプトが用意されています。

```bash
cd test
python <スクリプト名>
```

| スクリプト | シナリオ | タスク種別 | 件数 |
|---|---|---|---|
| `test_data_create.py` | 個人属性・生活習慣 → 健診結果予測 | 回帰 | 10 万件 |
| `sales_data_create.py` | 店舗マスタ × 販売実績 → 月次売上予測 | 回帰 | 6 万件 |
| `child_abuse_data_create.py` | 家庭環境・支援状況 → 児童虐待通告発生予測 | 分類 | 5,000 件 |

### child_abuse_data_create.py の出力ファイル

| ファイル名 | 内容 | カラム数 |
|---|---|---|
| `01_説明変数.csv` | 家庭環境（12 項目）+ 支援状況（9 項目） | 21 |
| `02_目的変数.csv` | 児童ID + 児童虐待通告_発生（目的変数） | 2 |

**推奨利用手順（分析くん上での操作）:**

1. `01_説明変数.csv` をアップロード
2. `02_目的変数.csv` をアップロード
3. リレーション設定: `児童ID` で 1:1 結合
4. 分析設定: 目的変数 = `児童虐待通告_発生`、タスク = 分類、モデル = LightGBM またはロジスティック回帰
5. 学習・予測を実行

---

## 8. トラブルシューティング

### Docker Desktop が起動していない

`docker compose up` 実行時にエラーが出る場合は、Docker Desktop を起動してから再試行してください。

### ポート 80 が使用中

他のサービスがポート 80 を使用している場合、`docker-compose.yml` の `nginx` サービスのポート設定を変更してください。

```yaml
ports:
  - "8080:80"   # 左の番号を空きポートに変更
```

変更後は `http://localhost:8080` でアクセスします。

### データベースマイグレーションエラー

コンテナ起動後にテーブルが正しく作成されない場合は、手動でマイグレーションを実行してください。

```bash
docker compose exec backend alembic upgrade head
```

### ログの確認

```bash
# バックエンドのログ
docker compose logs backend

# フロントエンドのログ
docker compose logs frontend

# リアルタイムで追いかける場合
docker compose logs -f backend
```

### コンテナを完全リセットする

```bash
# コンテナ・ボリューム（DBデータ）をすべて削除して再構築
docker compose down -v
docker compose up --build -d
```

> [!CAUTION]
> `-v` オプションを付けると PostgreSQL のデータも削除されます。必要なデータは事前にバックアップしてください。

### DBeaver から PostgreSQL に接続する

`docker-compose.yml` の `postgres` サービスにポートを追加することで、DBeaver 等の外部ツールから接続できます。

```yaml
postgres:
  image: postgres:16-alpine
  ports:
    - "5433:5432"   # この行を追加
```

接続情報: ホスト `localhost`、ポート `5433`、ユーザー・パスワード・DB 名は `.env` の設定値

---
