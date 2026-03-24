"""add value_labels to column_metadata

Revision ID: 0007
Revises: 0006
Create Date: 2026-03-24
"""
from alembic import op
import sqlalchemy as sa

revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('column_metadata', sa.Column('value_labels', sa.JSON(), nullable=True))

def downgrade():
    op.drop_column('column_metadata', 'value_labels')
