from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, JSON, Float, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.session import Base

class User(Base):
    """
    ユーザー情報
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True, comment="ユーザー名")
    hashed_password = Column(String, nullable=False, comment="ハッシュ化されたパスワード")
    created_at = Column(DateTime, default=datetime.now, comment="作成日時")

    # リレーション
    owned_projects = relationship("Project", back_populates="owner")
    memberships = relationship("ProjectMember", back_populates="user", cascade="all, delete-orphan")


class Project(Base):
    """
    プロジェクト情報
    """
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True, comment="プロジェクト名")
    description = Column(String, nullable=True, comment="プロジェクト概要")
    created_at = Column(DateTime, default=datetime.now)

    # オーナーユーザーID（nullable=Trueで既存データとの互換性を保つ）
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True, comment="オーナーユーザーID")

    # リレーション
    owner = relationship("User", back_populates="owned_projects")
    members = relationship("ProjectMember", back_populates="project", cascade="all, delete-orphan")
    tables = relationship("TableMetadata", back_populates="project", cascade="all, delete-orphan")
    analysis_configs = relationship("AnalysisConfig", back_populates="project", cascade="all, delete-orphan")


class TableMetadata(Base):
    """
    アップロードされたデータテーブルの管理情報
    """
    __tablename__ = "table_metadata"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True) # Project紐付け
    original_filename = Column(String, index=True, comment="アップロード時の元ファイル名")
    physical_table_name = Column(String, unique=True, index=True, comment="DB上の物理テーブル名")
    row_count = Column(Integer, comment="レコード件数")
    created_at = Column(DateTime, default=datetime.now, comment="作成日時")
    
    # リレーション関係
    project = relationship("Project", back_populates="tables")
    columns = relationship("ColumnMetadata", back_populates="table", cascade="all, delete-orphan")
    
    # 結合元としてのリレーション
    parent_relations = relationship("RelationDefinition", foreign_keys="RelationDefinition.parent_table_id", back_populates="parent_table", cascade="all, delete-orphan")
    # 結合先としてのリレーション
    child_relations = relationship("RelationDefinition", foreign_keys="RelationDefinition.child_table_id", back_populates="child_table", cascade="all, delete-orphan")


class ColumnMetadata(Base):
    """
    各テーブルのカラム定義情報
    """
    __tablename__ = "column_metadata"

    id = Column(Integer, primary_key=True, index=True)
    table_id = Column(Integer, ForeignKey("table_metadata.id"))
    
    physical_name = Column(String, comment="DB上の物理カラム名")
    display_name = Column(String, comment="表示用カラム名（ヘッダー）")
    data_type = Column(String, comment="データ型（Pandas/DB型）")
    inferred_type = Column(String, comment="推論された分析用型（numeric, categorical, datetime等）")
    
    table = relationship("TableMetadata", back_populates="columns")


class RelationDefinition(Base):
    """
    テーブル間のリレーション定義
    """
    __tablename__ = "relation_definitions"
    
    id = Column(Integer, primary_key=True, index=True)
    # project_id は table経由で特定可能だが、クエリ利便性のためあえて持たせても良い。
    # ここではシンプルに table_id のみとするが、APIで project 内のテーブル同士かチェックする。
    
    parent_table_id = Column(Integer, ForeignKey("table_metadata.id"), nullable=False, comment="結合元（親）テーブルID")
    child_table_id = Column(Integer, ForeignKey("table_metadata.id"), nullable=False, comment="結合先（子）テーブルID")
    
    # 結合キー: {"parent_col": "id", "child_col": "user_id"} のようなJSON形式で保存
    join_keys = Column(JSON, nullable=False, comment="結合キー定義")
    
    cardinality = Column(String, nullable=False, comment="OneToOne or OneToMany")
    
    created_at = Column(DateTime, default=datetime.now)
    
    parent_table = relationship("TableMetadata", foreign_keys=[parent_table_id], back_populates="parent_relations")
    child_table = relationship("TableMetadata", foreign_keys=[child_table_id], back_populates="child_relations")


class AnalysisConfig(Base):
    """
    分析設定情報
    """
    __tablename__ = "analysis_configs"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True) # Project紐付け
    name = Column(String, nullable=True, comment="分析設定名") # project_name ではなく name に変更 (project_idがあるため)
    
    main_table_id = Column(Integer, ForeignKey("table_metadata.id"), nullable=False, comment="分析対象のメインテーブル")
    target_column_id = Column(Integer, ForeignKey("column_metadata.id"), nullable=False, comment="目的変数となるカラム")
    
    task_type = Column(String, nullable=False, comment="regression or classification")
    model_type = Column(String, nullable=True, default="gradient_boosting",
                        comment="使用モデル: gradient_boosting or logistic_regression")

    feature_settings = Column(JSON, nullable=True, comment="特徴量の設定")
    
    created_at = Column(DateTime, default=datetime.now)
    
    project = relationship("Project", back_populates="analysis_configs")
    main_table = relationship("TableMetadata")
    target_column = relationship("ColumnMetadata")
    
    # 削除ルール: Config削除でJobも削除
    jobs = relationship("TrainJob", back_populates="config", cascade="all, delete-orphan")


class TrainJob(Base):
    """
    学習ジョブの管理
    """
    __tablename__ = "train_jobs"

    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("analysis_configs.id"), nullable=False)
    
    status = Column(String, default="pending", comment="pending, running, completed, failed")
    progress = Column(Integer, default=0, comment="0-100")
    message = Column(String, nullable=True)
    error_message = Column(String, nullable=True)
    
    started_at = Column(DateTime, default=datetime.now)
    completed_at = Column(DateTime, nullable=True)
    
    config = relationship("AnalysisConfig", back_populates="jobs")
    result = relationship("TrainResult", uselist=False, back_populates="job", cascade="all, delete-orphan")


class ProjectMember(Base):
    """
    プロジェクトメンバーの管理（オーナー・編集者・閲覧者）
    """
    __tablename__ = "project_members"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True, comment="所属プロジェクトID")
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True, comment="メンバーのユーザーID")
    # ロール: owner（オーナー）, editor（編集者）, viewer（閲覧者）
    role = Column(String, nullable=False, default="viewer", comment="owner, editor, viewer")

    # リレーション
    project = relationship("Project", back_populates="members")
    user = relationship("User", back_populates="memberships")


class UploadTask(Base):
    """
    CSVアップロードタスクの進捗管理
    サーバー再起動後もタスク状態を復元できるようDBで永続管理する
    """
    __tablename__ = "upload_tasks"

    id = Column(String, primary_key=True, comment="UUID形式のタスクID")
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    status = Column(String, default="processing", comment="processing, completed, failed")
    progress = Column(Integer, default=0, comment="進捗（0-100）")
    message = Column(String, nullable=True, comment="進捗メッセージ")
    result = Column(JSON, nullable=True, comment="完了時の結果データ")
    created_at = Column(DateTime, default=datetime.now)


class TrainResult(Base):
    """
    学習結果（評価指標、特徴量重要度）
    """
    __tablename__ = "train_results"
    
    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("train_jobs.id"), nullable=False)
    
    # 評価指標 (RMSE, Accuracy等) をJSONで保存
    metrics = Column(JSON, nullable=True)
    
    # 特徴量重要度をJSONで保存 [{"feature": "col_A", "importance": 0.5}, ...]
    feature_importance = Column(JSON, nullable=True)
    
    # AIによる分析コメント
    ai_analysis_text = Column(String, nullable=True, comment="AIによる分析コメント")

    model_path = Column(String, nullable=True, comment="保存されたモデルファイルのパス")

    # 使用モデル
    model_type = Column(String, nullable=True, comment="使用されたモデルタイプ")

    # 線形/ロジスティック回帰の係数統計量 (p値・オッズ比・信頼区間)
    coef_stats = Column(JSON, nullable=True, comment="係数統計量(p値/OR/CI)")

    # 決定木
    tree_structure = Column(JSON, nullable=True, comment="決定木のノード構造(JSON)")
    decision_rules = Column(JSON, nullable=True, comment="IF/THENルール一覧(JSON)")
    
    created_at = Column(DateTime, default=datetime.now)
    
    job = relationship("TrainJob", back_populates="result")

