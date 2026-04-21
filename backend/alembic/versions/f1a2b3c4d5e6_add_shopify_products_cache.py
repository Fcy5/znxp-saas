"""add shopify_products_cache table

Revision ID: f1a2b3c4d5e6
Revises: e1f2a3b4c5d6
Create Date: 2026-04-21
"""
from alembic import op
import sqlalchemy as sa

revision = 'f1a2b3c4d5e6'
down_revision = 'e1f2a3b4c5d6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy.engine.reflection import Inspector
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    if 'shopify_products_cache' not in inspector.get_table_names():
        op.create_table(
            'shopify_products_cache',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('shop_id', sa.Integer(), nullable=False, index=True),
            sa.Column('shopify_product_id', sa.BigInteger(), nullable=False),
            sa.Column('title', sa.String(512), nullable=False, server_default=''),
            sa.Column('image_url', sa.String(1024), nullable=True),
            sa.Column('status', sa.String(32), nullable=True, server_default='active'),
            sa.Column('product_type', sa.String(255), nullable=True),
            sa.Column('tags', sa.String(1024), nullable=True),
            sa.Column('price', sa.String(32), nullable=True),
            sa.Column('published_at', sa.DateTime(), nullable=True),
            sa.Column('shopify_created_at', sa.DateTime(), nullable=True),
            sa.Column('synced_at', sa.DateTime(), nullable=True),
            sa.UniqueConstraint('shop_id', 'shopify_product_id', name='uq_shop_shopify_product'),
            mysql_engine='InnoDB',
            mysql_charset='utf8mb4',
        )


def downgrade() -> None:
    op.drop_table('shopify_products_cache')
