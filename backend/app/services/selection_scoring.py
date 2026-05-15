from __future__ import annotations

from dataclasses import dataclass

from app.core.selection_config import SELECTION_THRESHOLDS, SELECTION_WEIGHTS
from app.models.product import Product, UserProduct


@dataclass
class SelectionScoreBreakdown:
    ad_validation: float
    social_heat: float
    profit: float
    market_competition: float
    product_quality: float
    trend_timing: float
    audience_fit: float
    embroidery_fit: float


@dataclass
class SelectionScoreResult:
    embroidery_fit_score: float
    trend_score: float
    gift_score: float
    campaign_score: float
    final_selection_score: float
    selection_confidence: float
    selection_reason: str
    score_summary: str
    score_breakdown: dict[str, float]
    manual_review_flag: bool
    recommended_status: str


def _clamp(value: float, minimum: float = 0.0, maximum: float = 100.0) -> float:
    return round(max(minimum, min(maximum, value)), 2)


def _has_any(text: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword in text for keyword in keywords)


def _product_text(product: Product) -> str:
    return " ".join(
        part.lower()
        for part in [
            product.title or "",
            product.category or "",
            product.description or "",
            product.brand or "",
            product.sentiment_summary or "",
            " ".join(product.pain_points or []),
        ]
        if part
    )


def _score_embroidery_fit(product: Product, record: UserProduct) -> tuple[float, bool]:
    text = _product_text(product)
    score = 0.0

    explicit_position = bool(record.embroidery_position)
    inferred_surface = _has_any(
        text,
        (
            "embroider",
            "embroidered",
            "embroidery",
            "monogram",
            "stitched",
            "hoodie",
            "sweatshirt",
            "crewneck",
            "shirt",
            "tee",
            "cap",
            "hat",
            "tote",
            "blanket",
            "apron",
            "pillow",
        ),
    )
    custom_types = {item.lower() for item in (record.customization_type or [])}
    if explicit_position:
        score += 22
    elif inferred_surface:
        score += 15

    if custom_types:
        score += min(18, len(custom_types) * 6)
    elif _has_any(text, ("personalized", "custom", "name", "gift", "keepsake", "monogram")):
        score += 10

    if record.embroidery_visibility is not None:
        score += record.embroidery_visibility * 0.2
    elif product.main_image:
        score += 10

    if record.giftability is not None:
        score += record.giftability * 0.18
    elif _has_any(text, ("gift", "dad", "father", "graduate", "memorial", "family", "keepsake")):
        score += 12

    if record.visual_impact is not None:
        score += record.visual_impact * 0.15
    elif product.main_image:
        score += 8

    if record.video_potential is not None:
        score += record.video_potential * 0.12
    if record.ugc_potential is not None:
        score += record.ugc_potential * 0.1

    has_custom_signal = bool(custom_types) or _has_any(
        text,
        ("personalized", "custom", "name", "initial", "portrait", "keepsake", "gift"),
    )
    manual_review = score < 52 or (not explicit_position and not inferred_surface and not has_custom_signal)
    return _clamp(score), manual_review


def _score_ad_validation(product: Product) -> float:
    score = 0.0
    if product.facebook_ad_count:
        score += 34 if product.facebook_ad_count >= 21 else 24 if product.facebook_ad_count >= 10 else 12
    if product.review_count:
        score += 24 if product.review_count >= 1000 else 16 if product.review_count >= 200 else 8
    if product.gmc_search_volume:
        score += 20 if product.gmc_search_volume >= 5000 else 12 if product.gmc_search_volume >= 1000 else 6
    if product.review_score:
        score += 14 if product.review_score >= 4.7 else 8 if product.review_score >= 4.4 else 3
    return _clamp(score)


def _score_social_heat(product: Product) -> float:
    score = 0.0
    if product.tiktok_views:
        score += 42 if product.tiktok_views >= 5_000_000 else 30 if product.tiktok_views >= 1_000_000 else 16
    if product.etsy_favorites:
        score += 18 if product.etsy_favorites >= 5000 else 10 if product.etsy_favorites >= 1000 else 4
    if product.review_count:
        score += 18 if product.review_count >= 1000 else 10 if product.review_count >= 100 else 4
    if product.ai_score:
        score += min(16, product.ai_score * 0.16)
    return _clamp(score)


