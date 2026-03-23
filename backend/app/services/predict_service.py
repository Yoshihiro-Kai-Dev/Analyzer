"""
予測サービス
学習済みモデルを使って新規データの予測を行う
"""
import os
import io
import traceback
import joblib
import pandas as pd
import numpy as np
from sklearn.preprocessing import LabelEncoder
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.db import models


def _update_job(job_id: str, **kwargs):
    """予測ジョブのステータスをDBに反映する"""
    db: Session = SessionLocal()
    try:
        job = db.query(models.PredictionJob).filter(models.PredictionJob.id == job_id).first()
        if job:
            for k, v in kwargs.items():
                setattr(job, k, v)
            db.commit()
    finally:
        db.close()


def _drop_id_like_columns(X: pd.DataFrame) -> pd.DataFrame:
    """
    IDっぽいカラム・日付っぽいカラムを除去する
    学習時（ml_service._preprocess_data）と同じロジックを適用する
    """
    drop_cols = []
    row_count = len(X)

    for col in X.columns:
        col_lower = col.lower()

        # IDや日付を示すキーワードを含むカラムを除外
        if any(x in col_lower for x in ['id', 'no.', 'code', 'date', 'time', '名', '日']):
            drop_cols.append(col)
            continue

        # 文字列・カテゴリ型でカーディナリティが高い場合はIDとみなす
        if X[col].dtype == 'object' or str(X[col].dtype) == 'category':
            unique_count = X[col].nunique()
            if unique_count > row_count * 0.9:
                drop_cols.append(col)

    if drop_cols:
        X = X.drop(columns=drop_cols)

    return X


def _encode_features(X: pd.DataFrame) -> pd.DataFrame:
    """
    カテゴリ変数をLabelEncodingし、数値型の欠損を0埋めする
    学習時（ml_service._preprocess_data）と同じロジックを適用する
    """
    # Object型・Category型をLabelEncoding
    object_cols = X.select_dtypes(include=['object', 'category']).columns
    for col in object_cols:
        le = LabelEncoder()
        X[col] = X[col].astype(str).fillna("missing")
        X[col] = le.fit_transform(X[col])

    # 数値型の欠損を0埋め
    X = X.fillna(0)

    return X


def run_prediction(job_id: str, config_id: int, train_job_id: int, file_bytes: bytes):
    """
    バックグラウンドで予測を実行する
    - 学習時と同じ前処理を適用してモデルに入力する
    - 出力列: row_index, predicted_value, rank_small_to_large, rank_large_to_small, rank_percent
    """
    db: Session = SessionLocal()
    try:
        _update_job(job_id, status="running")

        # 学習設定・ジョブを取得
        config = db.query(models.AnalysisConfig).filter(models.AnalysisConfig.id == config_id).first()
        train_job = db.query(models.TrainJob).filter(models.TrainJob.id == train_job_id).first()
        if not config or not train_job:
            _update_job(job_id, status="failed", error_message="設定または学習ジョブが見つかりません")
            return

        # 学習結果からモデルパスを取得
        train_result = db.query(models.TrainResult).filter(models.TrainResult.job_id == train_job_id).first()
        if not train_result or not train_result.model_path:
            _update_job(job_id, status="failed", error_message="学習済みモデルが見つかりません")
            return

        model_path = train_result.model_path
        if not os.path.exists(model_path):
            _update_job(job_id, status="failed", error_message=f"モデルファイルが存在しません: {model_path}")
            return

        # タスク種別の取得
        task_type = config.task_type  # "regression" or "classification"

        # ターゲットカラム名を取得（予測データに含まれていても除外するため）
        target_col_name = config.target_column.physical_name if config.target_column else None

        # CSVを読み込む
        df = pd.read_csv(io.BytesIO(file_bytes))

        # IDカラム候補を先に保存（結果DataFrameの先頭に付加するため）
        id_candidates = ["id", "ID", "Id", "uuid", "UUID"]
        id_col_name = None
        id_col_values = None
        for id_col in id_candidates:
            if id_col in df.columns:
                id_col_name = id_col
                id_col_values = df[id_col].values
                break

        # 特徴量DataFrameを準備（ターゲットカラムがあれば除外）
        X = df.copy()
        if target_col_name and target_col_name in X.columns:
            X = X.drop(columns=[target_col_name])

        # 学習時と同じID・日付カラム除去を適用
        X = _drop_id_like_columns(X)

        # カテゴリ変数のエンコーディングと欠損値処理
        X = _encode_features(X)

        # モデルのロードと予測
        model_ext = os.path.splitext(model_path)[1].lower()
        if model_ext == ".pkl":
            # sklearn/ロジスティック回帰モデル（joblib形式: {'model': ..., 'scaler': ...}）
            saved = joblib.load(model_path)
            sk_model = saved['model']
            scaler = saved.get('scaler')

            # 学習時と同じStandardScalerを適用
            if scaler is not None:
                X_scaled = pd.DataFrame(scaler.transform(X), columns=X.columns)
            else:
                X_scaled = X

            predictions = sk_model.predict(X_scaled)
        else:
            # LightGBM テキストモデル形式
            import lightgbm as lgb
            model = lgb.Booster(model_file=model_path)
            predictions = model.predict(X)
            # 二値分類の場合は正例確率（shape: (n, 2) → 列1）
            if task_type == "classification" and hasattr(predictions, 'ndim') and predictions.ndim == 2:
                predictions = predictions[:, 1]

        # ランク計算
        n = len(predictions)
        rank_asc = pd.Series(predictions).rank(method="min", ascending=True).astype(int)
        rank_desc = pd.Series(predictions).rank(method="min", ascending=False).astype(int)
        rank_pct = (rank_asc - 1) / max(n - 1, 1) * 100

        # 結果DataFrameを作成
        result_df = pd.DataFrame({
            "row_index": range(n),
            "predicted_value": predictions,
            "rank_small_to_large": rank_asc,
            "rank_large_to_small": rank_desc,
            "rank_percent": rank_pct.round(1),
        })

        # 元のIDカラムがあれば先頭に追加
        if id_col_name is not None and id_col_values is not None:
            result_df.insert(0, id_col_name, id_col_values)

        # 結果CSVを保存
        result_dir = "/tmp/prediction_results"
        os.makedirs(result_dir, exist_ok=True)
        result_path = os.path.join(result_dir, f"prediction_{job_id}.csv")
        result_df.to_csv(result_path, index=False)

        _update_job(
            job_id,
            status="completed",
            result_path=result_path,
            row_count=n,
        )

    except Exception as e:
        _update_job(job_id, status="failed", error_message=str(e))
        traceback.print_exc()
    finally:
        db.close()
