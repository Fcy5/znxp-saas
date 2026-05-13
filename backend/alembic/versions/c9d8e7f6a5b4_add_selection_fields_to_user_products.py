"""add selection fields to user_products

Revision ID: c9d8e7f6a5b4
Revises: h1i2j3k4l5m6
Create Date: 2026-05-12 12:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c9d8e7f6a5b4"
down_revision: Union[str, Sequence[str], None] = "h1i2j3k4l5m6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_products", sa.Column("season_tags", sa.JSON(), nullable=True))
    op.add_column("user_products", sa.Column("holiday_tags", sa.JSON(), nullable=True))
    op.add_column("user_products", sa.Column("audience_tags", sa.JSON(), nullable=True))
    op.add_column("user_products", sa.Column("scenario_tags", sa.JSON(), nullable=True))
    op.add_column("user_products", sa.Column("weekly_campaign", sa.String(length=100), nullable=True))
    op.add_column("user_products", sa.Column("event_window", sa.String(length=50), nullable=True))
    op.add_column("user_products", sa.Column("selection_status", sa.String(length=50), nullable=False, server_default="candidate"))
    op.add_column("user_products", sa.Column("selection_reason", sa.Text(), nullable=True))
    op.add_column("user_products", sa.Column("selection_confidence", sa.Float(), nullable=True))
    op.add_column("user_products", sa.Column("manual_review_flag", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("user_products", sa.Column("embroidery_position", sa.String(length=100), nullable=True))
    op.add_column("user_products", sa.Column("customization_type", sa.JSON(), nullable=True))
    op.add_column("user_products", sa.Column("embroidery_visibility", sa.Float(), nullable=True))
    op.add_column("user_products", sa.Column("giftability", sa.Float(), nullable=True))
    op.add_column("user_products", sa.Column("personalization_complexity", sa.Float(), nullable=True))
    op.add_column("user_products", sa.Column("content_hook", sa.Text(), nullable=True))
    op.add_column("user_products", sa.Column("visual_impact", sa.Float(), nullable=True))
    op.add_column("user_products", sa.Column("video_potential", sa.Float(), nullable=True))
    op.add_column("user_products", sa.Column("ugc_potential", sa.Float(), nullable=True))
    op.add_column("user_products", sa.Column("trend_score", sa.Float(), nullable=True))
    op.add_column("user_products", sa.Column("embroidery_fit_score", sa.Float(), nullable=True))
    op.add_column("user_products", sa.Column("gift_score", sa.Float(), nullable=True))
    op.add_column("user_products", sa.Column("campaign_score", sa.Float(), nullable=True))
    op.add_column("user_products", sa.Column("final_selection_score", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("user_products", "final_selection_score")
    op.drop_column("user_products", "campaign_score")
    op.drop_column("user_products", "gift_score")
    op.drop_column("user_products", "embroidery_fit_score")
    op.drop_column("user_products", "trend_score")
    op.drop_column("user_products", "ugc_potential")
    op.drop_column("user_products", "video_potential")
    op.drop_column("user_products", "visual_impact")
    op.drop_column("user_products", "content_hook")
    op.drop_column("user_products", "personalization_complexity")
    op.drop_column("user_products", "giftability")
    op.drop_column("user_products", "embroidery_visibility")
    op.drop_column("user_products", "customization_type")
    op.drop_column("user_products", "embroidery_position")
    op.drop_column("user_products", "manual_review_flag")
    op.drop_column("user_products", "selection_confidence")
    op.drop_column("user_products", "selection_reason")
    op.drop_column("user_products", "selection_status")
    op.drop_column("user_products", "event_window")
    op.drop_column("user_products", "weekly_campaign")
    op.drop_column("user_products", "scenario_tags")
    op.drop_column("user_products", "audience_tags")
    op.drop_column("user_products", "holiday_tags")
    op.drop_column("user_products", "season_tags")
