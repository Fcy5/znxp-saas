from sqlalchemy import String, Integer, ForeignKey, Text, Float, JSON, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import BaseModel
from datetime import datetime


class PublishedProduct(BaseModel):
    """Records products published to Shopify stores."""
    __tablename__ = "published_products"

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    shop_id: Mapped[int] = mapped_column(Integer, ForeignKey("shops.id"), nullable=False, index=True)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("products.id"), nullable=False, index=True)

    # Shopify identifiers
    shopify_product_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    shopify_product_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Modified content (after AI rewrite)
    published_title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    published_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    published_price: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Status: pending / published / failed
    status: Mapped[str] = mapped_column(String(50), default="pending")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
