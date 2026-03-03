from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db import models
from app import schemas
from app.services.ml_service import MLService

router = APIRouter()

@router.post("/run/{config_id}", response_model=schemas.TrainJob)
def run_training(project_id: int, config_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    指定された設定IDで学習ジョブを開始する
    """
    # プロジェクト整合性チェック（Configがプロジェクトに属しているか）
    config = db.query(models.AnalysisConfig).filter(models.AnalysisConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    
    if config.project_id != project_id:
        raise HTTPException(status_code=400, detail="Config does not belong to the project")
        
    # ジョブ作成
    job = models.TrainJob(config_id=config_id)
    db.add(job)
    db.commit()
    db.refresh(job)
    
    # バックグラウンド実行
    service = MLService(db) # DBセッションを渡すが、スレッドセーフティに注意。
    # BackgroundTasksで実行される関数内でDBセッションを新しく作るほうが安全だが、
    # ここでは簡易的に、MLService内で渡されたSessionを使う。
    # ただしFastAPIのDependency Injectionのセッションはリクエストスコープなので、
    # バックグラウンドタスクで使うとClosedになる恐れがある。
    # よって、IDだけ渡して、タスク内でSessionを作る関数を呼ぶべき。
    # ここでは下記のwrapper関数を定義する。
    
    background_tasks.add_task(run_ml_task, job.id)
    
    return job

def run_ml_task(job_id: int):
    # 新しいセッションを作成
    from app.db.session import SessionLocal
    db = SessionLocal()
    try:
        service = MLService(db)
        service.run_training_job(job_id)
    finally:
        db.close()

@router.get("/status/{job_id}", response_model=schemas.TrainJob)
def get_status(project_id: int, job_id: int, db: Session = Depends(get_db)):
    job = db.query(models.TrainJob).filter(models.TrainJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    # Project check via config
    if job.config.project_id != project_id:
         raise HTTPException(status_code=404, detail="Job not found in this project")
    return job

@router.get("/result/{job_id}", response_model=schemas.TrainResult)
def get_result(project_id: int, job_id: int, db: Session = Depends(get_db)):
    result = db.query(models.TrainResult).filter(models.TrainResult.job_id == job_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")
    
    if result.job.config.project_id != project_id:
         raise HTTPException(status_code=404, detail="Result not found in this project")
         
    return result
