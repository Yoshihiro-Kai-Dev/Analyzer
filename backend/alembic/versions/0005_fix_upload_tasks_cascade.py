"""upload_tasksのFKにON DELETE CASCADEを追加

Revision ID: 0005
Revises: 0004
Create Date: 2026-03-23
"""
from alembic import op

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade():
    # 既存のFK制約を削除してCASCADE付きで再作成する
    op.drop_constraint('upload_tasks_project_id_fkey', 'upload_tasks', type_='foreignkey')
    op.create_foreign_key(
        'upload_tasks_project_id_fkey',
        'upload_tasks', 'projects',
        ['project_id'], ['id'],
        ondelete='CASCADE',
    )


def downgrade():
    op.drop_constraint('upload_tasks_project_id_fkey', 'upload_tasks', type_='foreignkey')
    op.create_foreign_key(
        'upload_tasks_project_id_fkey',
        'upload_tasks', 'projects',
        ['project_id'], ['id'],
    )
