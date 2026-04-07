"""add agent_tasks missing columns

Revision ID: d70f9ee71669
Revises: 32b1a320c4e1
Create Date: 2026-04-07 17:50:33.373316

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd70f9ee71669'
down_revision: Union[str, Sequence[str], None] = '32b1a320c4e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("agent_tasks", sa.Column("product_id", sa.Integer(), nullable=True))
    op.add_column("agent_tasks", sa.Column("shop_id", sa.Integer(), nullable=True))
    op.add_column("agent_tasks", sa.Column("progress", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("agent_tasks", "progress")
    op.drop_column("agent_tasks", "shop_id")
    op.drop_column("agent_tasks", "product_id")
