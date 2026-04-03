"""init_saas_tables

Revision ID: 447f2c2cfcf6
Revises:
Create Date: 2026-03-26 17:02:20.272918

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '447f2c2cfcf6'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Only create NEW SaaS tables - do NOT touch existing old tables
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    if 'permissions' not in existing_tables:
        op.create_table('permissions',
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('endpoint', sa.String(length=255), nullable=False),
            sa.Column('method', sa.String(length=20), nullable=False),
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('is_deleted', sa.Boolean(), nullable=False),
            sa.PrimaryKeyConstraint('id')
        )

    if 'products' not in existing_tables:
        op.create_table('products',
            sa.Column('source_platform', sa.String(length=50), nullable=False),
            sa.Column('source_id', sa.String(length=255), nullable=False),
            sa.Column('source_url', sa.String(length=1000), nullable=True),
            sa.Column('title', sa.String(length=500), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('category', sa.String(length=255), nullable=True),
            sa.Column('brand', sa.String(length=255), nullable=True),
            sa.Column('price', sa.Float(), nullable=True),
            sa.Column('currency', sa.String(length=10), nullable=False),
            sa.Column('main_image', sa.String(length=1000), nullable=True),
            sa.Column('images', sa.JSON(), nullable=True),
            sa.Column('variants', sa.JSON(), nullable=True),
            sa.Column('sales_rank', sa.Integer(), nullable=True),
            sa.Column('sales_trend', sa.Float(), nullable=True),
            sa.Column('review_count', sa.Integer(), nullable=True),
            sa.Column('review_score', sa.Float(), nullable=True),
            sa.Column('tiktok_views', sa.Integer(), nullable=True),
            sa.Column('facebook_ad_count', sa.Integer(), nullable=True),
            sa.Column('gmc_search_volume', sa.Integer(), nullable=True),
            sa.Column('etsy_favorites', sa.Integer(), nullable=True),
            sa.Column('profit_margin_estimate', sa.Float(), nullable=True),
            sa.Column('sentiment_summary', sa.Text(), nullable=True),
            sa.Column('pain_points', sa.JSON(), nullable=True),
            sa.Column('ai_score', sa.Float(), nullable=True),
            sa.Column('is_published', sa.Boolean(), nullable=False),
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('is_deleted', sa.Boolean(), nullable=False),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_products_category', 'products', ['category'], unique=False)
        op.create_index('ix_products_source_id', 'products', ['source_id'], unique=False)
        op.create_index('ix_products_source_platform', 'products', ['source_platform'], unique=False)
        op.create_index('ix_products_title', 'products', ['title'], unique=False)

    if 'roles' not in existing_tables:
        op.create_table('roles',
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('is_deleted', sa.Boolean(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('name')
        )

    if 'suppliers' not in existing_tables:
        op.create_table('suppliers',
            sa.Column('name', sa.String(length=255), nullable=False),
            sa.Column('contact_email', sa.String(length=255), nullable=True),
            sa.Column('website', sa.String(length=500), nullable=True),
            sa.Column('country', sa.String(length=100), nullable=True),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('is_verified', sa.Boolean(), nullable=False),
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('is_deleted', sa.Boolean(), nullable=False),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_suppliers_name', 'suppliers', ['name'], unique=False)

    if 'users' not in existing_tables:
        op.create_table('users',
            sa.Column('email', sa.String(length=255), nullable=False),
            sa.Column('username', sa.String(length=100), nullable=False),
            sa.Column('hashed_password', sa.String(length=255), nullable=False),
            sa.Column('is_active', sa.Boolean(), nullable=False),
            sa.Column('is_superuser', sa.Boolean(), nullable=False),
            sa.Column('avatar', sa.String(length=500), nullable=True),
            sa.Column('subscription_tier', sa.String(length=50), nullable=False),
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('is_deleted', sa.Boolean(), nullable=False),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_users_email', 'users', ['email'], unique=True)
        op.create_index('ix_users_username', 'users', ['username'], unique=True)

    if 'role_permissions' not in existing_tables:
        op.create_table('role_permissions',
            sa.Column('role_id', sa.Integer(), nullable=False),
            sa.Column('permission_id', sa.Integer(), nullable=False),
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('is_deleted', sa.Boolean(), nullable=False),
            sa.ForeignKeyConstraint(['permission_id'], ['permissions.id']),
            sa.ForeignKeyConstraint(['role_id'], ['roles.id']),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_role_permissions_permission_id', 'role_permissions', ['permission_id'], unique=False)
        op.create_index('ix_role_permissions_role_id', 'role_permissions', ['role_id'], unique=False)

    if 'shops' not in existing_tables:
        op.create_table('shops',
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(length=255), nullable=False),
            sa.Column('domain', sa.String(length=255), nullable=False),
            sa.Column('platform', sa.String(length=50), nullable=False),
            sa.Column('shopify_access_token', sa.String(length=500), nullable=True),
            sa.Column('shop_profile', sa.JSON(), nullable=True),
            sa.Column('niche', sa.String(length=255), nullable=True),
            sa.Column('target_audience', sa.String(length=500), nullable=True),
            sa.Column('price_range_min', sa.Float(), nullable=True),
            sa.Column('price_range_max', sa.Float(), nullable=True),
            sa.Column('is_active', sa.Boolean(), nullable=False),
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('is_deleted', sa.Boolean(), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.id']),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_shops_domain', 'shops', ['domain'], unique=False)
        op.create_index('ix_shops_user_id', 'shops', ['user_id'], unique=False)

    if 'supplier_products' not in existing_tables:
        op.create_table('supplier_products',
            sa.Column('supplier_id', sa.Integer(), nullable=False),
            sa.Column('product_id', sa.Integer(), nullable=False),
            sa.Column('supplier_sku', sa.String(length=255), nullable=True),
            sa.Column('supplier_price', sa.Float(), nullable=True),
            sa.Column('moq', sa.Integer(), nullable=True),
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('is_deleted', sa.Boolean(), nullable=False),
            sa.ForeignKeyConstraint(['product_id'], ['products.id']),
            sa.ForeignKeyConstraint(['supplier_id'], ['suppliers.id']),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_supplier_products_product_id', 'supplier_products', ['product_id'], unique=False)
        op.create_index('ix_supplier_products_supplier_id', 'supplier_products', ['supplier_id'], unique=False)

    if 'user_roles' not in existing_tables:
        op.create_table('user_roles',
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('role_id', sa.Integer(), nullable=False),
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('is_deleted', sa.Boolean(), nullable=False),
            sa.ForeignKeyConstraint(['role_id'], ['roles.id']),
            sa.ForeignKeyConstraint(['user_id'], ['users.id']),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_user_roles_role_id', 'user_roles', ['role_id'], unique=False)
        op.create_index('ix_user_roles_user_id', 'user_roles', ['user_id'], unique=False)

    if 'agent_tasks' not in existing_tables:
        op.create_table('agent_tasks',
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('task_type', sa.String(length=100), nullable=False),
            sa.Column('status', sa.String(length=50), nullable=False),
            sa.Column('input_data', sa.JSON(), nullable=True),
            sa.Column('output_data', sa.JSON(), nullable=True),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('is_deleted', sa.Boolean(), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.id']),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_agent_tasks_status', 'agent_tasks', ['status'], unique=False)
        op.create_index('ix_agent_tasks_task_type', 'agent_tasks', ['task_type'], unique=False)
        op.create_index('ix_agent_tasks_user_id', 'agent_tasks', ['user_id'], unique=False)

    if 'user_products' not in existing_tables:
        op.create_table('user_products',
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('product_id', sa.Integer(), nullable=False),
            sa.Column('shop_id', sa.Integer(), nullable=True),
            sa.Column('status', sa.String(length=50), nullable=False),
            sa.Column('shopify_product_id', sa.String(length=255), nullable=True),
            sa.Column('custom_price', sa.Float(), nullable=True),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('is_deleted', sa.Boolean(), nullable=False),
            sa.ForeignKeyConstraint(['product_id'], ['products.id']),
            sa.ForeignKeyConstraint(['shop_id'], ['shops.id']),
            sa.ForeignKeyConstraint(['user_id'], ['users.id']),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_user_products_product_id', 'user_products', ['product_id'], unique=False)
        op.create_index('ix_user_products_user_id', 'user_products', ['user_id'], unique=False)


def downgrade() -> None:
    # Only drop tables we created (in reverse order)
    for table in ['user_products', 'agent_tasks', 'user_roles', 'supplier_products',
                  'shops', 'role_permissions', 'users', 'suppliers', 'roles',
                  'products', 'permissions']:
        bind = op.get_bind()
        inspector = sa.inspect(bind)
        if table in inspector.get_table_names():
            op.drop_table(table)
