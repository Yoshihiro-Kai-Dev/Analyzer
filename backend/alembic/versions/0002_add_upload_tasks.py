"""upload_tasksテーブルを追加

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0002'
down_revision: Union[str, None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """upload_tasksテーブルを作成する"""
    op.create_table(
        'upload_tasks',
        sa.Column('id', sa.String(), nullable=False, comment='UUID形式のタスクID'),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(), nullable=True, comment='processing, completed, failed'),
        sa.Column('progress', sa.Integer(), nullable=True, comment='進捗（0-100）'),
        sa.Column('message', sa.String(), nullable=True, comment='進捗メッセージ'),
        sa.Column('result', sa.JSON(), nullable=True, comment='完了時の結果データ'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_upload_tasks_project_id'), 'upload_tasks', ['project_id'], unique=False)


def downgrade() -> None:
    """upload_tasksテーブルを削除する"""
    op.drop_index(op.f('ix_upload_tasks_project_id'), table_name='upload_tasks')
    op.drop_table('upload_tasks')
