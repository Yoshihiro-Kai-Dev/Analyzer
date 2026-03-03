import sys
import os

# プロジェクトルートの.envを読み込む簡易実装
def load_env(env_path):
    if not os.path.exists(env_path):
        print(f"Warning: .env not found at {env_path}")
        return
    
    with open(env_path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                key, value = line.split('=', 1)
                os.environ[key.strip()] = value.strip()

# 現在のディレクトリ (backend) の親ディレクトリ (root) に .env があると仮定
root_dir = os.path.abspath(os.path.join(os.getcwd(), ".."))
env_path = os.path.join(root_dir, ".env")
load_env(env_path)

# パスを通す
sys.path.append(os.getcwd())

from app.db.session import SessionLocal
from app.db.models import AnalysisConfig, TableMetadata

def check():
    db = SessionLocal()
    try:
        configs = db.query(AnalysisConfig).all()
        if not configs:
            print("No analysis configs found.")
        else:
            print(f"Found {len(configs)} configs:")
            for c in configs:
                main_table = db.query(TableMetadata).filter(TableMetadata.id == c.main_table_id).first()
                table_name = main_table.physical_table_name if main_table else "Unknown"
                print(f"  [ID: {c.id}] Task: {c.task_type}, Table: {table_name}, Created: {c.created_at}")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    check()
