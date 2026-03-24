"""prediction_jobs テーブルに name カラムを追加する

Revision ID: 0006
Revises: 0005
Create Date: 2026-03-24
"""

from alembic import op
import sqlalchemy as sa

revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('prediction_jobs', sa.Column('name', sa.String(), nullable=True, comment='ジョブの表示名'))


def downgrade():
    op.drop_column('prediction_jobs', 'name')
