"""add xhs_products_table

Revision ID: e1f2a3b4c5d6
Revises: d70f9ee71669
Create Date: 2026-04-16
"""
from alembic import op
import sqlalchemy as sa

revision = 'e1f2a3b4c5d6'
down_revision = '086d7c3ab1bd'
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy.engine.reflection import Inspector
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    existing = inspector.get_table_names()

    if 'xhs_products_table' not in existing:
        op.create_table(
            'xhs_products_table',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('title', sa.String(512), nullable=False, server_default=''),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('images', sa.Text(), nullable=True, comment='JSON 数组，本地路径'),
            sa.Column('author_name', sa.String(128), nullable=True, server_default=''),
            sa.Column('author_avatar', sa.String(512), nullable=True, server_default=''),
            sa.Column('likes_count', sa.Integer(), nullable=True, server_default='0'),
            sa.Column('xhs_url', sa.String(1024), nullable=True, server_default=''),
            sa.Column('keyword', sa.String(128), nullable=True, server_default=''),
            sa.Column('is_delete', sa.SmallInteger(), nullable=False, server_default='0'),
            sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('CURRENT_TIMESTAMP')),
            mysql_engine='InnoDB',
            mysql_charset='utf8mb4',
        )


def downgrade() -> None:
    op.drop_table('xhs_products_table')
