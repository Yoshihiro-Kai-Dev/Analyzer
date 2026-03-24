"""prediction_jobsテーブルの追加

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# リビジョン識別子
revision: str = '0004'
down_revision: Union[str, None] = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """prediction_jobsテーブルを作成する"""
    op.create_table(
        'prediction_jobs',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('config_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('input_table_name', sa.String(), nullable=True),
        sa.Column('result_path', sa.String(), nullable=True),
        sa.Column('row_count', sa.Integer(), nullable=True),
        sa.Column('error_message', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['config_id'], ['analysis_configs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    """prediction_jobsテーブルを削除する"""
    op.drop_table('prediction_jobs')
