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

## 9. 社内サーバーへのホスティング

ローカル PC ではなく社内サーバーに常時稼働させる手順です。
**Windows Server** と **Ubuntu** の 2 パターンを記載します。

---

### 9.1 サーバー要件

| 項目 | 最小構成の目安 |
|---|---|
| CPU | 4 コア以上 |
| メモリ | 8 GB 以上（学習データが大きい場合は 16 GB 推奨） |
| ストレージ | 50 GB 以上の空き容量 |
| OS | Windows Server 2019 以降 / Ubuntu 22.04 LTS |
| ネットワーク | 社内 LAN 接続・固定 IP 推奨 |

---

### 9.2 Docker のインストール

#### Windows Server の場合

1. [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) をダウンロードしてインストールします。
2. インストール後に Docker Desktop を起動し、タスクトレイのクジラアイコンが緑色になるまで待ちます。
3. **Settings → General → "Start Docker Desktop when you sign in"** にチェックを入れます。

> [!NOTE]
> Windows Server は GUI ログインが必要なため、サーバー再起動後に管理者アカウントで一度ログインするまで Docker が起動しません。ログイン不要で自動起動させたい場合は「9.6 自動起動の設定」を参照してください。

#### Ubuntu の場合

```bash
# Docker Engine のインストール
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Docker をサービスとして有効化
sudo systemctl enable docker
sudo systemctl start docker

# sudo なしで docker コマンドを使えるようにする（再ログイン後に有効）
sudo usermod -aG docker $USER
```

インストール確認:

```bash
docker --version
docker compose version
```

---

### 9.3 アプリケーションの配置

#### Windows Server の場合

```powershell
# 配置先ディレクトリを作成（例: C:\apps\analyzer）
mkdir C:\apps\analyzer
cd C:\apps\analyzer

git clone https://github.com/Yoshihiro-Kai-Dev/Analyzer.git .
```

#### Ubuntu の場合

```bash
# 配置先ディレクトリを作成（例: /opt/analyzer）
sudo mkdir -p /opt/analyzer
sudo chown $USER:$USER /opt/analyzer
cd /opt/analyzer

git clone https://github.com/Yoshihiro-Kai-Dev/Analyzer.git .
```

---

### 9.4 本番用 .env の設定

`.env.example` をコピーして `.env` を作成します。

```bash
# Windows (PowerShell)
Copy-Item .env.example .env

# Ubuntu
cp .env.example .env
```

`.env` を編集し、以下の項目を**必ず**変更してください。

```dotenv
DB_PASSWORD=（推測されにくい強力なパスワード）
SECRET_KEY=（以下のコマンドで生成した文字列）
APP_ENV=production
```

`SECRET_KEY` の生成:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

> [!CAUTION]
> `DB_PASSWORD` と `SECRET_KEY` をデフォルト値のまま社内サーバーに公開しないでください。

---

### 9.5 DBeaver 接続用ポートをサーバーでは閉じる

`docker-compose.yml` の `postgres` サービスに `ports: "5433:5432"` が設定されている場合、サーバーでは**セキュリティのため削除**することを推奨します。社内サーバー上の DB に外部から直接接続できる状態になるためです。

```yaml
# サーバー運用時はこの行を削除またはコメントアウトする
# ports:
#   - "5433:5432"
```

DBeaver で接続したい場合はサーバー上で直接 `docker compose exec postgres psql` を使うか、SSH トンネル経由での接続を検討してください。

---

### 9.6 起動

```bash
docker compose up --build -d
```

ブラウザでサーバーの IP アドレスにアクセスして動作を確認します。

```
http://<サーバーのIPアドレス>/
```

---

### 9.7 自動起動の設定

サーバー再起動後もアプリが自動的に立ち上がるよう設定します。

#### Windows Server の場合（タスクスケジューラ）

1. **タスクスケジューラ**を開きます（`taskschd.msc`）。
2. 「タスクの作成」をクリックします。
3. 各タブを以下のように設定します。

| タブ | 設定項目 | 値 |
|---|---|---|
| 全般 | 名前 | `分析くん 自動起動` |
| 全般 | セキュリティオプション | 「ユーザーがログオンしているかどうかにかかわらず実行する」を選択 |
| トリガー | 開始 | `スタートアップ時` |
| 操作 | プログラム | `docker` |
| 操作 | 引数 | `compose -f C:\apps\analyzer\docker-compose.yml up -d` |
| 条件 | 電源 | 「コンピューターをAC電源で使用している場合のみタスクを開始する」のチェックを外す |

4. 「OK」を押してタスクを保存します。管理者パスワードの入力を求められます。

#### Ubuntu の場合（systemd）

以下のサービスファイルを作成します。

```bash
sudo nano /etc/systemd/system/analyzer.service
```

内容:

```ini
[Unit]
Description=分析くん
After=docker.service
Requires=docker.service

[Service]
WorkingDirectory=/opt/analyzer
ExecStart=/usr/bin/docker compose up
ExecStop=/usr/bin/docker compose down
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

サービスを有効化・起動します。

```bash
sudo systemctl daemon-reload
sudo systemctl enable analyzer
sudo systemctl start analyzer

# 状態確認
sudo systemctl status analyzer
```

---

### 9.8 ファイアウォールの設定

サーバーのファイアウォールでポート 80 を開放します。

#### Windows Server の場合

```powershell
New-NetFirewallRule -DisplayName "分析くん HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
```

#### Ubuntu の場合

```bash
sudo ufw allow 80/tcp
sudo ufw reload
```

---

### 9.9 動作確認

別の PC のブラウザから以下の URL にアクセスして、ログイン画面が表示されれば完了です。

```
http://<サーバーのIPアドレス>/
```

> [!TIP]
> IP アドレスの確認方法:
> - Windows Server: `ipconfig` コマンドの「IPv4 アドレス」
> - Ubuntu: `ip a` コマンドの `inet` の値

---

### 9.10 運用メモ

| 操作 | コマンド |
|---|---|
| アプリの再起動 | `docker compose restart` |
| アプリの停止 | `docker compose down` |
| ログの確認 | `docker compose logs -f backend` |
| ソース更新後の再デプロイ | `git pull && docker compose up --build -d` |
| DB バックアップ | `docker compose exec postgres pg_dump -U postgres wel_analyzer > backup.sql` |
| DB リストア | `docker compose exec -T postgres psql -U postgres wel_analyzer < backup.sql` |

---