def _score_profit(product: Product) -> float:
    margin = product.profit_margin_estimate or 0
    if margin >= 60:
        return 95.0
    if margin >= 50:
        return 84.0
    if margin >= 40:
        return 72.0
    if margin >= 30:
        return 55.0
    return 28.0 if margin else 18.0


def _score_market_competition(product: Product, record: UserProduct) -> float:
    text = _product_text(product)
    score = 55.0
    if _has_any(text, ("licensed", "disney", "marvel", "nfl", "nba")):
        score -= 28
    if product.category and product.category.lower() in {"apparel", "gifts", "accessories", "home decor"}:
        score += 8
    if _has_any(text, ("personalized", "custom", "embroider", "monogram", "keepsake")):
        score += 16
    if record.weekly_campaign and _has_any(text, ("dad", "graduate", "memorial", "summer", "bbq", "travel")):
        score += 8
    if product.facebook_ad_count and product.facebook_ad_count > 25:
        score -= 10
    return _clamp(score)


def _score_product_quality(product: Product, record: UserProduct) -> float:
    score = 35.0
    if product.review_score:
        score += 25 if product.review_score >= 4.7 else 16 if product.review_score >= 4.4 else 8
    if product.review_count:
        score += 16 if product.review_count >= 500 else 8 if product.review_count >= 100 else 2
    if record.personalization_complexity is not None:
        score += max(0.0, 14 - record.personalization_complexity * 0.14)
    else:
        score += 10
    if product.main_image:
        score += 10
    return _clamp(score)


def _score_trend_timing(product: Product, record: UserProduct) -> float:
    score = 20.0
    if product.sales_trend:
        score += 26 if product.sales_trend >= 80 else 18 if product.sales_trend >= 40 else 8
    if product.gmc_search_volume:
        score += 18 if product.gmc_search_volume >= 5000 else 10 if product.gmc_search_volume >= 1000 else 4
    event_window = (record.event_window or "").lower()
    if event_window == "warming":
        score += 18
    elif event_window == "peak":
        score += 12
    elif event_window == "tail":
        score -= 6
    return _clamp(score)


def _score_audience_fit(product: Product, record: UserProduct) -> tuple[float, float]:
    text = _product_text(product)
    score = 0.0
    campaign_score = 0.0

    if record.audience_tags:
        score += min(22, len(record.audience_tags) * 7)
    if record.scenario_tags:
        score += min(18, len(record.scenario_tags) * 6)
    if record.giftability is not None:
        score += record.giftability * 0.32
    elif _has_any(text, ("gift", "dad", "father", "graduate", "memorial", "family", "travel")):
        score += 26

    if product.price and 19 <= product.price <= 65:
        score += 16
    elif product.price and 15 <= product.price <= 85:
        score += 8

    campaign = (record.weekly_campaign or "").lower()
    campaign_keywords = {
        "memorial day": ("memorial", "memory", "remembrance", "family", "patriotic", "bbq", "outdoor"),
        "father's day": ("father", "dad", "daddy", "grandpa", "bbq", "fishing", "husband"),
        "graduation": ("graduation", "graduate", "class of", "college", "school", "senior"),
        "summer": ("summer", "beach", "vacation", "travel", "camp", "outdoor", "sun"),
    }
    if campaign:
        campaign_score += 15
    if campaign in campaign_keywords and _has_any(text, campaign_keywords[campaign]):
        campaign_score += 48
    if record.holiday_tags and any(tag.lower() in campaign for tag in record.holiday_tags):
        campaign_score += 15
    if record.scenario_tags:
        campaign_score += min(12, len(record.scenario_tags) * 4)
    if record.audience_tags:
        campaign_score += min(10, len(record.audience_tags) * 3)

    return _clamp(score), _clamp(campaign_score)


