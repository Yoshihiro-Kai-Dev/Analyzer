"""add shap_importance to train_results

Revision ID: 82fa4ecfd148
Revises: 0007
Create Date: 2026-03-31
"""
from alembic import op
import sqlalchemy as sa

revision = '82fa4ecfd148'
down_revision = '0007'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('train_results',
        sa.Column('shap_importance', sa.JSON(), nullable=True)
    )

def downgrade():
    op.drop_column('train_results', 'shap_importance')
