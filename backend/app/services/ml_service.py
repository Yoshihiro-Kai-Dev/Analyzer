import pandas as pd
import numpy as np
import lightgbm as lgb
import joblib
import shap as shap_lib
import statsmodels.api as sm
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score, accuracy_score, roc_auc_score, precision_score, recall_score
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.linear_model import LogisticRegression, LinearRegression
from sklearn.utils.multiclass import type_of_target
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from sklearn.tree import _tree as sk_tree
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
            
            # 3. 学習 (model_type に応じて分岐)
            model_type = getattr(config, 'model_type', None) or 'gradient_boosting'
            job.message = f"Training ({config.task_type} / {model_type})..."
            self.db.commit()

            # タスクタイプと目的変数の型の整合性チェック
            detected_target_type = type_of_target(y)
            if config.task_type == 'classification' and detected_target_type == 'continuous':
                raise ValueError(
                    f"タスクタイプが「分類」に設定されていますが、目的変数「{config.target_column.physical_name}」は連続値（数値）です。"
                    "分析設定でタスクタイプを「回帰」に変更するか、離散的なカテゴリ値を持つ列を目的変数に選択してください。"
                )

            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

            # SHAP値（LightGBMのみ計算。線形モデルはNone）
            shap_list = None

            if model_type == 'logistic_regression':
                # ── sklearn ロジスティック回帰 / 線形回帰 ──────────────────
                # sklearn の線形モデルはスケールに敏感なため StandardScaler を適用
                scaler = StandardScaler()
                X_train_s = pd.DataFrame(scaler.fit_transform(X_train), columns=feature_names)
                X_test_s  = pd.DataFrame(scaler.transform(X_test),      columns=feature_names)

                if config.task_type == 'classification':
                    sk_model = LogisticRegression(
                        max_iter=1000, C=1.0, random_state=42, solver='lbfgs'
                    )
                    sk_model.fit(X_train_s, y_train)
                    y_pred = sk_model.predict(X_test_s)
                    # 係数の絶対値を特徴量重要度として使用
                    coef = sk_model.coef_
                    raw_imp = np.abs(coef).mean(axis=0)  # binary(1, n) / multiclass(k, n) 両対応
                else:
                    sk_model = LinearRegression()
                    sk_model.fit(X_train_s, y_train)
                    y_pred = sk_model.predict(X_test_s)
                    raw_imp = np.abs(sk_model.coef_)

                # 0–100 にスケーリング（LightGBM の split カウントと単位を揃えるため）
                total_imp = raw_imp.sum() + 1e-10
                importance = raw_imp / total_imp * 100

                logger.info(f"[ML-JOB] {type(sk_model).__name__} trained.")

                # モデル保存 (joblib)
                model_path = os.path.join(MODEL_DIR, f"model_{job_id}.pkl")
                joblib.dump({'model': sk_model, 'scaler': scaler}, model_path)

                # ── statsmodels による統計量計算 ──────────────────────────
                job.message = "Computing statistical metrics..."
                self.db.commit()
                coef_stats = self._compute_coef_stats(
                    X_train_s, y_train, feature_names, config.task_type
                )

            else:
                # ── LightGBM 勾配ブースティング (既存実装) ──────────────────
                params = {
                    'objective': config.task_type,
                    'metric': 'rmse' if config.task_type == 'regression' else 'auc',
                    'verbosity': -1,
                    'boosting_type': 'gbdt',
                    'n_estimators': 100
                }
                if config.task_type == "classification":
                    if y.nunique() > 2:
                        params['objective'] = 'multiclass'
                        params['num_class'] = y.nunique()
                        params['metric'] = 'multi_logloss'
                    else:
                        params['objective'] = 'binary'
                        params['metric'] = 'binary_logloss'

                sk_model = (lgb.LGBMRegressor(**params) if config.task_type == 'regression'
                            else lgb.LGBMClassifier(**params))
                logger.info(f"[ML-JOB] Model created: {type(sk_model)}")
                sk_model.fit(X_train, y_train, eval_set=[(X_test, y_test)])
                y_pred = sk_model.predict(X_test)
                importance = sk_model.feature_importances_

                # モデル保存 (LightGBM ネイティブ)
                model_path = os.path.join(MODEL_DIR, f"model_{job_id}.txt")
                sk_model.booster_.save_model(model_path)
                X_test_s  = X_test  # スケーリングなし
                coef_stats = None   # 勾配ブースティングは係数統計量なし

                # SHAP値を計算（TreeExplainer使用、テストデータで計算）
                # 計算失敗時は非致命的としてNoneを設定する
                shap_list = None
                try:
                    shap_explainer = shap_lib.TreeExplainer(sk_model)
                    shap_matrix = shap_explainer.shap_values(X_test)
                    # multiclass分類の場合はクラスごとの配列リストになる
                    # 方向性が不明確なため絶対値の平均で統合する
                    if isinstance(shap_matrix, list):
                        shap_arr = np.mean([np.abs(s) for s in shap_matrix], axis=0)
                        shap_mean_vals = pd.Series(shap_arr.mean(axis=0), index=feature_names)
                    else:
                        # 回帰・二値分類は符号あり平均（正負の方向を保持）
                        shap_mean_vals = pd.Series(shap_matrix.mean(axis=0), index=feature_names)
                    shap_list = [
                        {"feature": k, "shap_value": float(v)}
                        for k, v in shap_mean_vals.sort_values(key=abs, ascending=False).head(20).items()
                    ]
                    logger.info(f"[ML-JOB] SHAP computed: {len(shap_list)} features")
                except Exception as e:
                    logger.warning(f"[ML-JOB] SHAP computation failed (non-fatal): {e}")

            job.progress = 80
            self.db.commit()

            # 4. 評価
            job.message = "Evaluating..."
            self.db.commit()

            logger.info("[ML-JOB] Starting prediction on test set...")
            logger.info(f"[ML-JOB] Prediction done. y_pred sample: {y_pred[:5]}")

            # trainデータへの予測（過学習検出用）
            # logistic_regression はロジスティック回帰・線形回帰の両方を含む（StandardScaler 適用済みの X_train_s を使用）
            if model_type == 'logistic_regression':
                y_train_pred = sk_model.predict(X_train_s)
            else:
                y_train_pred = sk_model.predict(X_train)

            # テストデータのメトリクス
            metrics = {}
            train_metrics = {}
            if config.task_type == 'regression':
                metrics['rmse'] = float(np.sqrt(mean_squared_error(y_test, y_pred)))
                metrics['r2']   = float(r2_score(y_test, y_pred))
                train_metrics['rmse'] = float(np.sqrt(mean_squared_error(y_train, y_train_pred)))
                train_metrics['r2']   = float(r2_score(y_train, y_train_pred))
            else:
                metrics['accuracy'] = float(accuracy_score(y_test, y_pred))
                train_metrics['accuracy'] = float(accuracy_score(y_train, y_train_pred))
                # Precision / Recall（クラス不均衡検出用）
                avg = 'binary' if y.nunique() == 2 else 'macro'
                try:
                    metrics['precision'] = float(precision_score(y_test, y_pred, average=avg, zero_division=0))
                    metrics['recall']    = float(recall_score(y_test, y_pred, average=avg, zero_division=0))
                except Exception as e:
                    logger.warning(f"[ML-JOB] Precision/Recall computation failed: {e}")
                # AUC: ロジスティック回帰・GBM ともに predict_proba があれば計算
                if hasattr(sk_model, 'predict_proba'):
                    try:
                        y_proba = sk_model.predict_proba(X_test_s)
                        if y_proba.shape[1] == 2:  # 二値分類
                            metrics['auc'] = float(roc_auc_score(y_test, y_proba[:, 1]))
                        else:
                            metrics['auc'] = float(roc_auc_score(
                                y_test, y_proba, multi_class='ovr', average='macro'
                            ))
                    except Exception as e:
                        logger.warning(f"[ML-JOB] AUC computation failed: {e}")

            # 5. 特徴量重要度 & 相関係数
            full_correlations = X.corrwith(y)

            fi_list = []
            for name, imp in zip(feature_names, importance):
                corr_val = full_correlations.get(name, 0.0)
                fi_list.append({
                    "feature": name,
                    "importance": float(imp),
                    "correlation": float(corr_val) if not pd.isna(corr_val) else 0.0
                })
            fi_list.sort(key=lambda x: x['importance'], reverse=True)

            # 6. モデル診断レポート生成
            insight_text = self._generate_diagnostic_report(
                config.task_type, metrics, train_metrics, fi_list, model_type
            )

            # 7. 決定木の学習・抽出（線形モデル時はスキップ）
            if model_type == 'logistic_regression':
                tree_structure = None
                decision_rules = None
                logger.info("[ML-JOB] Skipping decision tree (linear model selected).")
            else:
                job.message = "Training Decision Tree..."
                self.db.commit()

                n_classes  = int(y.nunique()) if config.task_type == "classification" else None
                class_names = [str(c) for c in sorted(y.unique())] if config.task_type == "classification" else None
                dt_model = self._train_decision_tree(X_train, y_train, config.task_type, n_classes)
                tree_structure = self._sanitize_for_json(
                    self._extract_tree_structure(dt_model, feature_names, class_names)
                )
                decision_rules = self._sanitize_for_json(
                    self._extract_rules(dt_model, feature_names, class_names)
                )

            # 8. 保存
            result = models.TrainResult(
                job_id=job.id,
                metrics=metrics,
                feature_importance=fi_list,
                shap_importance=shap_list,
                ai_analysis_text=insight_text,
                model_path=model_path,
                model_type=model_type,
                coef_stats=self._sanitize_for_json(coef_stats) if coef_stats else None,
                tree_structure=tree_structure,
                decision_rules=decision_rules,
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
        # テーブル名を二重引用符でクォートして日本語・特殊文字を含む名前に対応
        main_df = pd.read_sql(f'SELECT * FROM "{main_table_name}"', self.engine)
        
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
            
            child_df = pd.read_sql(f'SELECT * FROM "{child_table.physical_table_name}"', self.engine)
            
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
            # 集約カラム名はテーブル名プレフィックスなしで "{列名}_{集計}" とする
            # 予測時にアップロードCSVの列名と直接照合できるようにするため
            agg_df.columns = [f"{col}_{stat}" for col, stat in agg_df.columns]
            
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

            parent_df = pd.read_sql(f'SELECT * FROM "{parent_table.physical_table_name}"', self.engine)

            join_keys = rel.join_keys
            parent_key = join_keys.get("parent_col")
            child_key = join_keys.get("child_col")

            # プレフィックスなしでシンプルに結合する
            # 予測時にアップロードCSVのカラム名と直接照合できるようにするため、
            # 物理テーブル名プレフィックスは付与しない
            if child_key == parent_key:
                main_df = main_df.merge(parent_df, on=child_key, how='left', suffixes=('', '_dup'))
            else:
                main_df = main_df.merge(parent_df, left_on=child_key, right_on=parent_key, how='left', suffixes=('', '_dup'))
                # 結合後にparent側のキー列は不要なので削除（main側のキーを残す）
                if parent_key in main_df.columns:
                    main_df = main_df.drop(columns=[parent_key])

            # 同名カラムの衝突で生成された _dup サフィックス列はmain側を優先して削除
            dup_cols = [c for c in main_df.columns if c.endswith('_dup')]
            if dup_cols:
                main_df = main_df.drop(columns=dup_cols)
            
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

    def _compute_coef_stats(self, X_train, y_train, feature_names: list, task_type: str) -> list | None:
        """
        statsmodels を使って係数統計量（p値・信頼区間・オッズ比）を計算する。
        X_train は StandardScaler 済みを想定（標準化偏回帰係数として解釈可能）。
        """
        try:
            X_arr = X_train.values.astype(float) if hasattr(X_train, 'values') else np.array(X_train, dtype=float)
            y_arr = np.array(y_train, dtype=float)

            logger.info(f"[ML-JOB] _compute_coef_stats: X_arr.shape={X_arr.shape}, y_arr.shape={y_arr.shape}")

            # NaN/Inf を 0 に置換
            X_arr = np.nan_to_num(X_arr, nan=0.0, posinf=0.0, neginf=0.0)
            y_arr = np.nan_to_num(y_arr, nan=0.0)

            # 分散ゼロの列は statsmodels の定数項と完全共線性になるため除外
            col_stds = X_arr.std(axis=0)
            valid_mask = col_stds > 1e-10
            removed = [feature_names[i] for i in range(len(feature_names)) if not valid_mask[i]]
            if removed:
                logger.warning(f"[ML-JOB] Removing zero-variance features: {removed}")
            valid_features = [f for f, v in zip(feature_names, valid_mask) if v]
            X_arr = X_arr[:, valid_mask]

            if X_arr.shape[1] == 0:
                logger.warning("[ML-JOB] No valid features after zero-variance removal.")
                return None

            X_sm = sm.add_constant(X_arr, prepend=True)  # 先頭に定数項追加

            if task_type == 'regression':
                # ── OLS (最小二乗法) ────────────────────────────────────
                sm_result = sm.OLS(y_arr, X_sm).fit()
                ci = sm_result.conf_int()  # DataFrame: shape (n_params, 2)

                stats = []
                for i, name in enumerate(valid_features):
                    idx = i + 1  # const=0 をスキップ
                    stats.append({
                        "feature":  name,
                        "coef":     round(float(sm_result.params[idx]), 4),
                        "p_value":  round(float(sm_result.pvalues[idx]), 4),
                        "ci_lower": round(float(ci[idx, 0]), 4),
                        "ci_upper": round(float(ci[idx, 1]), 4),
                    })

            else:
                n_classes = len(np.unique(y_arr))
                if n_classes != 2:
                    # 多クラスはオッズ比が定義しにくいため None を返す
                    logger.info("[ML-JOB] Multiclass: skipping coef_stats (odds ratio not applicable).")
                    return None

                # ── Logit (二値ロジスティック回帰) ──────────────────────
                sm_result = sm.Logit(y_arr, X_sm).fit(method='bfgs', maxiter=300, disp=False)
                ci = sm_result.conf_int()

                stats = []
                for i, name in enumerate(valid_features):
                    idx  = i + 1
                    coef = float(sm_result.params[idx])
                    stats.append({
                        "feature":      name,
                        "coef":         round(coef, 4),
                        "odds_ratio":   round(float(np.exp(coef)), 4),
                        "p_value":      round(float(sm_result.pvalues[idx]), 4),
                        "ci_lower":     round(float(np.exp(ci[idx, 0])), 4),  # OR の CI
                        "ci_upper":     round(float(np.exp(ci[idx, 1])), 4),
                    })

            # |係数| の大きい順にソート
            stats.sort(key=lambda x: abs(x['coef']), reverse=True)
            logger.info(f"[ML-JOB] coef_stats computed: {len(stats)} features")
            return stats

        except Exception as e:
            logger.warning(f"[ML-JOB] _compute_coef_stats failed: {e}", exc_info=True)
            return None

    def _generate_diagnostic_report(self, task_type: str, metrics: dict,
                                     train_metrics: dict, fi_list: list,
                                     model_type: str = "gradient_boosting") -> str:
        """
        ルールベースのモデル診断レポートを生成する。
        各診断項目は「判定 → 根拠 → 初学者向け解説 → 対策」の構造で出力する。
        """
        model_label = {
            "gradient_boosting": "勾配ブースティング (LightGBM)",
            "logistic_regression": "ロジスティック回帰" if task_type == "classification" else "線形回帰",
        }.get(model_type, model_type)

        lines = []
        lines.append(f"## モデル診断レポート（{task_type} / {model_label}）")

        # ── 1. モデル精度の総合判定 ──
        lines.append("\n### モデル精度")
        if task_type == 'regression':
            r2 = metrics.get('r2', 0)
            rmse = metrics.get('rmse', 0)
            if r2 > 0.8:
                lines.append(f"✅ 良好な予測精度です（R² = {r2:.2f}, RMSE = {rmse:.2f}）。")
            elif r2 > 0.5:
                lines.append(f"⚠ 一定の傾向を捉えていますが、改善の余地があります（R² = {r2:.2f}, RMSE = {rmse:.2f}）。")
            else:
                lines.append(f"🔴 予測精度が低い状態です（R² = {r2:.2f}, RMSE = {rmse:.2f}）。")
            lines.append(f"> R²は「モデルがデータの変動をどれだけ説明できるか」を表す指標で、")
            lines.append(f"> 1.0に近いほど優秀です。0.8以上なら実用的な水準といえます。")
            lines.append(f"> RMSEは予測のズレの大きさで、小さいほど正確です。")
        else:
            acc = metrics.get('accuracy', 0)
            if acc > 0.9:
                lines.append(f"✅ 非常に高い分類精度です（Accuracy = {acc:.2f}）。")
            elif acc > 0.7:
                lines.append(f"⚠ 良好ですが、さらに改善できる可能性があります（Accuracy = {acc:.2f}）。")
            else:
                lines.append(f"🔴 分類精度が低い状態です（Accuracy = {acc:.2f}）。")
            lines.append(f"> Accuracyは「全データのうち正しく分類できた割合」です。")
            lines.append(f"> 0.9以上なら非常に良好、0.7以上なら実用的な水準です。")

        # ── 2. 過学習の兆候検出 ──
        lines.append("\n### 過学習チェック")
        if task_type == 'regression':
            train_val = train_metrics.get('r2', 0)
            test_val = metrics.get('r2', 0)
            metric_name = "R²"
        else:
            train_val = train_metrics.get('accuracy', 0)
            test_val = metrics.get('accuracy', 0)
            metric_name = "Accuracy"

        gap = train_val - test_val
        if gap >= 0.2:
            lines.append(f"🔴 過学習の可能性が高いです（学習データ {metric_name}: {train_val:.2f} → テストデータ {metric_name}: {test_val:.2f}）")
            lines.append(f"> 学習データでは高精度なのに、未知のデータでは大きく精度が落ちています。")
            lines.append(f"> モデルがデータの「ノイズ」まで覚えてしまっている状態です。")
            lines.append(f">")
            lines.append(f"> **対策**: 特徴量を減らす、データ件数を増やす、またはモデルの複雑さを下げることを検討してください。")
        elif gap >= 0.1:
            lines.append(f"⚠ 過学習の兆候があります（学習データ {metric_name}: {train_val:.2f} → テストデータ {metric_name}: {test_val:.2f}）")
            lines.append(f"> 学習データと未知のデータで精度に差が出ています。")
            lines.append(f"> まだ深刻ではありませんが、特徴量の見直しを検討してもよいでしょう。")
        else:
            lines.append(f"✅ 過学習の兆候はありません（学習データ {metric_name}: {train_val:.2f} → テストデータ {metric_name}: {test_val:.2f}）。")
            lines.append(f"> 学習データとテストデータで精度に大きな差がなく、安定したモデルです。")

        # ── 3. クラス不均衡の指摘（分類のみ） ──
        if task_type == 'classification':
            lines.append("\n### クラス不均衡チェック")
            prec = metrics.get('precision', None)
            rec = metrics.get('recall', None)
            if prec is not None and rec is not None:
                diff = abs(prec - rec)
                if diff >= 0.15:
                    lines.append(f"⚠ クラス不均衡の可能性があります（Precision: {prec:.2f}, Recall: {rec:.2f}）。")
                    lines.append(f"> Precisionは「モデルが陽性と予測したもののうち、実際に陽性だった割合」、")
                    lines.append(f"> Recallは「実際の陽性のうち、モデルが正しく検出できた割合」です。")
                    lines.append(f"> この2つに大きな差がある場合、データの偏り（あるクラスが極端に多い/少ない）が原因の可能性があります。")
                    lines.append(f">")
                    lines.append(f"> **対策**: データのクラス比率を確認し、少数クラスのデータを増やすか、サンプリング手法の適用を検討してください。")
                else:
                    lines.append(f"✅ クラス不均衡の問題は見られません（Precision: {prec:.2f}, Recall: {rec:.2f}）。")
                    lines.append(f"> PrecisionとRecallのバランスが取れており、特定クラスへの偏りはありません。")
            else:
                lines.append("ℹ Precision/Recallが計算できなかったため、チェックをスキップしました。")

        # ── 4. 特徴量の支配度チェック ──
        # セクション4・5で共通利用するため、重要度合計を一度だけ計算する
        total_importance = sum(f['importance'] for f in fi_list) if fi_list else 0
        lines.append("\n### 特徴量の支配度")
        if fi_list:
            if total_importance > 0:
                top_ratio = fi_list[0]['importance'] / total_importance
                top_name = fi_list[0]['feature']
                if top_ratio >= 0.5:
                    lines.append(f"⚠ 特徴量「{top_name}」が重要度の {top_ratio:.0%} を占めています。")
                    lines.append(f"> 1つの特徴量にモデルが頼りすぎている状態です。")
                    lines.append(f"> その特徴量に欠損やノイズがあると、予測全体に大きく影響します。")
                    lines.append(f">")
                    lines.append(f"> **対策**: 「{top_name}」に関連する別の特徴量を追加するか、この特徴量が本当に予測に使って良いものか確認してください。")
                else:
                    lines.append(f"✅ 特徴量の重要度は分散しています（最大:「{top_name}」= {top_ratio:.0%}）。")
                    lines.append(f"> 特定の特徴量に過度に依存しておらず、バランスの良いモデルです。")
            else:
                lines.append("ℹ 特徴量の重要度が計算できませんでした。")
        else:
            lines.append("ℹ 特徴量情報がありません。")

        # ── 5. 低寄与特徴量の指摘 ──
        lines.append("\n### 低寄与の特徴量")
        if fi_list:
            if total_importance > 0:
                low_features = [f for f in fi_list if f['importance'] / total_importance < 0.01]
                if low_features:
                    lines.append("以下の特徴量はモデルにほとんど影響を与えていません:")
                    for f in low_features:
                        ratio = f['importance'] / total_importance
                        lines.append(f"- {f['feature']}（重要度: {ratio:.2%}）")
                    lines.append(f"> これらを除外しても精度はほぼ変わりません。")
                    lines.append(f"> 特徴量を減らすことでモデルがシンプルになり、過学習の防止にもつながります。")
                else:
                    lines.append("✅ すべての特徴量が一定の寄与を持っています。除外すべき特徴量はありません。")
            else:
                lines.append("ℹ 特徴量の重要度が計算できませんでした。")
        else:
            lines.append("ℹ 特徴量情報がありません。")

        # ── 6. 改善のヒント ──
        hints = self._build_improvement_hints(
            task_type, metrics, train_metrics, fi_list
        )
        if hints:
            lines.append("\n### 💡 改善のヒント")
            for i, hint in enumerate(hints, 1):
                lines.append(f"{i}. {hint}")

        return "\n".join(lines)

    def _build_improvement_hints(self, task_type: str, metrics: dict,
                                  train_metrics: dict, fi_list: list) -> list[str]:
        """
        診断結果に基づいて改善のヒントを生成する。
        """
        hints = []

        # 過学習 → 低寄与特徴量の除外を提案
        if task_type == 'regression':
            gap = train_metrics.get('r2', 0) - metrics.get('r2', 0)
        else:
            gap = train_metrics.get('accuracy', 0) - metrics.get('accuracy', 0)

        total_importance = sum(f['importance'] for f in fi_list) if fi_list else 0
        low_features = []
        if total_importance > 0:
            low_features = [f['feature'] for f in fi_list if f['importance'] / total_importance < 0.01]

        if gap >= 0.1 and low_features:
            names = "、".join(low_features[:5])
            hints.append(f"過学習の兆候があるため、低寄与の特徴量（{names}）を除外して再学習してみてください。")
        elif gap >= 0.1:
            hints.append("過学習の兆候があります。特徴量の数を減らすか、データ件数を増やすことを検討してください。")
        elif low_features:
            names = "、".join(low_features[:5])
            hints.append(f"低寄与の特徴量（{names}）を除外すると、モデルがシンプルになります。")

        # 特徴量支配度 → 補完特徴量の追加を提案
        if fi_list and total_importance > 0:
            top_ratio = fi_list[0]['importance'] / total_importance
            if top_ratio >= 0.5:
                hints.append(f"「{fi_list[0]['feature']}」への依存度が高いため、これを補完する特徴量の追加を検討してください。")

        # クラス不均衡
        if task_type == 'classification':
            prec = metrics.get('precision', 0)
            rec = metrics.get('recall', 0)
            if abs(prec - rec) >= 0.15:
                hints.append("PrecisionとRecallに偏りがあります。データのクラス比率を確認してください。")

        # 精度が低い場合の一般的な提案
        if task_type == 'regression' and metrics.get('r2', 0) < 0.5:
            hints.append("予測精度が低めです。特徴量の追加やデータの前処理（欠損値補完、外れ値除去など）を検討してください。")
        elif task_type == 'classification' and metrics.get('accuracy', 0) < 0.7:
            hints.append("分類精度が低めです。特徴量の追加やデータの前処理を検討してください。")

        return hints

    @staticmethod
    def _sanitize_for_json(obj):
        """NumPy 型を再帰的に Python ネイティブ型へ変換する（JSON シリアライズ対策）"""
        if isinstance(obj, dict):
            return {k: MLService._sanitize_for_json(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [MLService._sanitize_for_json(v) for v in obj]
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.bool_):
            return bool(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return obj

    def _train_decision_tree(self, X_train, y_train, task_type: str, n_classes: int | None):
        """決定木モデルを学習して返す"""
        n_samples = len(X_train)
        min_leaf = max(20, int(n_samples * 0.01))
        common_params = dict(max_depth=5, min_samples_leaf=min_leaf, random_state=42)

        if task_type == "classification":
            dt = DecisionTreeClassifier(**common_params)
        else:
            dt = DecisionTreeRegressor(**common_params)

        dt.fit(X_train, y_train)
        logger.info(f"[DT] Decision tree trained. depth={dt.get_depth()}, leaves={dt.get_n_leaves()}")
        return dt

    def _extract_tree_structure(self, model, feature_names: list, class_names: list | None, node_id: int = 0) -> dict:
        """sklearn の決定木から可視化用のネスト dict を再帰的に生成する"""
        tree = model.tree_
        left = tree.children_left[node_id]
        right = tree.children_right[node_id]

        node = {
            "id": node_id,
            "samples": int(tree.n_node_samples[node_id]),
            "impurity": round(float(tree.impurity[node_id]), 4),
            "is_leaf": bool(left == sk_tree.TREE_LEAF),
        }

        if left == sk_tree.TREE_LEAF:
            value = tree.value[node_id]
            if class_names is not None:
                proba = value[0]
                total_proba = float(sum(proba))  # sklearn は割合を格納する場合があるため sum で正規化
                class_idx = int(np.argmax(proba))
                node["prediction"] = class_names[class_idx]
                node["confidence"] = round(float(proba[class_idx]) / total_proba, 3) if total_proba > 0 else 0.0
                node["class_counts"] = [int(round(float(v) / total_proba * tree.n_node_samples[node_id])) for v in proba]
            else:
                node["prediction"] = round(float(value[0][0]), 4)
                node["confidence"] = None
                node["std"] = round(float(np.sqrt(tree.impurity[node_id])), 4)
        else:
            node["feature"] = feature_names[tree.feature[node_id]]
            node["threshold"] = round(float(tree.threshold[node_id]), 4)
            node["left"] = self._extract_tree_structure(model, feature_names, class_names, left)
            node["right"] = self._extract_tree_structure(model, feature_names, class_names, right)

        return node

    def _extract_rules(self, model, feature_names: list, class_names: list | None, node_id: int = 0, conditions: list | None = None) -> list:
        """決定木から IF/THEN ルール一覧を再帰的に抽出する"""
        if conditions is None:
            conditions = []

        tree = model.tree_
        left = tree.children_left[node_id]
        right = tree.children_right[node_id]

        if left == sk_tree.TREE_LEAF:
            value = tree.value[node_id]
            total = int(tree.n_node_samples[node_id])
            if class_names is not None:
                proba = value[0]
                total_proba = float(sum(proba))  # sklearn は割合を格納する場合があるため sum で正規化
                class_idx = int(np.argmax(proba))
                prediction = class_names[class_idx]
                confidence = round(float(proba[class_idx]) / total_proba, 3) if total_proba > 0 else 0.0
            else:
                prediction = round(float(value[0][0]), 4)
                confidence = None
                std = round(float(np.sqrt(tree.impurity[node_id])), 4)
            return [{
                "conditions": conditions if conditions else ["(全データ)"],
                "prediction": prediction,
                "confidence": confidence,
                "std": std if confidence is None else None,
                "samples": total,
            }]

        feature = feature_names[tree.feature[node_id]]
        threshold = round(float(tree.threshold[node_id]), 4)

        rules = []
        rules.extend(self._extract_rules(model, feature_names, class_names, left,  conditions + [f"{feature} ≤ {threshold}"]))
        rules.extend(self._extract_rules(model, feature_names, class_names, right, conditions + [f"{feature} > {threshold}"]))
        return rules

