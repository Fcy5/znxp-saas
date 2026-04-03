"""add published_products table

Revision ID: b2c3d4e5f6a7
Revises: 447f2c2cfcf6
Create Date: 2026-03-26
"""
from alembic import op
import sqlalchemy as sa

revision = 'b2c3d4e5f6a7'
down_revision = '447f2c2cfcf6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy.engine.reflection import Inspector
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    existing = inspector.get_table_names()

    if 'published_products' not in existing:
        op.create_table(
            'published_products',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False, index=True),
            sa.Column('shop_id', sa.Integer(), sa.ForeignKey('shops.id'), nullable=False, index=True),
            sa.Column('product_id', sa.Integer(), sa.ForeignKey('products.id'), nullable=False, index=True),
            sa.Column('shopify_product_id', sa.String(255), nullable=True),
            sa.Column('shopify_product_url', sa.String(500), nullable=True),
            sa.Column('published_title', sa.String(500), nullable=True),
            sa.Column('published_description', sa.Text(), nullable=True),
            sa.Column('published_price', sa.Float(), nullable=True),
            sa.Column('status', sa.String(50), nullable=False, server_default='pending'),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('published_at', sa.DateTime(), nullable=True),
            sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='0'),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )


def downgrade() -> None:
    op.drop_table('published_products')
