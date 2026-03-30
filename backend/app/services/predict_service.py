"""
予測サービス
学習済みモデルを使って新規データの予測を行う
アップロードCSVの特徴量列を直接使用する（DB結合は行わない）
"""
import io
import os
import traceback
import joblib

import numpy as np
import pandas as pd
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


def _preprocess_for_prediction(
    df: pd.DataFrame,
    target_col_name: str | None,
    expected_features: list[str],
) -> pd.DataFrame:
    """
    学習時（ml_service._preprocess_data）と同じ前処理を適用し、
    モデルが期待する特徴量列を揃えて返す。
    - ターゲット列を除外
    - IDっぽいカラムを除外
    - カテゴリ変数をLabelEncoding
    - 欠損を0埋め
    - expected_featuresと完全一致を検証（不足があればエラー）
    """
    X = df.copy()

    # ターゲット列を除外（予測データにターゲットが含まれている場合）
    if target_col_name and target_col_name in X.columns:
        X = X.drop(columns=[target_col_name])

    # 学習時と同じIDっぽいカラム除外ロジック
    drop_cols = []
    row_count = len(X)
    for col in X.columns:
        col_lower = col.lower()
        if any(x in col_lower for x in ["id", "no.", "code", "date", "time", "名", "日"]):
            drop_cols.append(col)
            continue
        if X[col].dtype == "object" or str(X[col].dtype) == "category":
            if X[col].nunique() > row_count * 0.9:
                drop_cols.append(col)

    if drop_cols:
        X = X.drop(columns=drop_cols)

    # カテゴリ変数をLabelEncoding
    for col in X.select_dtypes(include=["object", "category"]).columns:
        le = LabelEncoder()
        X[col] = X[col].astype(str).fillna("missing")
        X[col] = le.fit_transform(X[col])

    # 数値型の欠損を0埋め
    X = X.fillna(0)

    # モデルが期待する特徴量列に揃える（余分な列を削除）
    extra_cols = [c for c in X.columns if c not in expected_features]
    if extra_cols:
        X = X.drop(columns=extra_cols)

    # 特徴量の完全一致を検証する
    # アップロードCSVにはモデルの期待する全特徴量が含まれている必要がある
    missing_cols = [c for c in expected_features if c not in X.columns]
    if missing_cols:
        sample = ", ".join(missing_cols[:10])
        suffix = f"... 他{len(missing_cols) - 10}件" if len(missing_cols) > 10 else ""
        raise ValueError(
            f"学習時の特徴量 {len(missing_cols)}/{len(expected_features)} 件がCSVに含まれていません。"
            f"学習時と同じ列構成のCSVをアップロードしてください。\n"
            f"（不足している特徴量: {sample}{suffix}）"
        )

    # 学習時と同じ列順に並び替え
    X = X[expected_features]

    return X


def run_prediction(job_id: str, config_id: int, train_job_id: int, file_bytes: bytes):
    """
    バックグラウンドで予測を実行する
    1. アップロードCSVを読み込む
    2. 学習時と同じ前処理を適用してモデルに入力
    3. 出力列: row_index, predicted_value, rank_small_to_large, rank_large_to_small, rank_percent
    ※ DB結合は行わない。特徴量はアップロードCSVに直接含まれている前提。
    """
    db: Session = SessionLocal()
    try:
        _update_job(job_id, status="running")

        # 設定・学習ジョブを取得
        config = db.query(models.AnalysisConfig).filter(
            models.AnalysisConfig.id == config_id
        ).first()
        train_result = db.query(models.TrainResult).filter(
            models.TrainResult.job_id == train_job_id
        ).first()

        if not config or not train_result:
            _update_job(job_id, status="failed", error_message="設定または学習結果が見つかりません")
            return

        model_path = train_result.model_path
        if not model_path or not os.path.exists(model_path):
            _update_job(
                job_id, status="failed",
                error_message=f"モデルファイルが見つかりません: {model_path}"
            )
            return

        # 学習時の特徴量リストをtrain_resultから復元（重要度順）
        if not train_result.feature_importance:
            _update_job(job_id, status="failed", error_message="特徴量情報が学習結果に含まれていません")
            return
        fi_features = [fi["feature"] for fi in train_result.feature_importance]

        # ターゲットカラム名を取得
        target_col_name = (
            config.target_column.physical_name if config.target_column else None
        )
        task_type = config.task_type

        # CSVを読み込む
        main_df = pd.read_csv(io.BytesIO(file_bytes))

        # モデルを先にロードして、スケーラーが記憶する正確な列順序を取得する
        # (feature_importanceは重要度降順のためモデルの期待する列順と異なる場合がある)
        model_ext = os.path.splitext(model_path)[1].lower()
        sk_model = None
        scaler = None
        lgb_model = None
        if model_ext == ".pkl":
            saved = joblib.load(model_path)
            sk_model = saved["model"]
            scaler = saved.get("scaler")
            if scaler is not None and hasattr(scaler, "feature_names_in_"):
                # スケーラーが学習時の列順序を保持している
                expected_features = scaler.feature_names_in_.tolist()
            else:
                expected_features = fi_features
        else:
            import lightgbm as lgb
            lgb_model = lgb.Booster(model_file=model_path)
            expected_features = lgb_model.feature_name() if hasattr(lgb_model, "feature_name") else fi_features

        # 元のIDカラムを特定する（結果CSVの先頭に付加するため先に保存）
        # 優先順位1: 分析設定のメインテーブルで inferred_type='id' のカラムを使う
        # 優先順位2: 列名が "id"/"ID"/"Id" のカラムにフォールバック
        id_col_name = None
        id_col_values = None
        id_cols_from_meta = db.query(models.ColumnMetadata).filter(
            models.ColumnMetadata.table_id == config.main_table_id,
            models.ColumnMetadata.inferred_type == "id",
        ).all()
        for meta_col in id_cols_from_meta:
            if meta_col.physical_name in main_df.columns:
                id_col_name = meta_col.physical_name
                id_col_values = main_df[meta_col.physical_name].values
                break
        if id_col_name is None:
            for cand in ["id", "ID", "Id"]:
                if cand in main_df.columns:
                    id_col_name = cand
                    id_col_values = main_df[cand].values
                    break

        # 学習時と同じ前処理を適用（期待する特徴量列に揃える）
        # DB結合は行わず、アップロードCSVの列を直接使用する
        X = _preprocess_for_prediction(main_df, target_col_name, expected_features)

        # モデルで予測（モデルは上で先行ロード済み）
        if sk_model is not None:
            # sklearn / ロジスティック回帰モデル
            if scaler is not None:
                X_scaled = scaler.transform(X)
            else:
                X_scaled = X.values
            # 分類タスクかつ predict_proba が使えるモデルは陽性クラスの確率値を使う
            # predict() はクラスラベル（0/1）を返すため rank_percent が2値にしかならない
            if task_type == "classification" and hasattr(sk_model, "predict_proba"):
                predictions = sk_model.predict_proba(X_scaled)[:, 1]
            else:
                predictions = sk_model.predict(X_scaled)
        else:
            # LightGBM ネイティブ形式
            predictions = lgb_model.predict(X)
            # 二値分類の場合は正例確率（shape: (n, 2) → 列1）
            if task_type == "classification" and hasattr(predictions, "ndim") and predictions.ndim == 2:
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
            result_df.insert(0, id_col_name, id_col_values[:n])

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
