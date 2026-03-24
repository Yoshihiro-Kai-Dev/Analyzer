"""初期スキーマ作成

Revision ID: 0001
Revises:
Create Date: 2026-03-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """初期テーブルを全て作成する"""
    # projects テーブル
    op.create_table(
        'projects',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_projects_id'), 'projects', ['id'], unique=False)
    op.create_index(op.f('ix_projects_name'), 'projects', ['name'], unique=False)

    # table_metadata テーブル
    op.create_table(
        'table_metadata',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('original_filename', sa.String(), nullable=True),
        sa.Column('physical_table_name', sa.String(), nullable=True),
        sa.Column('row_count', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_table_metadata_id'), 'table_metadata', ['id'], unique=False)
    op.create_index(op.f('ix_table_metadata_original_filename'), 'table_metadata', ['original_filename'], unique=False)
    op.create_index(op.f('ix_table_metadata_physical_table_name'), 'table_metadata', ['physical_table_name'], unique=True)
    op.create_index(op.f('ix_table_metadata_project_id'), 'table_metadata', ['project_id'], unique=False)

    # column_metadata テーブル
    op.create_table(
        'column_metadata',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('table_id', sa.Integer(), nullable=True),
        sa.Column('physical_name', sa.String(), nullable=True),
        sa.Column('display_name', sa.String(), nullable=True),
        sa.Column('data_type', sa.String(), nullable=True),
        sa.Column('inferred_type', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['table_id'], ['table_metadata.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_column_metadata_id'), 'column_metadata', ['id'], unique=False)

    # relation_definitions テーブル
    op.create_table(
        'relation_definitions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('parent_table_id', sa.Integer(), nullable=False),
        sa.Column('child_table_id', sa.Integer(), nullable=False),
        sa.Column('join_keys', sa.JSON(), nullable=False),
        sa.Column('cardinality', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['child_table_id'], ['table_metadata.id'], ),
        sa.ForeignKeyConstraint(['parent_table_id'], ['table_metadata.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_relation_definitions_id'), 'relation_definitions', ['id'], unique=False)

    # analysis_configs テーブル
    op.create_table(
        'analysis_configs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('main_table_id', sa.Integer(), nullable=False),
        sa.Column('target_column_id', sa.Integer(), nullable=False),
        sa.Column('task_type', sa.String(), nullable=False),
        sa.Column('model_type', sa.String(), nullable=True),
        sa.Column('feature_settings', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['main_table_id'], ['table_metadata.id'], ),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ),
        sa.ForeignKeyConstraint(['target_column_id'], ['column_metadata.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_analysis_configs_id'), 'analysis_configs', ['id'], unique=False)
    op.create_index(op.f('ix_analysis_configs_project_id'), 'analysis_configs', ['project_id'], unique=False)

    # train_jobs テーブル
    op.create_table(
        'train_jobs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('config_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('progress', sa.Integer(), nullable=True),
        sa.Column('message', sa.String(), nullable=True),
        sa.Column('error_message', sa.String(), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['config_id'], ['analysis_configs.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_train_jobs_id'), 'train_jobs', ['id'], unique=False)

    # train_results テーブル
    op.create_table(
        'train_results',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('job_id', sa.Integer(), nullable=False),
        sa.Column('metrics', sa.JSON(), nullable=True),
        sa.Column('feature_importance', sa.JSON(), nullable=True),
        sa.Column('ai_analysis_text', sa.String(), nullable=True),
        sa.Column('model_path', sa.String(), nullable=True),
        sa.Column('model_type', sa.String(), nullable=True),
        sa.Column('coef_stats', sa.JSON(), nullable=True),
        sa.Column('tree_structure', sa.JSON(), nullable=True),
        sa.Column('decision_rules', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['job_id'], ['train_jobs.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_train_results_id'), 'train_results', ['id'], unique=False)


def downgrade() -> None:
    """全テーブルを削除する"""
    op.drop_table('train_results')
    op.drop_table('train_jobs')
    op.drop_table('analysis_configs')
    op.drop_table('relation_definitions')
    op.drop_table('column_metadata')
    op.drop_table('table_metadata')
    op.drop_table('projects')
