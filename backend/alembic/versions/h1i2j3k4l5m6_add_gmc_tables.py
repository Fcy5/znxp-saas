"""add gmc tables and columns

Revision ID: h1i2j3k4l5m6
Revises: f1a2b3c4d5e6
Create Date: 2026-04-23
"""
from alembic import op
import sqlalchemy as sa

revision = 'h1i2j3k4l5m6'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy.engine.reflection import Inspector
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)

    # 新增 google_oauth_tokens 表
    if 'google_oauth_tokens' not in inspector.get_table_names():
        op.create_table(
            'google_oauth_tokens',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('user_id', sa.Integer(), nullable=False, unique=True, index=True),
            sa.Column('access_token', sa.Text(), nullable=True),
            sa.Column('refresh_token', sa.Text(), nullable=False),
            sa.Column('token_expiry', sa.DateTime(), nullable=True),
            sa.Column('datasource_id', sa.String(500), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('NOW()')),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.text('NOW()'), onupdate=sa.text('NOW()')),
            mysql_engine='InnoDB',
            mysql_charset='utf8mb4',
        )

    # shopify_products_cache 新增列
    existing_cols = {c['name'] for c in inspector.get_columns('shopify_products_cache')}
    if 'handle' not in existing_cols:
        op.add_column('shopify_products_cache', sa.Column('handle', sa.String(500), nullable=True))
    if 'gmc_product_id' not in existing_cols:
        op.add_column('shopify_products_cache', sa.Column('gmc_product_id', sa.String(500), nullable=True))
    if 'gmc_status' not in existing_cols:
        op.add_column('shopify_products_cache', sa.Column('gmc_status', sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_table('google_oauth_tokens')
    op.drop_column('shopify_products_cache', 'gmc_status')
    op.drop_column('shopify_products_cache', 'gmc_product_id')
    op.drop_column('shopify_products_cache', 'handle')
