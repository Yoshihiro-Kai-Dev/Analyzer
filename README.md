# Analyzer — データ分析・機械学習プラットフォーム

CSV データをアップロードし、テーブル結合・特徴量設定・LightGBM による学習までをブラウザ上で完結できる Web アプリケーションです。

---

## 目次

1. [事前準備（必須ソフトウェア）](#1-事前準備必須ソフトウェア)
2. [リポジトリの取得](#2-リポジトリの取得)
3. [環境変数の設定](#3-環境変数の設定)
4. [データベースの作成](#4-データベースの作成)
5. [バックエンドのセットアップ](#5-バックエンドのセットアップ)
6. [フロントエンドのセットアップ](#6-フロントエンドのセットアップ)
7. [アプリケーションの起動](#7-アプリケーションの起動)
8. [テストデータの投入（任意）](#8-テストデータの投入任意)
9. [トラブルシューティング](#9-トラブルシューティング)

---

## 1. 事前準備（必須ソフトウェア）

以下のソフトウェアを事前にインストールしてください。

| ソフトウェア | バージョン目安 | 用途 | ダウンロード先 |
|---|---|---|---|
| **Git** | 2.40 以上 | リポジトリの取得 | https://git-scm.com/ |
| **Python** | 3.10 〜 3.12 | バックエンド実行環境 | https://www.python.org/downloads/ |
| **Node.js** | 18 以上（LTS 推奨） | フロントエンド実行環境 | https://nodejs.org/ |
| **PostgreSQL** | 14 以上 | データベース | https://www.postgresql.org/download/ |

> [!IMPORTANT]
> **Python** のインストール時に **「Add Python to PATH」にチェック** を入れてください。
> PATH に追加しないと、ターミナルから `python` コマンドが認識されません。

### インストール確認

すべてインストールした後、ターミナル（PowerShell 等）で以下を実行し、バージョンが表示されることを確認してください。

```bash
git --version
python --version
node --version
npm --version
psql --version
```

---

## 2. リポジトリの取得

ターミナルで作業用ディレクトリに移動し、リポジトリをクローン（ダウンロード）します。

```bash
git clone https://github.com/Yoshihiro-Kai-Dev/Analyzer.git
cd Analyzer
```

---

## 3. 環境変数の設定

プロジェクトのルートディレクトリ（`Analyzer/` 直下）に `.env` ファイルを作成し、以下の内容を記述します。
値はご自身の PostgreSQL の設定に合わせて変更してください。

```dotenv
DB_USER=postgres
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=wel_analyzer
```

| 変数名 | 説明 | 例 |
|---|---|---|
| `DB_USER` | PostgreSQL のユーザー名 | `postgres` |
| `DB_PASSWORD` | 上記ユーザーのパスワード | `your_password` |
| `DB_HOST` | DB サーバーのホスト名 | `localhost` |
| `DB_PORT` | DB サーバーのポート番号 | `5432` |
| `DB_NAME` | 使用するデータベース名 | `wel_analyzer` |

> [!CAUTION]
> `.env` ファイルには認証情報が含まれます。`.gitignore` に登録済みのため Git にはコミットされませんが、取り扱いにはご注意ください。

---

## 4. データベースの作成

PostgreSQL にログインし、アプリケーション用のデータベースを作成します。

### 方法 A: コマンドラインから作成する場合

```bash
# PostgreSQL にログイン
psql -U postgres

# データベースを作成（.env の DB_NAME と同じ名前にすること）
CREATE DATABASE wel_analyzer;

# ログアウト
\q
```

### 方法 B: pgAdmin（GUI ツール）から作成する場合

1. pgAdmin を開きます。
2. 左のツリーから **Servers → PostgreSQL → Databases** を右クリック → **Create → Database...**
3. Database 名に `wel_analyzer` と入力して **Save** します。

> [!NOTE]
> テーブルの作成は不要です。アプリケーション初回起動時に自動で作成されます。

---

## 5. バックエンドのセットアップ

### 5.1 仮想環境の作成と有効化

```bash
cd backend

# 仮想環境を作成
python -m venv venv

# 仮想環境を有効化
# ■ Windows (PowerShell) の場合:
.\venv\Scripts\Activate.ps1
# ■ Windows (コマンドプロンプト) の場合:
.\venv\Scripts\activate.bat
# ■ macOS / Linux の場合:
source venv/bin/activate
```

> [!WARNING]
> PowerShell でスクリプトの実行がブロックされる場合は、以下を **管理者権限** で実行してください。
> ```powershell
> Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```

### 5.2 依存パッケージのインストール

仮想環境が有効化された状態（プロンプトに `(venv)` が表示されている状態）で実行します。

```bash
pip install -r requirements.txt
```

---

## 6. フロントエンドのセットアップ

新しいターミナルを開くか、`backend` ディレクトリから戻り、`frontend` ディレクトリに移動します。

```bash
cd frontend

# 依存パッケージのインストール
npm install
```

---

## 7. アプリケーションの起動

バックエンドとフロントエンドを**それぞれ別のターミナル**で起動します。

### 7.1 バックエンドの起動

```bash
cd backend

# 仮想環境の有効化（まだの場合）
.\venv\Scripts\Activate.ps1

# FastAPI サーバーの起動
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

起動に成功すると、以下のような表示がされます。

```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process [xxxxx]
```

### 7.2 フロントエンドの起動

**別のターミナル**を開いて実行します。

```bash
cd frontend

# Next.js 開発サーバーの起動
npm run dev
```

起動に成功すると、以下のような表示がされます。

```
▲ Next.js 16.x.x
- Local:   http://localhost:3000
```

### 7.3 ブラウザでアクセス

両方のサーバーが起動したら、ブラウザで以下の URL にアクセスしてください。

| URL | 内容 |
|---|---|
| http://localhost:3000 | アプリケーション（フロントエンド） |
| http://localhost:8000/docs | API ドキュメント（Swagger UI） |

---

## 8. テストデータの投入（任意）

テスト用のサンプル CSV データを生成するスクリプトが同梱されています。

```bash
cd test
python test_data_create.py
```

実行すると以下の 2 つの CSV ファイルが生成されます。

| ファイル名 | 内容 |
|---|---|
| `01_基本属性データ.csv` | 個人属性・生活習慣アンケートデータ（10 万件） |
| `02_健診結果_ターゲット.csv` | 健診結果・予測ターゲットデータ（10 万件） |

生成された CSV ファイルをアプリケーション上でアップロードすることで、一通りの操作を試すことができます。

---

## 9. トラブルシューティング

### `python` コマンドが見つからない

- Python インストール時に **「Add Python to PATH」** にチェックを入れたか確認してください。
- Windows で `python` が動かない場合、`py` コマンドに置き換えて試してください。

### PowerShell でスクリプト実行がブロックされる

以下を管理者権限の PowerShell で実行してください。

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### `psycopg2` のインストールに失敗する

`psycopg2-binary` で解決しない場合は、PostgreSQL の開発用ヘッダが必要です。

- Windows: PostgreSQL インストーラーに含まれています。PATH に `PostgreSQL\xx\bin` が含まれているか確認してください。
- macOS: `brew install postgresql` を実行してください。
- Linux: `sudo apt install libpq-dev` を実行してください。

### データベース接続エラー

- PostgreSQL サービスが起動しているか確認してください。
- `.env` の接続情報（ユーザー名・パスワード・ポート番号）が正しいか確認してください。
- `wel_analyzer` データベースが作成済みか確認してください。

### フロントエンドからバックエンドに接続できない

- バックエンドが **ポート 8000** で起動しているか確認してください。
- フロントエンドの API リクエスト先（`http://localhost:8000`）とバックエンドのポートが一致しているか確認してください。

---

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | Next.js 16, React 19, TailwindCSS 4, shadcn/ui |
| バックエンド | FastAPI, SQLAlchemy, Uvicorn |
| データベース | PostgreSQL |
| 機械学習 | LightGBM, scikit-learn |
