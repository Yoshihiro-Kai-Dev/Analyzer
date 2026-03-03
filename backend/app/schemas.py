from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime

# --- Project Schemas ---
class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None

class ProjectCreate(ProjectBase):
    pass

class Project(ProjectBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

# --- Column Schemas ---
class ColumnBase(BaseModel):
    physical_name: str
    display_name: str
    data_type: str
    inferred_type: str

class ColumnCreate(ColumnBase):
    pass

class Column(ColumnBase):
    id: int
    table_id: int

    class Config:
        from_attributes = True

# --- Table Schemas ---
class TableBase(BaseModel):
    original_filename: str
    physical_table_name: str
    row_count: int

class TableCreate(TableBase):
    pass

class Table(TableBase):
    id: int
    project_id: int
    created_at: datetime
    columns: List[Column] = []

    class Config:
        from_attributes = True

# --- Relation Schemas ---
class RelationBase(BaseModel):
    parent_table_id: int
    child_table_id: int
    join_keys: Dict[str, str] # {"parent_col": "col_a", "child_col": "col_b"}
    cardinality: str # "OneToOne" | "OneToMany"

class RelationCreate(RelationBase):
    pass

class Relation(RelationBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

# --- Analysis Config Schemas ---
class AnalysisConfigBase(BaseModel):
    name: Optional[str] = None
    main_table_id: int
    target_column_id: int
    task_type: str # "regression" | "classification"
    feature_settings: Optional[Dict[str, Any]] = None

class AnalysisConfigCreate(AnalysisConfigBase):
    pass

class AnalysisConfig(AnalysisConfigBase):
    id: int
    project_id: int
    created_at: datetime

    class Config:
        from_attributes = True

# --- Train Job/Result Schemas ---
class TrainResultBase(BaseModel):
    metrics: Dict[str, float]
    feature_importance: List[Dict[str, Any]]
    ai_analysis_text: Optional[str] = None
    model_path: Optional[str] = None

class TrainResult(TrainResultBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class TrainJobBase(BaseModel):
    config_id: int
    status: str
    progress: int
    message: Optional[str] = None
    error_message: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None

class TrainJobCreate(BaseModel):
    config_id: int

class TrainJob(TrainJobBase):
    id: int
    result: Optional[TrainResult] = None

    class Config:
        from_attributes = True
