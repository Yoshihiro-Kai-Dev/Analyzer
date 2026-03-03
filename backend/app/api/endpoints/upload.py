from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, BackgroundTasks
from sqlalchemy.orm import Session
import pandas as pd
import io
import datetime
import os
import uuid
import shutil
from typing import Dict, Any
from app.db.session import get_db, engine, SessionLocal
from app.db import models
from app.db.models import TableMetadata, ColumnMetadata

router = APIRouter()

# 簡易的なインメモリタスク管理 (実運用ではRedis等を使用すべき)
# {task_id: {"status": "processing"|"completed"|"failed", "progress": int, "result": dict, "message": str}}
upload_tasks: Dict[str, Dict[str, Any]] = {}

def process_upload_task(task_id: str, project_id: int, file_path: str, original_filename: str):
    """
    バックグラウンドでCSVを処理しDBに保存する関数
    """
    upload_tasks[task_id] = {"status": "processing", "progress": 0, "message": "初期化中...", "result": None}
    
    db = SessionLocal()
    try:
        # Project存在確認
        project = db.query(models.Project).filter(models.Project.id == project_id).first()
        if not project:
            raise ValueError(f"Project ID {project_id} not found.")

        # 1. 物理テーブル名の生成
        filename_without_ext = os.path.splitext(original_filename)[0]
        timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
        sanitized_filename = "".join([c if c.isalnum() else "_" for c in filename_without_ext])
        physical_table_name = f"upload_p{project_id}_{timestamp}_{sanitized_filename}"[:60]
        
        # 2. 行数の見積もり（進捗計算用）とカラム解析
        # 最初の数行だけ読んで型推論とカラム情報を取得
        preview_df = pd.read_csv(file_path, nrows=100)
        
        columns_info = []
        for col in preview_df.columns:
            dtype = str(preview_df[col].dtype)
            col_type = "unknown"
            if "int" in dtype or "float" in dtype:
                col_type = "numeric"
            elif "object" in dtype:
                col_type = "categorical"
            elif "datetime" in dtype:
                col_type = "datetime"
            
            columns_info.append({
                "name": col,
                "pandas_dtype": dtype,
                "inferred_type": col_type,
                "sample_values": preview_df[col].head(3).tolist()
            })

        # 全行数をカウント (ファイルサイズが大きい場合は概算でも良いが、ここでは正確に数える)
        upload_tasks[task_id]["message"] = "行数カウント中..."
        with open(file_path, 'rb') as f:
             total_lines = sum(1 for _ in f) - 1 # ヘッダー分減算
        
        if total_lines <= 0:
            total_lines = 1 # 0除算防止

        # 3. チャンク分割して読み込みと保存
        chunksize = 5000 # 5000行ごとに処理
        processed_rows = 0
        
        # 最初のチャンクはreplace、以降はappend
        if_exists_action = 'replace'
        
        # Pandasのread_csvでchunksizeを指定するとイテレータが返る
        for chunk in pd.read_csv(file_path, chunksize=chunksize):
            upload_tasks[task_id]["message"] = f"データ保存中 ({processed_rows}/{total_lines})..."
            
            # DB保存
            chunk.to_sql(physical_table_name, con=engine, if_exists=if_exists_action, index=False)
            
            if_exists_action = 'append' # 2回目以降は追記
            processed_rows += len(chunk)
            
            # 進捗更新
            progress = int((processed_rows / total_lines) * 100)
            upload_tasks[task_id]["progress"] = progress

        # 4. メタデータの登録
        upload_tasks[task_id]["message"] = "メタデータ登録中..."
        table_meta = TableMetadata(
            project_id=project_id,
            original_filename=original_filename,
            physical_table_name=physical_table_name,
            row_count=processed_rows
        )
        db.add(table_meta)
        db.flush()
        
        for col in columns_info:
            col_meta = ColumnMetadata(
                table_id=table_meta.id,
                physical_name=col["name"],
                display_name=col["name"],
                data_type=col["pandas_dtype"],
                inferred_type=col["inferred_type"]
            )
            db.add(col_meta)
            
        db.commit()
        
        # 完了処理
        upload_tasks[task_id]["status"] = "completed"
        upload_tasks[task_id]["progress"] = 100
        upload_tasks[task_id]["message"] = "完了"
        upload_tasks[task_id]["result"] = {
            "filename": original_filename,
            "physical_table_name": physical_table_name,
            "rows": processed_rows,
            "columns": columns_info,
            "message": "ファイルのアップロードとデータベースへの保存が完了しました。"
        }
        
    except Exception as e:
        upload_tasks[task_id]["status"] = "failed"
        upload_tasks[task_id]["message"] = f"エラーが発生しました: {str(e)}"
        print(f"Task failed: {e}") # ログ出力
    finally:
        db.close()
        # 一時ファイルの削除
        if os.path.exists(file_path):
            os.remove(file_path)

@router.post("/csv", summary="CSVファイルアップロード(非同期)")
async def upload_csv(
    project_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    """
    CSVファイルを受け取り、バックグラウンド処理を開始する。
    タスクIDを即座に返す。
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="アップロード可能なファイルはCSVのみです。")
    
    # タスクID生成
    task_id = str(uuid.uuid4())
    
    # 一時ファイルとして保存
    temp_dir = "temp"
    os.makedirs(temp_dir, exist_ok=True)
    temp_file_path = os.path.join(temp_dir, f"{task_id}_{file.filename}")
    
    with open(temp_file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # バックグラウンドタスクの登録
    background_tasks.add_task(process_upload_task, task_id, project_id, temp_file_path, file.filename)
    
    return {
        "task_id": task_id,
        "message": "アップロードを受け付けました。処理を開始します。"
    }

@router.get("/status/{task_id}", summary="アップロードタスク状態確認")
async def get_task_status(task_id: str):
    """
    指定されたタスクIDの進捗状況を返す
    """
    task = upload_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="タスクが見つかりません。")
        
    return task
