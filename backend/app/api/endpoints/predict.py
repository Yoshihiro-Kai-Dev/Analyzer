"""
予測実行エンドポイント
学習済みモデルで新規CSVデータの予測を行い、結果CSVをダウンロードできる
"""
import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db import models
from app import schemas
from app.core.deps import get_current_user, get_project_member
from app.services import predict_service

router = APIRouter()


@router.post("/run/{config_id}", response_model=schemas.PredictionJobResponse)
def run_prediction(
    project_id: int,
    config_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _member: models.ProjectMember = Depends(get_project_member),
):
    """
    学習済みモデルで予測を実行する
    - config_idに対応する学習済みジョブが存在することが必要
    - CSVファイルをアップロードし、バックグラウンドで予測を実行する
    """
    # 分析設定の存在確認
    config = db.query(models.AnalysisConfig).filter(
        models.AnalysisConfig.id == config_id,
        models.AnalysisConfig.project_id == project_id,
    ).first()
    if config is None:
        raise HTTPException(status_code=404, detail="分析設定が見つかりません")

    # 学習済みジョブの存在確認
    completed_job = db.query(models.TrainJob).filter(
        models.TrainJob.config_id == config_id,
        models.TrainJob.status == "completed",
    ).order_by(models.TrainJob.started_at.desc()).first()
    if completed_job is None:
        raise HTTPException(status_code=400, detail="学習済みモデルが存在しません。先に学習を実行してください")

    # CSVを読み込んでおく
    file_bytes = file.file.read()

    # 予測ジョブを作成
    job = models.PredictionJob(
        id=str(uuid.uuid4()),
        config_id=config_id,
        status="pending",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # バックグラウンドで予測実行
    background_tasks.add_task(
        predict_service.run_prediction,
        job_id=job.id,
        config_id=config_id,
        train_job_id=completed_job.id,
        file_bytes=file_bytes,
    )

    return job


@router.get("/status/{job_id}", response_model=schemas.PredictionJobResponse)
def get_prediction_status(
    project_id: int,
    job_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _member: models.ProjectMember = Depends(get_project_member),
):
    """予測ジョブのステータスを取得する"""
    job = db.query(models.PredictionJob).filter(
        models.PredictionJob.id == job_id,
    ).first()
    if job is None:
        raise HTTPException(status_code=404, detail="予測ジョブが見つかりません")
    return job


@router.get("/download/{job_id}")
def download_prediction(
    project_id: int,
    job_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _member: models.ProjectMember = Depends(get_project_member),
):
    """
    予測結果CSVをダウンロードする
    - ステータスがcompletedのジョブのみダウンロード可能
    """
    job = db.query(models.PredictionJob).filter(
        models.PredictionJob.id == job_id,
    ).first()
    if job is None:
        raise HTTPException(status_code=404, detail="予測ジョブが見つかりません")
    if job.status != "completed":
        raise HTTPException(status_code=400, detail="予測がまだ完了していません")
    if not job.result_path:
        raise HTTPException(status_code=500, detail="結果ファイルが見つかりません")

    if not os.path.exists(job.result_path):
        raise HTTPException(status_code=500, detail="結果ファイルが見つかりません")

    def iterfile():
        """ファイルをチャンク単位でストリーミング送信する"""
        with open(job.result_path, "rb") as f:
            yield from f

    return StreamingResponse(
        iterfile(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=prediction_{job_id[:8]}.csv"},
    )


@router.get("/preview/{job_id}")
def preview_prediction(
    project_id: int,
    job_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _member: models.ProjectMember = Depends(get_project_member),
):
    """
    予測結果の先頭20行と統計サマリーを返す
    CSVダウンロード前にアプリ内でプレビューできるようにする
    """
    job = db.query(models.PredictionJob).filter(
        models.PredictionJob.id == job_id,
    ).first()
    if job is None:
        raise HTTPException(status_code=404, detail="予測ジョブが見つかりません")
    if job.status != "completed":
        raise HTTPException(status_code=400, detail="予測がまだ完了していません")
    if not job.result_path or not os.path.exists(job.result_path):
        raise HTTPException(status_code=500, detail="結果ファイルが見つかりません")

    try:
        import csv
        rows = []
        headers = []
        # CSVを読み込む（先頭21行＝ヘッダー＋20件）
        with open(job.result_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            headers = reader.fieldnames or []
            for i, row in enumerate(reader):
                if i >= 20:
                    break
                rows.append(dict(row))

        # predicted_value の統計サマリーを計算する（全行を読む）
        predicted_values = []
        with open(job.result_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    v = float(row.get("predicted_value", ""))
                    predicted_values.append(v)
                except (ValueError, TypeError):
                    pass

        summary = {}
        if predicted_values:
            summary = {
                "min": min(predicted_values),
                "max": max(predicted_values),
                "mean": sum(predicted_values) / len(predicted_values),
                "count": len(predicted_values),
            }

        return {
            "headers": list(headers),
            "rows": rows,
            "summary": summary,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"プレビューの取得に失敗しました: {str(e)}")


@router.get("/jobs", response_model=list[schemas.PredictionJobResponse])
def list_prediction_jobs(
    project_id: int,
    config_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _member: models.ProjectMember = Depends(get_project_member),
):
    """指定した分析設定の予測ジョブ一覧を取得する（新しい順）"""
    jobs = db.query(models.PredictionJob).filter(
        models.PredictionJob.config_id == config_id,
    ).order_by(models.PredictionJob.created_at.desc()).limit(20).all()
    return jobs


@router.patch("/jobs/{job_id}", response_model=schemas.PredictionJobResponse)
def rename_prediction_job(
    project_id: int,
    job_id: str,
    body: schemas.PredictionJobRename,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _member: models.ProjectMember = Depends(get_project_member),
):
    """予測ジョブの表示名を変更する"""
    job = db.query(models.PredictionJob).filter(
        models.PredictionJob.id == job_id,
    ).first()
    if job is None:
        raise HTTPException(status_code=404, detail="予測ジョブが見つかりません")
    job.name = body.name
    db.commit()
    db.refresh(job)
    return job
