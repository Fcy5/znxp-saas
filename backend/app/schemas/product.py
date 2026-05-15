from pydantic import BaseModel, field_validator
from typing import Any

WEEKLY_CAMPAIGNS = {"Memorial Day", "Father's Day", "Graduation", "Summer"}
SELECTION_STATUSES = {"candidate", "shortlisted", "featured", "rejected"}


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
    score_breakdown: dict[str, float] | None = None
    score_summary: str | None = None
    tag_confidence: float | None = None
    tag_summary: str | None = None
    review_feedback: dict[str, Any] | None = None

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


class SelectionCampaignBucket(BaseModel):
    campaign: str
    keyword: str
    category: str | None = None
    total_candidates: int
    products: list[ProductCard]


class SelectionCampaignSummary(BaseModel):
    campaign: str
    candidate: int
    shortlisted: int
    featured: int
    rejected: int
    total: int


class SelectionOverview(BaseModel):
    candidate: int
    shortlisted: int
    featured: int
    rejected: int
    total: int
    campaigns: list[SelectionCampaignSummary]
    top_products: list[LibraryProductCard]


class SelectionAutoCurateResult(BaseModel):
    candidate: int
    shortlisted: int
    featured: int
    rejected: int
    total_curated: int
    total_saved: int
    campaigns: list[SelectionCampaignSummary]


class SelectionWeightConfig(BaseModel):
    ad_validation: float
    social_heat: float
    profit: float
    market_competition: float
    product_quality: float
    trend_timing: float
    audience_fit: float
    embroidery_fit: float


class SelectionThresholdConfig(BaseModel):
    featured: float
    shortlisted: float
    rejected: float


class SelectionCampaignPolicy(BaseModel):
    campaign: str
    target_quota: int
    effective_target_quota: int
    minimum_relevance_score: int
    strict_custom_signal: bool
    strict_audience_signal: bool
    strict_scenario_signal: bool
    feedback_sample_count: int
    recommended_adjustments: list[str]


class SelectionPolicyResponse(BaseModel):
    weights: SelectionWeightConfig
    thresholds: SelectionThresholdConfig
    tag_sources: dict[str, str]
    campaigns: list[SelectionCampaignPolicy]


class SelectionStandardsResponse(BaseModel):
    gift_attributes: list[str]
    audiences: list[str]
    customization_difficulty: list[str]
    visual_merchandising: list[str]


class SelectionFeedbackPayload(BaseModel):
    outcome: str
    reasons: list[str] = []
    notes: str | None = None
    next_action: str | None = None


class SelectionFeedbackSummaryCampaign(BaseModel):
    campaign: str
    total_feedback: int
    approved: int
    rejected: int
    missed: int
    top_reasons: list[str]
    recommended_adjustments: list[str]


class SelectionFeedbackSummary(BaseModel):
    total_feedback: int
    total_approved: int
    total_rejected: int
    total_missed: int
    campaigns: list[SelectionFeedbackSummaryCampaign]
    global_recommendations: list[str]


class SelectionTaggingResponse(BaseModel):
    season_tags: list[str]
    holiday_tags: list[str]
    audience_tags: list[str]
    scenario_tags: list[str]
    customization_type: list[str]
    event_window: str | None
    content_hook: str | None
    tag_confidence: float
    tag_summary: str


class SelectionBatchUpdateRequest(BaseModel):
    product_ids: list[int]
    selection_status: str | None = None
    manual_review_flag: bool | None = None

    @field_validator("selection_status")
    @classmethod
    def validate_batch_selection_status(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if value not in SELECTION_STATUSES:
            raise ValueError(f"selection_status must be one of: {', '.join(sorted(SELECTION_STATUSES))}")
        return value


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

    @field_validator("weekly_campaign")
    @classmethod
    def validate_weekly_campaign(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if value not in WEEKLY_CAMPAIGNS:
            raise ValueError(f"weekly_campaign must be one of: {', '.join(sorted(WEEKLY_CAMPAIGNS))}")
        return value

    @field_validator("selection_status")
    @classmethod
    def validate_selection_status(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if value not in SELECTION_STATUSES:
            raise ValueError(f"selection_status must be one of: {', '.join(sorted(SELECTION_STATUSES))}")
        return value
