from sqlalchemy import String, Integer, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import BaseModel


class Shop(BaseModel):
    __tablename__ = "shops"

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    domain: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    platform: Mapped[str] = mapped_column(String(50), default="shopify")  # shopify / etsy / woocommerce
    access_token: Mapped[str | None] = mapped_column("shopify_access_token", String(500), nullable=True)

    # AI-generated store profile
    niche: Mapped[str | None] = mapped_column(String(255), nullable=True)
    target_audience: Mapped[str | None] = mapped_column(Text, nullable=True)
    price_range_min: Mapped[float | None] = mapped_column(nullable=True)
    price_range_max: Mapped[float | None] = mapped_column(nullable=True)
    visual_style: Mapped[str | None] = mapped_column(String(255), nullable=True)
    profile_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    profile_generated_at: Mapped[str | None] = mapped_column(String(50), nullable=True)
