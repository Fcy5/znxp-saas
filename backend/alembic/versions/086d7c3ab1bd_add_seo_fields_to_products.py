"""add seo fields to products

Revision ID: 086d7c3ab1bd
Revises: d70f9ee71669
Create Date: 2026-04-08 17:29:22.843442

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision: str = '086d7c3ab1bd'
down_revision = 'd70f9ee71669'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('products', sa.Column('seo_title', sa.String(500), nullable=True))
    op.add_column('products', sa.Column('meta_description', sa.String(500), nullable=True))
    op.add_column('products', sa.Column('alt_tags', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('products', 'alt_tags')
    op.drop_column('products', 'meta_description')
    op.drop_column('products', 'seo_title')