def _build_reason(
    product: Product,
    record: UserProduct,
    breakdown: SelectionScoreBreakdown,
    final_selection_score: float,
) -> str:
    reasons: list[str] = []

    if record.weekly_campaign:
        reasons.append(f"专题归属明确，适合 {record.weekly_campaign} 周选品池")
    if breakdown.embroidery_fit >= 70:
        reasons.append("刺绣位和定制表达清晰，适合做名字、称呼或纪念内容")
    elif breakdown.embroidery_fit >= 55:
        reasons.append("具备刺绣改造空间，但仍建议复核刺绣位和成片效果")
    if breakdown.ad_validation >= 65:
        reasons.append("广告和成交验证信号较强，已具备初步商业验证")
    if breakdown.social_heat >= 60:
        reasons.append("社媒热度和内容传播信号较强，适合优先测试")
    if breakdown.profit >= 68:
        reasons.append(f"预估利润率 {product.profit_margin_estimate:.0f}% ，利润空间健康")
    if breakdown.audience_fit >= 60:
        reasons.append("人群和送礼场景清晰，便于做节日承接和内容表达")
    if breakdown.market_competition < 45:
        reasons.append("竞争和差异化空间一般，需要靠设计或表达拉开区分度")
    if final_selection_score < SELECTION_THRESHOLDS.rejected:
        reasons.append("当前综合信号偏弱，建议暂时淘汰或等待更强验证信号")
    if not reasons:
        reasons.append("基础数据可用，但缺少强专题和强定制优势，建议人工复核")
    return "；".join(reasons) + "。"


def _build_score_summary(breakdown: SelectionScoreBreakdown, final_selection_score: float) -> str:
    strongest = sorted(breakdown.__dict__.items(), key=lambda item: item[1], reverse=True)[:3]
    strong_text = " / ".join(f"{name}:{value:.0f}" for name, value in strongest)
    return f"综合分 {final_selection_score:.1f}，优势维度 {strong_text}"


def _recommended_status(final_selection_score: float, manual_review_flag: bool) -> str:
    if final_selection_score >= SELECTION_THRESHOLDS.featured and not manual_review_flag:
        return "featured"
    if final_selection_score >= SELECTION_THRESHOLDS.shortlisted:
        return "shortlisted"
    if final_selection_score < SELECTION_THRESHOLDS.rejected:
        return "rejected"
    return "candidate"


def score_selection_candidate(product: Product, record: UserProduct) -> SelectionScoreResult:
    embroidery_fit, manual_review_flag = _score_embroidery_fit(product, record)
    ad_validation = _score_ad_validation(product)
    social_heat = _score_social_heat(product)
    profit = _score_profit(product)
    market_competition = _score_market_competition(product, record)
    product_quality = _score_product_quality(product, record)
    trend_timing = _score_trend_timing(product, record)
    audience_fit, campaign_fit = _score_audience_fit(product, record)

    breakdown = SelectionScoreBreakdown(
        ad_validation=ad_validation,
        social_heat=social_heat,
        profit=profit,
        market_competition=market_competition,
        product_quality=product_quality,
        trend_timing=trend_timing,
        audience_fit=audience_fit,
        embroidery_fit=embroidery_fit,
    )

    final_selection_score = _clamp(
        breakdown.ad_validation * SELECTION_WEIGHTS.ad_validation +
        breakdown.social_heat * SELECTION_WEIGHTS.social_heat +
        breakdown.profit * SELECTION_WEIGHTS.profit +
        breakdown.market_competition * SELECTION_WEIGHTS.market_competition +
        breakdown.product_quality * SELECTION_WEIGHTS.product_quality +
        breakdown.trend_timing * SELECTION_WEIGHTS.trend_timing +
        breakdown.audience_fit * SELECTION_WEIGHTS.audience_fit +
        breakdown.embroidery_fit * SELECTION_WEIGHTS.embroidery_fit
    )
    selection_confidence = _clamp(
        35 +
        (12 if product.main_image else 0) +
        (8 if product.price else 0) +
        (10 if product.profit_margin_estimate is not None else 0) +
        (10 if product.review_count else 0) +
        (10 if product.tiktok_views else 0) +
        (8 if record.weekly_campaign else 0) +
        (7 if record.audience_tags else 0),
    )

    selection_reason = _build_reason(product, record, breakdown, final_selection_score)
    score_summary = _build_score_summary(breakdown, final_selection_score)
    recommended_status = _recommended_status(final_selection_score, manual_review_flag)
    trend_score = _clamp((ad_validation * 0.3) + (social_heat * 0.45) + (trend_timing * 0.25))
    gift_score = audience_fit
    campaign_score = campaign_fit

    return SelectionScoreResult(
        embroidery_fit_score=embroidery_fit,
        trend_score=trend_score,
        gift_score=gift_score,
        campaign_score=campaign_score,
        final_selection_score=final_selection_score,
        selection_confidence=selection_confidence,
        selection_reason=selection_reason,
        score_summary=score_summary,
        score_breakdown={key: round(value, 2) for key, value in breakdown.__dict__.items()},
        manual_review_flag=manual_review_flag,
        recommended_status=recommended_status,
    )
