"""add shop profile fields

Revision ID: 32b1a320c4e1
Revises: b2c3d4e5f6a7
Create Date: 2026-04-07 17:45:41.794866

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '32b1a320c4e1'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("shops", sa.Column("visual_style", sa.String(255), nullable=True))
    op.add_column("shops", sa.Column("profile_summary", sa.Text(), nullable=True))
    op.add_column("shops", sa.Column("profile_generated_at", sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column("shops", "profile_generated_at")
    op.drop_column("shops", "profile_summary")
    op.drop_column("shops", "visual_style")
