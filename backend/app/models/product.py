from sqlalchemy import String, Integer, Float, Text, JSON, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import BaseModel


class Product(BaseModel):
    __tablename__ = "products"

    # Source info
    source_platform: Mapped[str] = mapped_column(String(50), index=True)  # amazon / etsy / tiktok / facebook
    source_id: Mapped[str] = mapped_column(String(255), index=True)
    source_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    # Basic info
    title: Mapped[str] = mapped_column(String(500), index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    brand: Mapped[str | None] = mapped_column(String(255), nullable=True)
    price: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String(10), default="USD")
    main_image: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    images: Mapped[list | None] = mapped_column(JSON, nullable=True)
    variants: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # Trend metrics
    sales_rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sales_trend: Mapped[float | None] = mapped_column(Float, nullable=True)   # % growth
    review_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    review_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    tiktok_views: Mapped[int | None] = mapped_column(Integer, nullable=True)
    facebook_ad_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gmc_search_volume: Mapped[int | None] = mapped_column(Integer, nullable=True)
    etsy_favorites: Mapped[int | None] = mapped_column(Integer, nullable=True)
    profit_margin_estimate: Mapped[float | None] = mapped_column(Float, nullable=True)

    # AI Analysis
    sentiment_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    pain_points: Mapped[list | None] = mapped_column(JSON, nullable=True)
    ai_score: Mapped[float | None] = mapped_column(Float, nullable=True)   # 0-100

    is_published: Mapped[bool] = mapped_column(Boolean, default=False)


class UserProduct(BaseModel):
    """用户收藏/加入库的商品"""
    __tablename__ = "user_products"

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("products.id"), index=True)
    shop_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("shops.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="saved")  # saved / optimizing / published
    shopify_product_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    custom_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
