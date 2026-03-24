"""usersテーブル・project_membersテーブルの追加とprojectsテーブルへのowner_idカラム追加

Revision ID: 0003
Revises: 0002
Create Date: 2026-03-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0003'
down_revision: Union[str, None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """usersテーブルとproject_membersテーブルを作成し、projectsにowner_idを追加する"""

    # usersテーブルを作成
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(), nullable=False, comment='ユーザー名'),
        sa.Column('hashed_password', sa.String(), nullable=False, comment='ハッシュ化されたパスワード'),
        sa.Column('created_at', sa.DateTime(), nullable=True, comment='作成日時'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True)

    # project_membersテーブルを作成
    op.create_table(
        'project_members',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False, comment='所属プロジェクトID'),
        sa.Column('user_id', sa.Integer(), nullable=False, comment='メンバーのユーザーID'),
        sa.Column('role', sa.String(), nullable=False, comment='owner, editor, viewer'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_project_members_id'), 'project_members', ['id'], unique=False)
    op.create_index(op.f('ix_project_members_project_id'), 'project_members', ['project_id'], unique=False)
    op.create_index(op.f('ix_project_members_user_id'), 'project_members', ['user_id'], unique=False)

    # projectsテーブルにowner_idカラムを追加（nullable=Trueで既存データとの互換性を保つ）
    op.add_column('projects', sa.Column('owner_id', sa.Integer(), nullable=True, comment='オーナーユーザーID'))
    op.create_foreign_key(
        'fk_projects_owner_id_users',
        'projects', 'users',
        ['owner_id'], ['id']
    )


def downgrade() -> None:
    """追加したカラム・テーブルを削除する"""

    # projectsテーブルのowner_id外部キー・カラムを削除
    op.drop_constraint('fk_projects_owner_id_users', 'projects', type_='foreignkey')
    op.drop_column('projects', 'owner_id')

    # project_membersテーブルを削除
    op.drop_index(op.f('ix_project_members_user_id'), table_name='project_members')
    op.drop_index(op.f('ix_project_members_project_id'), table_name='project_members')
    op.drop_index(op.f('ix_project_members_id'), table_name='project_members')
    op.drop_table('project_members')

    # usersテーブルを削除
    op.drop_index(op.f('ix_users_username'), table_name='users')
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_table('users')
