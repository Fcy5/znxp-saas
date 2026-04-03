from pydantic import BaseModel
from typing import Any


class ProductCard(BaseModel):
    id: int
    title: str
    source_platform: str
    source_url: str | None
    main_image: str | None
    price: float | None
    sales_trend: float | None
    review_score: float | None
    tiktok_views: int | None
    facebook_ad_count: int | None
    ai_score: float | None
    profit_margin_estimate: float | None
    category: str | None

    model_config = {"from_attributes": True}


class ProductDetail(ProductCard):
    description: str | None
    images: list | None
    variants: list | None
    review_count: int | None
    gmc_search_volume: int | None
    etsy_favorites: int | None
    sentiment_summary: str | None
    pain_points: list | None
    source_url: str | None
    is_saved: bool = False


class ProductRecommendation(ProductCard):
    review_count: int | None = None
    rec_score: float          # 综合推荐分 0-100
    rec_reason: str           # 推荐理由文本


class ProductFilterRequest(BaseModel):
    page: int = 1
    page_size: int = 20
    category: str | None = None
    source_platform: str | None = None
    price_min: float | None = None
    price_max: float | None = None
    profit_margin_min: float | None = None
    sales_trend_min: float | None = None
    keyword: str | None = None
    brand: str | None = None
    sort_by: str = "ai_score"   # ai_score / sales_trend / tiktok_views
    sort_order: str = "desc"
