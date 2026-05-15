from __future__ import annotations

import json
from dataclasses import dataclass

from app.core.config import settings


@dataclass(frozen=True)
class SelectionWeights:
    ad_validation: float
    social_heat: float
    profit: float
    market_competition: float
    product_quality: float
    trend_timing: float
    audience_fit: float
    embroidery_fit: float


@dataclass(frozen=True)
class SelectionThresholds:
    featured: float
    shortlisted: float
    rejected: float


@dataclass(frozen=True)
class SelectionPolicy:
    weights: SelectionWeights
    thresholds: SelectionThresholds
    quotas: dict[str, int]
    tag_sources: dict[str, str]


SELECTION_STANDARD_LIBRARY = {
    "gift_attributes": [
        "giftability",
        "relationship clarity",
        "occasion fit",
        "repeat gifting potential",
    ],
    "audiences": [
        "dad",
        "grandpa",
        "graduate",
        "family",
        "pet_owner",
        "traveler",
    ],
    "customization_difficulty": [
        "name",
        "date",
        "title",
        "line_art",
        "photo_keepsake",
    ],
    "visual_merchandising": [
        "visual impact",
        "ugc potential",
        "video potential",
        "embroidery visibility",
    ],
}


SELECTION_CAMPAIGNS = {
    "Memorial Day": {"keyword": "memorial", "category": "Gifts"},
    "Father's Day": {"keyword": "father", "category": "Apparel"},
    "Graduation": {"keyword": "graduation", "category": "Apparel"},
    "Summer": {"keyword": "summer", "category": None},
}

SELECTION_CAMPAIGN_DEFAULTS = {
    "Memorial Day": {
        "season_tags": ["spring", "summer"],
        "holiday_tags": ["memorial_day"],
        "audience_tags": ["family", "gift_buyer"],
        "scenario_tags": ["gift", "outdoor", "family"],
        "content_hook": "memorial keepsake / family gift / outdoor gathering",
    },
    "Father's Day": {
        "season_tags": ["spring", "summer"],
        "holiday_tags": ["fathers_day"],
        "audience_tags": ["dad", "family", "gift_buyer"],
        "scenario_tags": ["gift", "family", "bbq"],
        "content_hook": "gift for dad / father keepsake / family moment",
    },
    "Graduation": {
        "season_tags": ["spring", "summer"],
        "holiday_tags": ["graduation"],
        "audience_tags": ["graduate", "family", "gift_buyer"],
        "scenario_tags": ["gift", "school", "celebration"],
        "content_hook": "graduation keepsake / class of / personalized gift",
    },
    "Summer": {
        "season_tags": ["summer"],
        "holiday_tags": ["summer"],
        "audience_tags": ["traveler", "gift_buyer"],
        "scenario_tags": ["travel", "outdoor", "gift"],
        "content_hook": "summer gift / outdoor lifestyle / travel season",
    },
}

TAG_SOURCE_POLICY = {
    "season_tags": "title_image_platform_signal_rules",
    "holiday_tags": "title_image_platform_signal_rules",
    "audience_tags": "title_platform_signal_rules",
    "scenario_tags": "title_platform_signal_rules",
    "weekly_campaign": "keyword_campaign_relevance_rules",
    "event_window": "trend_and_holiday_window_rules",
    "customization_type": "custom_signal_rules",
}


def _load_campaign_quotas() -> dict[str, int]:
    quotas = {
        campaign: settings.selection_default_campaign_target
        for campaign in SELECTION_CAMPAIGNS
    }
    raw = settings.selection_campaign_quota_overrides.strip()
    if not raw:
        return quotas

    try:
        overrides = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("selection_campaign_quota_overrides must be valid JSON") from exc

    if not isinstance(overrides, dict):
        raise ValueError("selection_campaign_quota_overrides must be a JSON object")

    for campaign, quota in overrides.items():
        if campaign not in quotas:
            continue
        if not isinstance(quota, int) or quota <= 0:
            raise ValueError(f"Invalid quota for {campaign}: {quota}")
        quotas[campaign] = quota
    return quotas


SELECTION_CAMPAIGN_QUOTAS = _load_campaign_quotas()

SELECTION_WEIGHTS = SelectionWeights(
    ad_validation=settings.selection_weight_ad_validation,
    social_heat=settings.selection_weight_social_heat,
    profit=settings.selection_weight_profit,
    market_competition=settings.selection_weight_market_competition,
    product_quality=settings.selection_weight_product_quality,
    trend_timing=settings.selection_weight_trend_timing,
    audience_fit=settings.selection_weight_audience_fit,
    embroidery_fit=settings.selection_weight_embroidery_fit,
)

if round(
    SELECTION_WEIGHTS.ad_validation +
    SELECTION_WEIGHTS.social_heat +
    SELECTION_WEIGHTS.profit +
    SELECTION_WEIGHTS.market_competition +
    SELECTION_WEIGHTS.product_quality +
    SELECTION_WEIGHTS.trend_timing +
    SELECTION_WEIGHTS.audience_fit +
    SELECTION_WEIGHTS.embroidery_fit,
    6,
) != 1.0:
    raise ValueError("Selection score weights must sum to 1.0")

SELECTION_THRESHOLDS = SelectionThresholds(
    featured=settings.selection_threshold_featured,
    shortlisted=settings.selection_threshold_shortlisted,
    rejected=settings.selection_threshold_rejected,
)

SELECTION_POLICY = SelectionPolicy(
    weights=SELECTION_WEIGHTS,
    thresholds=SELECTION_THRESHOLDS,
    quotas=SELECTION_CAMPAIGN_QUOTAS,
    tag_sources=TAG_SOURCE_POLICY,
)
