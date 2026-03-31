"""
Alembic マイグレーション環境設定
"""
import os
import sys
from logging.config import fileConfig

# バックエンドのルートディレクトリ（/app）をPythonパスに追加
# alembicはalembic/ディレクトリから実行されるため、親ディレクトリを追加する必要がある
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# Alembic設定オブジェクト（alembic.ini の値にアクセス可能）
config = context.config

# ログ設定
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# モデルのメタデータをインポート（自動マイグレーション生成に必要）
from app.db.session import Base
from app.db import models  # noqa: F401 - 全モデルを読み込む

target_metadata = Base.metadata


def include_object(object, name, type_, reflected, compare_to):
    """CSVアップロードで動的生成されるテーブルをautogenerateの対象外にする"""
    if type_ == "table" and name.startswith("upload_p"):
        return False
    return True


def get_database_url() -> str:
    """環境変数からDB接続URLを組み立てる"""
    db_user = os.getenv("DB_USER", "postgres")
    db_password = os.getenv("DB_PASSWORD", "password")
    db_host = os.getenv("DB_HOST", "localhost")
    db_port = os.getenv("DB_PORT", "5432")
    db_name = os.getenv("DB_NAME", "wel_analyzer")
    return f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"


def run_migrations_offline() -> None:
    """オフラインモードでマイグレーションを実行する（DB接続不要）"""
    url = get_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """オンラインモードでマイグレーションを実行する（DB接続あり）"""
    # alembic.ini の sqlalchemy.url を環境変数で上書き
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = get_database_url()

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
