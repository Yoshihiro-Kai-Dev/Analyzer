from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
import pandas as pd
import datetime
import os
import uuid
import shutil
from app.db.session import engine, SessionLocal
from app.db import models
from app.db.models import TableMetadata, ColumnMetadata, UploadTask

router = APIRouter()


def _update_task(task_id: str, **kwargs) -> None:
    """
    DBのタスクレコードを更新するヘルパー関数
    バックグラウンドスレッドから安全に呼び出せるよう、
    専用セッションを都度生成してコミット後すぐに閉じる
    """
    db = SessionLocal()
    try:
        task = db.query(UploadTask).filter(UploadTask.id == task_id).first()
        if task:
            for key, value in kwargs.items():
                setattr(task, key, value)
            db.commit()
    finally:
        db.close()


def process_upload_task(task_id: str, project_id: int, file_path: str, original_filename: str, categorical_threshold: int = 20):
    """
    バックグラウンドでCSVを処理しDBに保存する関数
    処理状態はインメモリではなくDBで管理する
    """
    db = SessionLocal()
    try:
        # Project存在確認
        project = db.query(models.Project).filter(models.Project.id == project_id).first()
        if not project:
            raise ValueError(f"Project ID {project_id} が見つかりません。")

        # 1. 物理テーブル名の生成
        filename_without_ext = os.path.splitext(original_filename)[0]
        timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
        sanitized_filename = "".join([c if c.isalnum() else "_" for c in filename_without_ext])
        physical_table_name = f"upload_p{project_id}_{timestamp}_{sanitized_filename}"[:60]

        # 2. 最初の100行でカラム型推論
        preview_df = pd.read_csv(file_path, nrows=100)

        columns_info = []
        for col in preview_df.columns:
            dtype = str(preview_df[col].dtype)
            col_type = "unknown"
            if "float" in dtype:
                # 小数は連続値とみなし numeric に分類する
                col_type = "numeric"
            elif "int" in dtype:
                # 整数はユニーク値数が閾値以下の場合 categorical と判断する
                nunique = preview_df[col].nunique()
                col_type = "categorical" if nunique <= categorical_threshold else "numeric"
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

        # 3. 全行数カウント（進捗計算用）
        _update_task(task_id, message="行数カウント中...")
        with open(file_path, 'rb') as f:
            total_lines = sum(1 for _ in f) - 1  # ヘッダー分減算
        if total_lines <= 0:
            total_lines = 1  # 0除算防止

        # 4. チャンク分割して読み込み・保存
        chunksize = 5000
        processed_rows = 0
        if_exists_action = 'replace'

        for chunk in pd.read_csv(file_path, chunksize=chunksize):
            _update_task(task_id, message=f"データ保存中 ({processed_rows}/{total_lines})...")
            chunk.to_sql(physical_table_name, con=engine, if_exists=if_exists_action, index=False)
            if_exists_action = 'append'
            processed_rows += len(chunk)
            progress = int((processed_rows / total_lines) * 100)
            _update_task(task_id, progress=progress)

        # 5. メタデータ登録
        _update_task(task_id, message="メタデータ登録中...")
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

        # 6. 完了
        result_data = {
            "filename": original_filename,
            "physical_table_name": physical_table_name,
            "rows": processed_rows,
            "columns": columns_info,
            "message": "ファイルのアップロードとデータベースへの保存が完了しました。"
        }
        _update_task(task_id, status="completed", progress=100, message="完了", result=result_data)

    except Exception as e:
        _update_task(task_id, status="failed", message=f"エラーが発生しました: {str(e)}")
        print(f"アップロードタスク失敗 (task_id={task_id}): {e}")
    finally:
        db.close()
        # 一時ファイルの削除
        if os.path.exists(file_path):
            os.remove(file_path)


@router.post("/csv", summary="CSVファイルアップロード(非同期)")
async def upload_csv(
    project_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    categorical_threshold: int = Form(default=20),
):
    """
    CSVファイルを受け取り、バックグラウンド処理を開始する。
    タスクIDを即座に返す。タスク状態はDBで管理するため再起動後も参照可能。
    """
    if not file.filename or not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="アップロード可能なファイルはCSVのみです。")

    # タスクID生成
    task_id = str(uuid.uuid4())

    # DBにタスクレコードを作成
    db = SessionLocal()
    try:
        task = UploadTask(
            id=task_id,
            project_id=project_id,
            status="processing",
            progress=0,
            message="初期化中..."
        )
        db.add(task)
        db.commit()
    finally:
        db.close()

    # 一時ファイルとして保存
    temp_dir = "temp"
    os.makedirs(temp_dir, exist_ok=True)
    temp_file_path = os.path.join(temp_dir, f"{task_id}_{file.filename}")

    with open(temp_file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # バックグラウンドタスクの登録
    background_tasks.add_task(process_upload_task, task_id, project_id, temp_file_path, file.filename, categorical_threshold)

    return {
        "task_id": task_id,
        "message": "アップロードを受け付けました。処理を開始します。"
    }


@router.get("/status/{task_id}", summary="アップロードタスク状態確認")
async def get_task_status(task_id: str):
    """
    指定されたタスクIDの進捗状況をDBから返す。
    サーバー再起動後も正しい状態を返す。
    """
    db = SessionLocal()
    try:
        task = db.query(UploadTask).filter(UploadTask.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="タスクが見つかりません。")

        return {
            "status": task.status,
            "progress": task.progress,
            "message": task.message,
            "result": task.result
        }
    finally:
        db.close()
