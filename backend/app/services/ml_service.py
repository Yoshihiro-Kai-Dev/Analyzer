import pandas as pd
import numpy as np
import lightgbm as lgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score, accuracy_score, roc_auc_score, f1_score
from sklearn.preprocessing import LabelEncoder
from sqlalchemy.orm import Session
import os
import json
import traceback
from datetime import datetime
from app.db import models
from app.db.session import DB_CONNECTION_STRING
from sqlalchemy import create_engine
import logging

# ロガー設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# モデル保存先
MODEL_DIR = "models"
if not os.path.exists(MODEL_DIR):
    os.makedirs(MODEL_DIR)

class MLService:
    def __init__(self, db: Session):
        self.db = db
        # Pandasで直接DBから読むためのEngine
        # settings.SQLALCHEMY_DATABASE_URI をそのままだと非同期ドライバなどがある場合にpd.read_sqlが使えない可能性があるが、
        # 今回はpsycopg2を使っているのでOKとする。
        self.engine = create_engine(DB_CONNECTION_STRING)

    def run_training_job(self, job_id: int):
        job = self.db.query(models.TrainJob).filter(models.TrainJob.id == job_id).first()
        if not job:
            return

        try:
            # Update Status: Running
            job.status = "running"
            job.progress = 10
            self.db.commit()

            logger.info(f"[ML-JOB] Started Job ID: {job_id}")
            config = job.config
            logger.info(f"[ML-JOB] Task Type: {config.task_type}")
            logger.info(f"[ML-JOB] Target Column: {config.target_column.physical_name}")
            
            # 1. データ準備 (結合・集約)
            job.message = "Preparing data..."
            self.db.commit()
            
            df = self._prepare_data(config)
            if df.empty:
                raise ValueError("Dataset is empty.")
            
            job.progress = 40
            self.db.commit()

            # 2. 前処理
            job.message = "Preprocessing..."
            self.db.commit()
            
            X, y, feature_names, encoders = self._preprocess_data(df, config)
            logger.info(f"[ML-JOB] Preprocessing done. X.shape={X.shape}, y.shape={y.shape}, y.dtype={y.dtype}")
            logger.info(f"[ML-JOB] y sample: {y.head(5).tolist() if hasattr(y, 'head') else y[:5]}")
            
            job.progress = 50
            self.db.commit()
            
            # 3. 学習
            job.message = f"Training ({config.task_type})..."
            self.db.commit()
            
            # モデルパラメータ (簡易設定)
            params = {
                'objective': config.task_type, # 'regression' or 'binary'/'multiclass' -> 後で調整
                'metric': 'rmse' if config.task_type == 'regression' else 'auc', # 簡易
                'verbosity': -1,
                'boosting_type': 'gbdt',
                'n_estimators': 100
            }
            
            # タスクタイプの補正 (lightgbmのobjectiveに合わせる)
            if config.task_type == "classification":
                # 多クラスか2値かで分岐すべきだが、簡易的にbinaryと見なすか、ユニーク数で判定
                if y.nunique() > 2:
                    params['objective'] = 'multiclass'
                    params['num_class'] = y.nunique()
                    params['metric'] = 'multi_logloss'
                else:
                    params['objective'] = 'binary'
                    params['metric'] = 'binary_logloss' # aucだとeval setが必要

            # Train/Test Split
            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
            
            model = lgb.LGBMRegressor(**params) if config.task_type == 'regression' else lgb.LGBMClassifier(**params)
            logger.info(f"[ML-JOB] Model created: {type(model)}")
            model.fit(X_train, y_train, eval_set=[(X_test, y_test)])

            job.progress = 80
            self.db.commit()

            # 4. 評価
            job.message = "Evaluating..."
            self.db.commit()
            
            logger.info("[ML-JOB] Starting prediction on test set...")
            y_pred = model.predict(X_test)
            logger.info(f"[ML-JOB] Prediction done. y_pred sample: {y_pred[:5]}")
            
            metrics = {}
            if config.task_type == 'regression':
                metrics['rmse'] = float(np.sqrt(mean_squared_error(y_test, y_pred)))
                metrics['r2'] = float(r2_score(y_test, y_pred))
            else:
                # 分類の場合、predictはクラス、predict_probaは確率
                # LGBMClassifierのpredictはクラスを返す
                 metrics['accuracy'] = float(accuracy_score(y_test, y_pred))
                 # metrics['auc'] = roc_auc_score... (確率が必要なので省略、必要なら実装)

            # 5. Feature Importance & Correlation
            importance = model.feature_importances_
            
            # 相関係数の計算 (簡単な線形相関を見る)
            # ターゲット変数との相関
            # NOTE: dfには文字列(object)が含まれている可能性があるため、エンコード済みのXを使用する
            # Xはpandas DataFrameであることを前提（train_test_splitしてもDataFrameが返る）
            # feature_namesはXのcolumnsと一致しているはず
            
            # X_test + X_train を結合して全体の相関を見るか、Trainingデータだけで見るかだが、
            # ここではX全体(前処理後)とyの相関を見るのが適切。
            # しかしX, yはsplit前のものである。
            full_correlations = X.corrwith(y)

            fi_list = []
            for name, imp in zip(feature_names, importance):
                corr_val = full_correlations.get(name, 0.0)
                fi_list.append({
                    "feature": name, 
                    "importance": float(imp),
                    "correlation": float(corr_val) if not pd.isna(corr_val) else 0.0
                })
            # Sort by importance
            fi_list.sort(key=lambda x: x['importance'], reverse=True)

            # 6. AI Insight Generation (Simple Rule-based for now)
            # 将来的にはLLM APIを叩く
            insight_text = self._generate_simple_insight(config.task_type, metrics, fi_list)

            # 7. 保存
            model_path = os.path.join(MODEL_DIR, f"model_{job_id}.txt")
            model.booster_.save_model(model_path)

            result = models.TrainResult(
                job_id=job.id,
                metrics=metrics,
                feature_importance=fi_list,
                ai_analysis_text=insight_text,
                model_path=model_path
            )
            self.db.add(result)
            
            job.status = "completed"
            job.progress = 100
            job.message = "Completed successfully."
            job.completed_at = datetime.now()
            self.db.commit()

        except Exception as e:
            logger.error("[ML-JOB] Training failed", exc_info=True)
            traceback.print_exc()
            job.status = "failed"
            job.error_message = str(e)
            job.completed_at = datetime.now()
            self.db.commit()

    def _prepare_data(self, config: models.AnalysisConfig) -> pd.DataFrame:
        """
        メインテーブルと結合テーブルのデータを取得・結合する
        """
        main_table_name = config.main_table.physical_table_name
        
        # 1. Main Table Load
        # 必要なカラムだけ読みたいが、とりあえず全件
        # ターゲットカラムは必ず必要
        # TODO: chunking / Memory optimisation
        main_df = pd.read_sql(f"SELECT * FROM {main_table_name}", self.engine)
        
        # 2. Join Relations (OneToMany -> Aggregation)
        # config.feature_settings に従って集約... としたいが、
        # 今回は簡易的に「OneToManyのリレーションがあれば、数値カラムをすべて集約する」というロジックで自動化
        
        # Relations where Main is Parent (OneToMany) -> 集約対象
        relations = self.db.query(models.RelationDefinition).filter(
            models.RelationDefinition.parent_table_id == config.main_table_id,
            models.RelationDefinition.cardinality == "OneToMany"
        ).all()
        
        for rel in relations:
            child_table = self.db.query(models.TableMetadata).filter(models.TableMetadata.id == rel.child_table_id).first()
            if not child_table: continue
            
            child_df = pd.read_sql(f"SELECT * FROM {child_table.physical_table_name}", self.engine)
            
            join_keys = rel.join_keys # {"parent_col": "p_id", "child_col": "c_id"}
            parent_key = join_keys.get("parent_col")
            child_key = join_keys.get("child_col")
            
            if not parent_key or not child_key: continue

            # 集約 (groupby child_key)
            # 数値カラムのみ抽出し、mean, sum等を計算
            # ターゲットのカラム(child_key)を除外
            numeric_cols = child_df.select_dtypes(include=[np.number]).columns.tolist()
            if child_key in numeric_cols: numeric_cols.remove(child_key)
            
            if not numeric_cols: continue
            
            agg_df = child_df.groupby(child_key)[numeric_cols].agg(['sum', 'mean'])
            # カラム名のリネーム (table_col_sum)
            agg_df.columns = [f"{child_table.physical_table_name}_{col}_{stat}" for col, stat in agg_df.columns]
            
            # Merge to main_df
            main_df = main_df.merge(agg_df, left_on=parent_key, right_index=True, how='left') # Mainに残すためLeft Join
            
            # 欠損値（結合できなかった行）は0埋めなどが必要だが、後のfillnaでやる

        # CASE 2: Main is Child (OneToOne / ManyToOne) -> Simple Join
        relations_child = self.db.query(models.RelationDefinition).filter(
             models.RelationDefinition.child_table_id == config.main_table_id
        ).all()
        
        for rel in relations_child:
            parent_table = self.db.query(models.TableMetadata).filter(models.TableMetadata.id == rel.parent_table_id).first()
            if not parent_table: continue
             
            parent_df = pd.read_sql(f"SELECT * FROM {parent_table.physical_table_name}", self.engine)
            
            join_keys = rel.join_keys
            parent_key = join_keys.get("parent_col")
            child_key = join_keys.get("child_col")

            # Simple Join
            # カラム名衝突回避のためにSuffixつけるか、prefixつける
            parent_df = parent_df.add_prefix(f"{parent_table.physical_table_name}_")
            # 結合キーの名前が変わってしまったので修正
            p_key_renamed = f"{parent_table.physical_table_name}_{parent_key}"
            
            main_df = main_df.merge(parent_df, left_on=child_key, right_on=p_key_renamed, how='left')
            
        return main_df

    def _preprocess_data(self, df: pd.DataFrame, config: models.AnalysisConfig):
        """
        ターゲット分離、エンコーディング、欠損処理
        """
        target_col_name = config.target_column.physical_name
        
        if target_col_name not in df.columns:
            raise ValueError(f"Target column '{target_col_name}' not found in dataset.")
            
        # Drop rows where target is NaN
        df = df.dropna(subset=[target_col_name])
        
        y = df[target_col_name]
        X = df.drop(columns=[target_col_name])
        
        # 不要なIDカラムなどを除外
        # 簡易ロジック:
        # 1. カラム名に 'id', 'code', 'no' などが含まれる (case insensitive)
        # 2. ユニーク数が多すぎるカテゴリ変数 (行数とほぼ同じ) -> IDとみなす
        # 3. 日付っぽい名前 -> 'date', 'time', '日'
        
        drop_cols = []
        row_count = len(X)
        
        for col in X.columns:
            col_lower = col.lower()
            
            # 手動ルール: IDっぽい名前、日付っぽい名前
            if any(x in col_lower for x in ['id', 'no.', 'code', 'date', 'time', '名', '日']):
                # 数値型で分散がある程度あるなら残す手もあるが、今回は安全側に倒して「個人ID」などは消す
                # ただし「実施日」から季節性を取るなどは高度すぎるので一旦消す
                # "年齢" や "日数" などが含まれるとまずいので、完全一致や特定の接尾辞で判定を強化してもよいが、
                # 今回はユーザーデータが "個人ID", "健診実施日" なので、それらにマッチするようにする。
                drop_cols.append(col)
                continue
            
            # カーディナリティ判定 (Object型/Category型のみ)
            if X[col].dtype == 'object' or str(X[col].dtype) == 'category':
                unique_count = X[col].nunique()
                # 90%以上がユニークならIDとみなす
                if unique_count > row_count * 0.9:
                    drop_cols.append(col)

        if drop_cols:
            logger.info(f"[DEBUG] Dropping columns (potential IDs/Dates): {drop_cols}")
            X = X.drop(columns=drop_cols)
        
        # ターゲット変数の処理 (強化版)
        logger.info(f"[DEBUG] Processing target column: {y.name}, dtype: {y.dtype}")
        try:
            # まず数値への変換を試みる
            y = pd.to_numeric(y)
            logger.info("[DEBUG] Target successfully converted to numeric.")
        except (ValueError, TypeError):
            # 数値変換できない場合（文字列カテゴリなど）はLabelEncoding
            logger.info(f"[DEBUG] Target '{y.name}' is categorical (or contains strings). Applying LabelEncoder.")
            le_target = LabelEncoder()
            # 欠損がある場合は文字列化して埋める
            y_series = y.astype(str).fillna("missing")
            y_encoded = le_target.fit_transform(y_series)
            # numpy array -> pandas Seriesに戻す (後続のnunique()などでエラーになるため)
            y = pd.Series(y_encoded, name=y.name, index=y.index)
            logger.info("[DEBUG] LabelEncoding completed.")
        
        # カテゴリカル変数の処理
        # Object型はLabelEncodingする
        object_cols = X.select_dtypes(include=['object', 'category']).columns
        encoders = {}
        for col in object_cols:
            le = LabelEncoder()
            # 文字列化して欠損埋め
            X[col] = X[col].astype(str).fillna("missing")
            X[col] = le.fit_transform(X[col])
            encoders[col] = le
            
        # 数値型の欠損埋め (0埋め)
        X = X.fillna(0)
        
        return X, y, X.columns.tolist(), encoders

    def _generate_simple_insight(self, task_type: str, metrics: dict, fi_list: list) -> str:
        """
        簡易的な分析インサイト（要約）を生成する
        """
        lines = []
        lines.append(f"### 分析結果レポート ({task_type})")
        
        # Metrics info
        lines.append("#### モデル精度")
        for k, v in metrics.items():
            lines.append(f"- **{k.upper()}**: {v:.4f}")
        
        # Feature Importance info
        lines.append("\n#### 重要な特徴量 Top 5")
        top_features = fi_list[:5]
        for item in top_features:
            lines.append(f"- **{item['feature']}**: 重要度 {item['importance']:.2f}")
            corr = item['correlation']
            if abs(corr) > 0.0:
                 lines.append(f"  - 目的変数との相関: {corr:.2f}")

        lines.append("\n#### 分析サマリー")
        top_feat = top_features[0]['feature'] if top_features else "なし"
        
        if task_type == 'regression':
             r2 = metrics.get('r2', 0)
             if r2 > 0.8:
                 lines.append(f"モデルは高い予測精度を示しています (R2: {r2:.2f})。")
             elif r2 > 0.5:
                 lines.append(f"モデルは一定の傾向を捉えています (R2: {r2:.2f})。")
             else:
                 lines.append(f"モデルの予測精度はまだ改善の余地があります (R2: {r2:.2f})。データの前処理や特徴量の追加を検討してください。")
        else:
             acc = metrics.get('accuracy', 0)
             if acc > 0.9:
                 lines.append(f"非常に高い分類精度が確認されました (Accuracy: {acc:.2f})。")
             elif acc > 0.7:
                 lines.append(f"良好な分類精度です (Accuracy: {acc:.2f})。")
             else:
                 lines.append(f"分類精度は {acc:.2f} です。不均衡データの可能性があります。")
        
        lines.append(f"最も影響を与えている要因は **{top_feat}** です。")
        
        if top_features:
            first = top_features[0]
            corr = first['correlation']
            if corr > 0.3:
                 lines.append(f"この特徴量は正の相関 ({corr:.2f}) があり、値が大きいほど目的変数が大きくなる傾向があります。")
            elif corr < -0.3:
                 lines.append(f"この特徴量は負の相関 ({corr:.2f}) があり、値が大きいほど目的変数が小さくなる傾向があります。")
        
        return "\n".join(lines)

