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


class SelectionMeta(BaseModel):
    season_tags: list[str] | None = None
    holiday_tags: list[str] | None = None
    audience_tags: list[str] | None = None
    scenario_tags: list[str] | None = None
    weekly_campaign: str | None = None
    event_window: str | None = None
    selection_status: str | None = None
    selection_reason: str | None = None
    selection_confidence: float | None = None
    manual_review_flag: bool = False
    embroidery_position: str | None = None
    customization_type: list[str] | None = None
    embroidery_visibility: float | None = None
    giftability: float | None = None
    personalization_complexity: float | None = None
    content_hook: str | None = None
    visual_impact: float | None = None
    video_potential: float | None = None
    ugc_potential: float | None = None
    trend_score: float | None = None
    embroidery_fit_score: float | None = None
    gift_score: float | None = None
    campaign_score: float | None = None
    final_selection_score: float | None = None

    model_config = {"from_attributes": True}


class LibraryProductCard(ProductCard, SelectionMeta):
    pass


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
    seo_title: str | None = None
    meta_description: str | None = None
    alt_tags: list | None = None
    ai_description: str | None = None
    selection_meta: SelectionMeta | None = None


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


class SelectionMetaUpdateRequest(BaseModel):
    season_tags: list[str] | None = None
    holiday_tags: list[str] | None = None
    audience_tags: list[str] | None = None
    scenario_tags: list[str] | None = None
    weekly_campaign: str | None = None
    event_window: str | None = None
    selection_status: str | None = None
    selection_reason: str | None = None
    selection_confidence: float | None = None
    manual_review_flag: bool | None = None
    embroidery_position: str | None = None
    customization_type: list[str] | None = None
    embroidery_visibility: float | None = None
    giftability: float | None = None
    personalization_complexity: float | None = None
    content_hook: str | None = None
    visual_impact: float | None = None
    video_potential: float | None = None
    ugc_potential: float | None = None
    trend_score: float | None = None
    embroidery_fit_score: float | None = None
    gift_score: float | None = None
    campaign_score: float | None = None
    final_selection_score: float | None = None
