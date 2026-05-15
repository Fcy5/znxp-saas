from fastapi import APIRouter, Query, HTTPException
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
import json
import math
import random
import time
from app.core.deps import CurrentUser, DBSession
from app.core.selection_config import (
    SELECTION_CAMPAIGNS,
    SELECTION_CAMPAIGN_DEFAULTS,
    SELECTION_POLICY,
    SELECTION_CAMPAIGN_QUOTAS,
    SELECTION_STANDARD_LIBRARY,
)
from app.models.product import Product, UserProduct
from app.services.selection_scoring import score_selection_candidate
from app.services.selection_tagging import infer_selection_tags
from app.schemas.product import (
    ProductCard,
    ProductDetail,
    ProductFilterRequest,
    ProductRecommendation,
    SelectionCampaignBucket,
    SelectionCampaignSummary,
    SelectionOverview,
    SelectionAutoCurateResult,
    SelectionPolicyResponse,
    SelectionWeightConfig,
    SelectionThresholdConfig,
    SelectionCampaignPolicy,
    SelectionStandardsResponse,
    SelectionBatchUpdateRequest,
    LibraryProductCard,
    SelectionMeta,
    SelectionMetaUpdateRequest,
    SelectionFeedbackPayload,
    SelectionFeedbackSummary,
    SelectionFeedbackSummaryCampaign,
    SelectionTaggingResponse,
)
from app.schemas.common import Response, PagedResponse, PageInfo

router = APIRouter(prefix="/products", tags=["Products"])

ALLOWED_SORT = {"ai_score", "sales_trend", "tiktok_views", "profit_margin_estimate", "review_score", "review_count"}
SELECTION_META_FIELDS = {
    "season_tags",
    "holiday_tags",
    "audience_tags",
    "scenario_tags",
    "weekly_campaign",
    "event_window",
    "selection_status",
    "selection_reason",
    "selection_confidence",
    "manual_review_flag",
    "embroidery_position",
    "customization_type",
    "embroidery_visibility",
    "giftability",
    "personalization_complexity",
    "content_hook",
    "visual_impact",
    "video_potential",
    "ugc_potential",
    "trend_score",
    "embroidery_fit_score",
    "gift_score",
    "campaign_score",
    "final_selection_score",
}


def _has_any(text: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword in text for keyword in keywords)


def _build_query(body: ProductFilterRequest):
    q = select(Product).where(Product.is_deleted == False).where(Product.main_image.isnot(None)).where(Product.main_image != "")
    if body.source_platform:
        q = q.where(Product.source_platform == body.source_platform)
    if body.category:
        q = q.where(Product.category == body.category)
    if body.price_min is not None:
        q = q.where(Product.price >= body.price_min)
    if body.price_max is not None:
        q = q.where(Product.price <= body.price_max)
    if body.profit_margin_min is not None:
        q = q.where(Product.profit_margin_estimate >= body.profit_margin_min)
    if body.sales_trend_min is not None:
        q = q.where(Product.sales_trend >= body.sales_trend_min)
    if body.keyword:
        q = q.where(or_(
            Product.title.ilike(f"%{body.keyword}%"),
            Product.category.ilike(f"%{body.keyword}%"),
        ))
    if body.brand:
        q = q.where(Product.brand == body.brand)
    return q


def _selection_meta_from_record(record: UserProduct | None) -> SelectionMeta | None:
    if not record:
        return None
    data = {field: getattr(record, field) for field in SELECTION_META_FIELDS}
    feedback = _get_feedback_payload(record)
    if feedback:
        data["review_feedback"] = feedback
    tagging = _get_tagging_payload(record)
    if tagging:
        data["tag_summary"] = tagging.get("tag_summary")
        data["tag_confidence"] = tagging.get("tag_confidence")
    return SelectionMeta.model_validate(data)


def _library_card(product: Product, record: UserProduct) -> LibraryProductCard:
    _apply_product_inference_tags(product, record)
    score_result = score_selection_candidate(product, record)
    return LibraryProductCard(
        **ProductCard.model_validate(product).model_dump(),
        **SelectionMeta.model_validate({
            **{field: getattr(record, field) for field in SELECTION_META_FIELDS},
            "selection_reason": _resolved_selection_reason(record, score_result.selection_reason),
            "selection_confidence": score_result.selection_confidence,
            "manual_review_flag": record.manual_review_flag if record.manual_review_flag is not None else score_result.manual_review_flag,
            "trend_score": score_result.trend_score,
            "embroidery_fit_score": score_result.embroidery_fit_score,
            "gift_score": score_result.gift_score,
            "campaign_score": score_result.campaign_score,
            "final_selection_score": score_result.final_selection_score,
            "score_breakdown": score_result.score_breakdown,
            "score_summary": score_result.score_summary,
            "tag_summary": (_get_tagging_payload(record) or {}).get("tag_summary"),
            "tag_confidence": (_get_tagging_payload(record) or {}).get("tag_confidence"),
            "review_feedback": _get_feedback_payload(record),
        }).model_dump(),
    )


def _selection_meta_with_scoring(product: Product, record: UserProduct | None) -> SelectionMeta | None:
    if not record:
        return None
    _apply_product_inference_tags(product, record)
    score_result = score_selection_candidate(product, record)
    return SelectionMeta.model_validate({
        **{field: getattr(record, field) for field in SELECTION_META_FIELDS},
        "selection_reason": _resolved_selection_reason(record, score_result.selection_reason),
        "selection_confidence": score_result.selection_confidence,
        "manual_review_flag": record.manual_review_flag if record.manual_review_flag is not None else score_result.manual_review_flag,
        "trend_score": score_result.trend_score,
        "embroidery_fit_score": score_result.embroidery_fit_score,
        "gift_score": score_result.gift_score,
        "campaign_score": score_result.campaign_score,
        "final_selection_score": score_result.final_selection_score,
        "score_breakdown": score_result.score_breakdown,
        "score_summary": score_result.score_summary,
        "tag_summary": (_get_tagging_payload(record) or {}).get("tag_summary"),
        "tag_confidence": (_get_tagging_payload(record) or {}).get("tag_confidence"),
        "review_feedback": _get_feedback_payload(record),
    })


def _apply_campaign_defaults(record: UserProduct, campaign: str):
    defaults = SELECTION_CAMPAIGN_DEFAULTS.get(campaign, {})
    record.weekly_campaign = campaign
    if not record.season_tags:
        record.season_tags = defaults.get("season_tags")
    if not record.holiday_tags:
        record.holiday_tags = defaults.get("holiday_tags")
    if not record.audience_tags:
        record.audience_tags = defaults.get("audience_tags")
    if not record.scenario_tags:
        record.scenario_tags = defaults.get("scenario_tags")
    if not record.customization_type:
        record.customization_type = ["name"]
    if not record.content_hook:
        record.content_hook = defaults.get("content_hook")
    _apply_auto_tags(record, campaign)


def _extract_notes_payload(record: UserProduct) -> dict:
    if not record.notes:
        return {}
    try:
        parsed = json.loads(record.notes)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def _persist_notes_payload(record: UserProduct, payload: dict) -> None:
    record.notes = json.dumps(payload, ensure_ascii=False)


def _get_feedback_payload(record: UserProduct) -> dict | None:
    payload = _extract_notes_payload(record)
    feedback = payload.get("selection_feedback")
    return feedback if isinstance(feedback, dict) else None


def _get_tagging_payload(record: UserProduct) -> dict | None:
    payload = _extract_notes_payload(record)
    tagging = payload.get("selection_tagging")
    return tagging if isinstance(tagging, dict) else None


def _set_feedback_payload(record: UserProduct, feedback: dict) -> None:
    payload = _extract_notes_payload(record)
    payload["selection_feedback"] = feedback
    _persist_notes_payload(record, payload)


def _set_tagging_payload(record: UserProduct, tag_summary: str, tag_confidence: float) -> None:
    payload = _extract_notes_payload(record)
    payload["selection_tagging"] = {
        "tag_summary": tag_summary,
        "tag_confidence": tag_confidence,
    }
    _persist_notes_payload(record, payload)


def _apply_tagging_result(record: UserProduct, tagging) -> None:
    record.season_tags = tagging.season_tags
    record.holiday_tags = tagging.holiday_tags
    record.audience_tags = tagging.audience_tags
    record.scenario_tags = tagging.scenario_tags
    record.customization_type = tagging.customization_type
    if tagging.event_window:
        record.event_window = tagging.event_window
    if tagging.content_hook:
        record.content_hook = tagging.content_hook
    _set_tagging_payload(record, tagging.tag_summary, tagging.tag_confidence)


def _apply_auto_tags(record: UserProduct, campaign: str) -> None:
    text = " ".join(
        [
            campaign.lower(),
            record.content_hook or "",
            " ".join(record.customization_type or []),
            " ".join(record.holiday_tags or []),
            " ".join(record.audience_tags or []),
            " ".join(record.scenario_tags or []),
        ]
    ).lower()

    if not record.event_window:
        if campaign in {"Memorial Day", "Graduation"}:
            record.event_window = "warming"
        else:
            record.event_window = "peak"

    if not record.customization_type:
        inferred_types: list[str] = []
        if _has_any(text, ("name", "monogram", "initial")):
            inferred_types.append("name")
        if _has_any(text, ("date", "year", "class of")):
            inferred_types.append("date")
        if _has_any(text, ("portrait", "photo", "line")):
            inferred_types.append("line_art")
        record.customization_type = inferred_types or ["name"]

    if not record.season_tags:
        record.season_tags = ["summer"] if campaign == "Summer" else ["spring", "summer"]

    if not record.audience_tags:
        inferred_audiences = []
        if _has_any(text, ("dad", "father", "grandpa", "husband")):
            inferred_audiences.append("dad")
        if _has_any(text, ("graduate", "graduation", "class of")):
            inferred_audiences.append("graduate")
        if _has_any(text, ("family", "memorial", "keepsake")):
            inferred_audiences.append("family")
        if _has_any(text, ("travel", "camp", "beach", "vacation")):
            inferred_audiences.append("traveler")
        record.audience_tags = inferred_audiences or (record.audience_tags or [])

    if not record.scenario_tags:
        inferred_scenarios = []
        if _has_any(text, ("gift", "keepsake", "present")):
            inferred_scenarios.append("gift")
        if _has_any(text, ("bbq", "outdoor", "camp", "travel", "beach")):
            inferred_scenarios.append("outdoor")
        if _has_any(text, ("school", "graduation", "class of")):
            inferred_scenarios.append("celebration")
        record.scenario_tags = inferred_scenarios or (record.scenario_tags or [])


def _apply_product_inference_tags(product: Product, record: UserProduct) -> None:
    text = " ".join(
        part.lower()
        for part in [
            product.title or "",
            product.category or "",
            product.description or "",
            product.source_platform or "",
            product.sentiment_summary or "",
        ]
        if part
    )

    if not record.holiday_tags:
        holidays = []
        if _has_any(text, ("father", "dad", "grandpa")):
            holidays.append("fathers_day")
        if _has_any(text, ("graduation", "graduate", "class of")):
            holidays.append("graduation")
        if _has_any(text, ("memorial", "memory", "remembrance")):
            holidays.append("memorial_day")
        if _has_any(text, ("summer", "beach", "travel", "camp")):
            holidays.append("summer")
        record.holiday_tags = holidays or record.holiday_tags

    if not record.audience_tags:
        audiences = []
        if _has_any(text, ("father", "dad", "grandpa", "husband")):
            audiences.append("dad")
        if _has_any(text, ("graduate", "graduation", "student")):
            audiences.append("graduate")
        if _has_any(text, ("pet", "dog", "cat")):
            audiences.append("pet_owner")
        if _has_any(text, ("family", "mom", "father", "kids")):
            audiences.append("family")
        record.audience_tags = audiences or record.audience_tags

    if not record.scenario_tags:
        scenarios = []
        if _has_any(text, ("gift", "keepsake", "present")):
            scenarios.append("gift")
        if _has_any(text, ("travel", "camp", "beach", "vacation", "outdoor")):
            scenarios.append("travel")
        if _has_any(text, ("bbq", "cookout")):
            scenarios.append("bbq")
        if _has_any(text, ("graduation", "school", "class of")):
            scenarios.append("celebration")
        if _has_any(text, ("memorial", "memory", "remembrance")):
            scenarios.append("memorial")
        record.scenario_tags = scenarios or record.scenario_tags

    if not record.customization_type:
        custom_types = []
        if _has_any(text, ("name", "monogram", "initial")):
            custom_types.append("name")
        if _has_any(text, ("date", "year", "class of")):
            custom_types.append("date")
        if _has_any(text, ("father", "dad", "graduate", "mom")):
            custom_types.append("title")
        if _has_any(text, ("portrait", "photo", "line art")):
            custom_types.append("line_art")
        record.customization_type = custom_types or record.customization_type


def _resolved_selection_reason(record: UserProduct, fallback: str) -> str:
    if not record.selection_reason:
        return fallback
    if not record.weekly_campaign and "专题归属明确" in record.selection_reason:
        return fallback
    return record.selection_reason


def _feedback_rule_flags(reasons: list[str]) -> dict[str, bool]:
    joined = " ".join(reasons).lower()
    return {
        "strict_custom": any(keyword in joined for keyword in ("custom", "定制", "刺绣", "embroidery", "monogram", "name")),
        "strict_audience": any(keyword in joined for keyword in ("audience", "人群", "recipient", "dad", "graduate", "family")),
        "strict_scenario": any(keyword in joined for keyword in ("scenario", "场景", "occasion", "gift", "travel", "bbq", "celebration")),
    }


def _campaign_feedback_rules(records: list[UserProduct]) -> dict[str, dict[str, int | bool | list[str]]]:
    rules: dict[str, dict[str, int | bool | list[str]]] = {}
    for campaign in SELECTION_CAMPAIGNS:
        campaign_records = [record for record in records if record.weekly_campaign == campaign]
        feedbacks = [_get_feedback_payload(record) for record in campaign_records]
        feedbacks = [item for item in feedbacks if item]
        reasons: list[str] = []
        missed = 0
        approved = 0
        rejected = 0
        for feedback in feedbacks:
            reasons.extend([reason for reason in (feedback.get("reasons") or []) if isinstance(reason, str)])
            outcome = feedback.get("outcome")
            if outcome in {"featured_missed", "rejected_missed"}:
                missed += 1
            elif outcome in {"approved", "featured_confirmed"}:
                approved += 1
            elif outcome == "rejected_confirmed":
                rejected += 1
        flags = _feedback_rule_flags(reasons)
        rules[campaign] = {
            "strict_custom": flags["strict_custom"] or missed > 0,
            "strict_audience": flags["strict_audience"],
            "strict_scenario": flags["strict_scenario"],
            "min_relevance": 30 + min(missed * 4, 10),
            "quota_delta": 0 if missed else (1 if approved >= 3 and rejected == 0 else 0),
            "reasons": reasons,
            "missed": missed,
            "approved": approved,
            "rejected": rejected,
        }
    return rules


def _campaign_relevance_score(product: Product, campaign: str, feedback_rules: dict | None = None) -> float:
    text = " ".join(
        part.lower()
        for part in [
            product.title or "",
            product.category or "",
            product.description or "",
            product.brand or "",
        ]
        if part
    )
    price = product.price or 0.0
    score = 0.0

    campaign_rules = {
        "Memorial Day": {
            "core": ("memorial", "memory", "remembrance", "keepsake", "tribute", "family"),
            "secondary": ("gift", "custom", "personalized", "name", "photo", "portrait", "patriotic", "bbq", "outdoor"),
            "negative": ("back pain", "massager", "supplement", "shapewear", "cleaner"),
        },
        "Father's Day": {
            "core": ("father", "dad", "daddy", "papa", "grandpa"),
            "secondary": ("gift", "custom", "personalized", "embroider", "name", "bbq", "fishing", "husband"),
            "negative": ("mom", "mama", "mother", "skincare", "lashes"),
        },
        "Graduation": {
            "core": ("graduation", "graduate", "class of", "senior", "college", "school"),
            "secondary": ("gift", "custom", "personalized", "embroider", "name", "year", "keepsake"),
            "negative": ("tumbler lid", "phone case", "cleaner"),
        },
        "Summer": {
            "core": ("summer", "beach", "vacation", "travel", "camp", "outdoor", "lake", "pool"),
            "secondary": ("gift", "custom", "personalized", "embroider", "monogram", "name", "tote", "shirt", "hat"),
            "negative": ("portable fan", "fan", "cooler", "air conditioner", "massage", "supplement", "cleaner"),
        },
    }
    rules = campaign_rules[campaign]

    core_hits = sum(keyword in text for keyword in rules["core"])
    secondary_hits = sum(keyword in text for keyword in rules["secondary"])
    negative_hits = sum(keyword in text for keyword in rules["negative"])
    has_custom_signal = _has_any(
        text,
        ("personalized", "custom", "embroider", "embroidery", "monogram", "name", "portrait", "photo", "keepsake"),
    )
    has_audience_signal = _has_any(
        text,
        ("dad", "father", "grandpa", "graduate", "family", "traveler", "student", "husband"),
    )
    has_scenario_signal = _has_any(
        text,
        ("gift", "travel", "bbq", "celebration", "outdoor", "camp", "beach", "memory"),
    )

    if negative_hits and not has_custom_signal:
        return 0.0
    if feedback_rules and feedback_rules.get("strict_custom") and not has_custom_signal:
        return 0.0
    if feedback_rules and feedback_rules.get("strict_audience") and not has_audience_signal:
        return 0.0
    if feedback_rules and feedback_rules.get("strict_scenario") and not has_scenario_signal:
        return 0.0

    score += min(45, core_hits * 18)
    score += min(28, secondary_hits * 7)

    if has_custom_signal:
        score += 16
    if has_audience_signal:
        score += 8
    if has_scenario_signal:
        score += 8
    if _has_any(text, ("gift", "keepsake", "family", "memory")):
        score += 10
    if product.category and product.category.lower() in {"apparel", "gifts", "home decor", "accessories"}:
        score += 8
    if 19 <= price <= 65:
        score += 6
    elif 15 <= price <= 85:
        score += 3

    if product.profit_margin_estimate and product.profit_margin_estimate >= 40:
        score += 6
    if product.tiktok_views and product.tiktok_views >= 100_000:
        score += 4
    if product.facebook_ad_count and product.facebook_ad_count >= 5:
        score += 4

    if feedback_rules and feedback_rules.get("missed"):
        score += min(8, int(feedback_rules["missed"]) * 2)

    score -= negative_hits * 18
    return round(score, 2)


async def _get_campaign_candidate_products(
    db: DBSession,
    campaign: str,
    per_campaign: int,
    excluded_product_ids: set[int] | None = None,
    feedback_rules: dict | None = None,
) -> list[Product]:
    config = SELECTION_CAMPAIGNS[campaign]
    excluded_product_ids = excluded_product_ids or set()
    body = ProductFilterRequest(
        page=1,
        page_size=max(per_campaign * 12, 120),
        keyword=config["keyword"],
        category=config["category"],
        sort_by="ai_score",
        sort_order="desc",
        price_min=19,
        price_max=65,
    )
    result = await db.execute(
        _build_query(body)
        .order_by(
            Product.ai_score.desc(),
            func.coalesce(Product.tiktok_views, 0).desc(),
            func.coalesce(Product.facebook_ad_count, 0).desc(),
            Product.id.asc(),
        )
        .limit(body.page_size)
    )
    candidates = result.scalars().all()
    ranked_candidates = [
        (product, _campaign_relevance_score(product, campaign, feedback_rules))
        for product in candidates
    ]
    ranked_candidates = [
        item for item in ranked_candidates
        if item[1] >= (feedback_rules.get("min_relevance", 30) if feedback_rules else 30)
    ]
    ranked_candidates.sort(
        key=lambda item: (
            item[1],
            item[0].ai_score or 0,
            item[0].tiktok_views or 0,
            item[0].facebook_ad_count or 0,
            item[0].review_count or 0,
        ),
        reverse=True,
    )

    selected: list[Product] = []
    seen_titles: set[str] = set()
    per_platform: dict[str, int] = {}
    for product, _relevance in ranked_candidates:
        if product.id in excluded_product_ids:
            continue
        title_key = (product.title or "")[:80].lower()
        platform = product.source_platform or "other"
        if title_key in seen_titles:
            continue
        if per_platform.get(platform, 0) >= 5:
            continue
        seen_titles.add(title_key)
        per_platform[platform] = per_platform.get(platform, 0) + 1
        selected.append(product)
        if len(selected) >= per_campaign:
            break

    if len(selected) < per_campaign:
        for product, _relevance in ranked_candidates:
            if product.id in excluded_product_ids or product in selected:
                continue
            title_key = (product.title or "")[:80].lower()
            if title_key in seen_titles:
                continue
            seen_titles.add(title_key)
            selected.append(product)
            if len(selected) >= per_campaign:
                break
    return selected


import math as _math


def _rec_score(p: Product, maxes: dict) -> float:
    """
    六维加权评分（0-100）：
      - 买家口碑    20%  review_score × log(review_count+1) 归一化
      - 社媒爆发力  20%  tiktok_views 对数归一化
      - 利润潜力    18%  profit_margin_estimate
      - 市场验证    15%  review_count 归一化
      - 增长势能    15%  sales_trend
      - 广告热度    12%  facebook_ad_count 对数归一化
    价格甜区加成：售价 $19-$65 额外 +5 分
    """
    def norm(val, mx):
        if not val or not mx:
            return 0.0
        return min(1.0, val / mx)

    def log_norm(val, mx):
        if not val or val <= 0 or not mx or mx <= 0:
            return 0.0
        return min(1.0, _math.log1p(val) / _math.log1p(mx))

    # 买家口碑：评分质量 × 数量信心
    review_quality = (p.review_score or 0) / 5.0
    review_confidence = log_norm(p.review_count, maxes["review_count"])
    reputation = review_quality * review_confidence

    score = (
        reputation * 20 +
        log_norm(p.tiktok_views, maxes["tiktok_views"]) * 20 +
        norm(p.profit_margin_estimate, maxes["profit_margin_estimate"]) * 18 +
        norm(p.review_count, maxes["review_count"]) * 15 +
        norm(p.sales_trend, maxes["sales_trend"]) * 15 +
        log_norm(p.facebook_ad_count, maxes["facebook_ad_count"]) * 12
    )

    # 价格甜区加成（POD 最佳售价区间）
    if p.price and 19 <= p.price <= 65:
        score += 5

    return round(min(score, 100), 2)


def _rec_reason(p: Product, maxes: dict) -> str:
    parts = []

    # 买家口碑（权重最高，优先展示）
    if p.review_score and p.review_count:
        if p.review_score >= 4.8 and p.review_count >= 1000:
            parts.append(f"买家评分高达 {p.review_score} 分、{p.review_count:,} 条真实评价，口碑极佳，复购率极高")
        elif p.review_score >= 4.7 and p.review_count >= 300:
            parts.append(f"买家评分 {p.review_score} 分（{p.review_count:,} 条评价），口碑出色")
        elif p.review_score >= 4.5 and p.review_count >= 50:
            parts.append(f"买家评分 {p.review_score} 分（{p.review_count} 条评价），市场认可度良好")

    # 社媒爆发力
    if p.tiktok_views:
        if p.tiktok_views >= 10_000_000:
            parts.append(f"TikTok 相关话题播放量破 {p.tiktok_views // 1_000_000}M，具备极强的社媒爆发潜力")
        elif p.tiktok_views >= 1_000_000:
            parts.append(f"TikTok 播放量超 {p.tiktok_views // 1_000_000}M，社媒流量充沛")
        elif p.tiktok_views >= 100_000:
            parts.append(f"TikTok 播放量 {p.tiktok_views // 1000}K，短视频带货热度上升中")

    # 利润潜力
    if p.profit_margin_estimate:
        if p.profit_margin_estimate >= 60:
            parts.append(f"预估利润率 {p.profit_margin_estimate:.0f}%，属于高毛利款，跑量空间大")
        elif p.profit_margin_estimate >= 45:
            parts.append(f"预估利润率 {p.profit_margin_estimate:.0f}%，盈利能力稳健")
        elif p.profit_margin_estimate >= 30:
            parts.append(f"预估利润率 {p.profit_margin_estimate:.0f}%，利润合理")

    # 增长势能
    if p.sales_trend and p.sales_trend > 0:
        if p.sales_trend >= 200:
            parts.append(f"近期销售增速 +{p.sales_trend:.0f}%，处于爆发式增长阶段，建议抢先入局")
        elif p.sales_trend >= 80:
            parts.append(f"近期销售增速 +{p.sales_trend:.0f}%，增长势头强劲")
        elif p.sales_trend >= 30:
            parts.append(f"近期销售增速 +{p.sales_trend:.0f}%，呈稳定上升趋势")

    # 广告热度
    if p.facebook_ad_count:
        if p.facebook_ad_count >= 50:
            parts.append(f"已有 {p.facebook_ad_count} 条 Facebook 广告持续投放，商业化验证充分")
        elif p.facebook_ad_count >= 15:
            parts.append(f"{p.facebook_ad_count} 条 Facebook 广告在投，市场热度明显")
        elif p.facebook_ad_count >= 3:
            parts.append(f"有 {p.facebook_ad_count} 条 Facebook 广告引流")

    # 价格甜区
    if p.price and 19 <= p.price <= 65:
        parts.append(f"售价 ${p.price:.2f}，处于消费者冲动购买甜区，转化率更高")

    if not parts:
        return "多维度综合评估领先，具备良好的市场基础，值得重点关注"

    return "；".join(parts) + "。"


async def _get_xhs_recommendations(db: DBSession, limit: int = 4) -> list[ProductRecommendation]:
    """从 xhs_products_table 取点赞最高的商品，映射成 ProductRecommendation"""
    from sqlalchemy import text
    try:
        rows = (await db.execute(
            text("""SELECT id, title, images, author_name, likes_count, xhs_url
                    FROM xhs_products_table
                    WHERE is_delete = 0 AND images != '[]' AND images IS NOT NULL AND images != ''
                    ORDER BY likes_count DESC
                    LIMIT :limit"""),
            {"limit": limit},
        )).mappings().all()
    except Exception:
        return []

    import json as _json
    recs = []
    for r in rows:
        imgs = []
        try:
            imgs = _json.loads(r["images"]) if r["images"] else []
        except Exception:
            pass
        main_img = imgs[0] if imgs else None
        likes = r["likes_count"] or 0
        recs.append(ProductRecommendation(
            id=-(r["id"]),          # 负数 ID 标记为 XHS 商品
            title=r["title"] or "",
            source_platform="xiaohongshu",
            source_url=r["xhs_url"] or None,
            main_image=main_img,
            price=None,
            sales_trend=None,
            review_score=None,
            tiktok_views=None,
            facebook_ad_count=None,
            ai_score=None,
            profit_margin_estimate=None,
            category="Custom Embroidery",
            review_count=likes,      # 借用 review_count 字段存点赞数
            rec_score=min(likes / 10000, 1.0),
            rec_reason=f"小红书 {likes:,} 点赞 · 定制刺绣热门",
        ))
    return recs


@router.get("/recommendations", response_model=Response[list[ProductRecommendation]])
async def get_recommendations(db: DBSession, limit: int = Query(5, le=20), seed: int = Query(0)):
    # 各维度最大值（用于归一化）
    mx_result = await db.execute(
        select(
            func.max(Product.ai_score),
            func.max(Product.sales_trend),
            func.max(Product.profit_margin_estimate),
            func.max(Product.facebook_ad_count),
            func.max(Product.review_count),
            func.max(Product.tiktok_views),
        ).where(Product.is_deleted == False)
    )
    row = mx_result.one()
    maxes = {
        "ai_score": row[0] or 100,
        "sales_trend": row[1] or 300,
        "profit_margin_estimate": row[2] or 80,
        "facebook_ad_count": row[3] or 100,
        "review_count": row[4] or 10000,
        "tiktok_views": row[5] or 1_000_000,
    }

    # 按平台分层抽取候选，确保各平台都有代表
    # 每个平台取 top 120（按 review_count + tiktok_views 混合排序），共约 600 候选
    PLATFORMS = ["etsy", "amazon", "shopify", "google", "tiktok"]
    candidates: list[Product] = []
    for platform in PLATFORMS:
        per_q = (
            select(Product)
            .where(Product.is_deleted == False)
            .where(Product.main_image.isnot(None))
            .where(Product.main_image != "")
            .where(Product.source_platform == platform)
            .order_by(
                func.coalesce(Product.review_count, 0).desc(),
                func.coalesce(Product.tiktok_views, 0).desc(),
                Product.id.asc(),
            )
            .limit(120)
        )
        res = await db.execute(per_q)
        candidates.extend(res.scalars().all())

    # 对所有候选打分并排序，在 top-200 中随机洗牌实现换一批
    # seed=0 时自动使用 2 小时时间槽，确保每 2 小时自然轮换一批
    scored_candidates = sorted(candidates, key=lambda p: _rec_score(p, maxes), reverse=True)
    effective_seed = seed if seed != 0 else int(time.time() // 7200)
    top_pool = scored_candidates[:200]
    random.Random(effective_seed).shuffle(top_pool)
    scored_candidates = top_pool + scored_candidates[200:]

    # 多样化去重：title[:60] 去重 + 每平台最多 2 条（tiktok 最多 1 条）+ 每品类最多 2 条
    seen_titles: set[str] = set()
    platform_count: dict[str, int] = {}
    category_count: dict[str, int] = {}
    selected: list[Product] = []

    for p in scored_candidates:
        title_key = p.title[:60]
        plat = p.source_platform or "other"
        cat = p.category or "other"

        if title_key in seen_titles:
            continue
        plat_max = 1 if plat == "tiktok" else 2
        if platform_count.get(plat, 0) >= plat_max:
            continue
        if category_count.get(cat, 0) >= 2:
            continue

        seen_titles.add(title_key)
        platform_count[plat] = platform_count.get(plat, 0) + 1
        category_count[cat] = category_count.get(cat, 0) + 1
        selected.append(p)

        if len(selected) >= limit:
            break

    recs = []
    for p in selected:
        rec = ProductRecommendation(
            **ProductCard.model_validate(p).model_dump(),
            review_count=p.review_count,
            rec_score=_rec_score(p, maxes),
            rec_reason=_rec_reason(p, maxes),
        )
        recs.append(rec)

    # 混入小红书热品（取 1 条，插在第 3 位）
    xhs_recs = await _get_xhs_recommendations(db, limit=1)
    if xhs_recs:
        insert_pos = min(2, len(recs))
        recs.insert(insert_pos, xhs_recs[0])

    return Response(data=recs[:limit + 1])


@router.post("/search", response_model=PagedResponse[ProductCard])
async def search_products(body: ProductFilterRequest, db: DBSession):
    count_q = _build_query(body)
    total_result = await db.execute(select(func.count()).select_from(count_q.subquery()))
    total = total_result.scalar() or 0

    sort_col = body.sort_by if body.sort_by in ALLOWED_SORT else "ai_score"
    col = getattr(Product, sort_col, Product.ai_score)
    order = col.desc() if body.sort_order == "desc" else col.asc()

    data_q = _build_query(body).order_by(order).offset((body.page - 1) * body.page_size).limit(body.page_size)
    result = await db.execute(data_q)
    products = result.scalars().all()

    return PagedResponse(
        data=[ProductCard.model_validate(p) for p in products],
        page_info=PageInfo(
            page=body.page,
            page_size=body.page_size,
            total=total,
            total_pages=math.ceil(total / body.page_size) if body.page_size else 1,
        ),
    )


@router.get("/selection/candidate-pool", response_model=Response[list[SelectionCampaignBucket]])
async def get_selection_candidate_pool(
    current_user_id: CurrentUser,
    db: DBSession,
    per_campaign: int | None = Query(None, ge=1, le=30),
):
    existing_records = (await db.execute(
        select(UserProduct).where(
            UserProduct.user_id == current_user_id,
            UserProduct.is_deleted == False,
        )
    )).scalars().all()
    feedback_rules = _campaign_feedback_rules(existing_records)
    buckets: list[SelectionCampaignBucket] = []
    for campaign, config in SELECTION_CAMPAIGNS.items():
        base_target = per_campaign or SELECTION_CAMPAIGN_QUOTAS.get(campaign, 15)
        campaign_target = min(_effective_campaign_target(base_target, feedback_rules.get(campaign)), 8)
        body = ProductFilterRequest(
            page=1,
            page_size=campaign_target,
            keyword=config["keyword"],
            category=config["category"],
            sort_by="ai_score",
            sort_order="desc",
            price_min=19,
            price_max=65,
        )
        count_q = _build_query(body)
        total_result = await db.execute(select(func.count()).select_from(count_q.subquery()))
        total = total_result.scalar() or 0

        products = await _get_campaign_candidate_products(
            db,
            campaign,
            campaign_target,
            feedback_rules=feedback_rules.get(campaign),
        )

        buckets.append(SelectionCampaignBucket(
            campaign=campaign,
            keyword=config["keyword"],
            category=config["category"],
            total_candidates=total,
            products=[ProductCard.model_validate(product) for product in products],
        ))

    return Response(data=buckets)


@router.get("/selection/overview", response_model=Response[SelectionOverview])
async def get_selection_overview(
    current_user_id: CurrentUser,
    db: DBSession,
    top_limit: int = Query(8, ge=1, le=20),
):
    q = (
        select(Product, UserProduct)
        .join(UserProduct, UserProduct.product_id == Product.id)
        .where(UserProduct.user_id == current_user_id)
        .where(UserProduct.is_deleted == False)
        .where(Product.is_deleted == False)
    )
    rows = (await db.execute(q)).all()

    library_items = [_library_card(product, record) for product, record in rows]
    current_cycle_items = [item for item in library_items if item.weekly_campaign in SELECTION_CAMPAIGNS]
    campaigns: list[SelectionCampaignSummary] = []
    for campaign in SELECTION_CAMPAIGNS:
        items = [item for item in current_cycle_items if item.weekly_campaign == campaign]
        campaigns.append(SelectionCampaignSummary(
            campaign=campaign,
            candidate=len([item for item in items if item.selection_status == "candidate"]),
            shortlisted=len([item for item in items if item.selection_status == "shortlisted"]),
            featured=len([item for item in items if item.selection_status == "featured"]),
            rejected=len([item for item in items if item.selection_status == "rejected"]),
            total=len(items),
        ))

    top_products = sorted(
        current_cycle_items,
        key=lambda item: (item.final_selection_score or 0, item.embroidery_fit_score or 0),
        reverse=True,
    )[:top_limit]

    overview = SelectionOverview(
        candidate=len([item for item in current_cycle_items if item.selection_status == "candidate"]),
        shortlisted=len([item for item in current_cycle_items if item.selection_status == "shortlisted"]),
        featured=len([item for item in current_cycle_items if item.selection_status == "featured"]),
        rejected=len([item for item in current_cycle_items if item.selection_status == "rejected"]),
        total=len(current_cycle_items),
        campaigns=campaigns,
        top_products=top_products,
    )
    return Response(data=overview)


@router.get("/selection/policy", response_model=Response[SelectionPolicyResponse])
async def get_selection_policy(
    current_user_id: CurrentUser,
    db: DBSession,
):
    existing_records = (await db.execute(
        select(UserProduct).where(
            UserProduct.user_id == current_user_id,
            UserProduct.is_deleted == False,
        )
    )).scalars().all()
    feedback_rules = _campaign_feedback_rules(existing_records)
    policy = SelectionPolicyResponse(
        weights=SelectionWeightConfig(
            ad_validation=SELECTION_POLICY.weights.ad_validation,
            social_heat=SELECTION_POLICY.weights.social_heat,
            profit=SELECTION_POLICY.weights.profit,
            market_competition=SELECTION_POLICY.weights.market_competition,
            product_quality=SELECTION_POLICY.weights.product_quality,
            trend_timing=SELECTION_POLICY.weights.trend_timing,
            audience_fit=SELECTION_POLICY.weights.audience_fit,
            embroidery_fit=SELECTION_POLICY.weights.embroidery_fit,
        ),
        thresholds=SelectionThresholdConfig(
            featured=SELECTION_POLICY.thresholds.featured,
            shortlisted=SELECTION_POLICY.thresholds.shortlisted,
            rejected=SELECTION_POLICY.thresholds.rejected,
        ),
        tag_sources=SELECTION_POLICY.tag_sources,
        campaigns=[
            SelectionCampaignPolicy(
                campaign=campaign,
                target_quota=quota,
                effective_target_quota=_effective_campaign_target(quota, feedback_rules.get(campaign)),
                minimum_relevance_score=int((feedback_rules.get(campaign) or {}).get("min_relevance", 30)),
                strict_custom_signal=bool((feedback_rules.get(campaign) or {}).get("strict_custom", False)),
                strict_audience_signal=bool((feedback_rules.get(campaign) or {}).get("strict_audience", False)),
                strict_scenario_signal=bool((feedback_rules.get(campaign) or {}).get("strict_scenario", False)),
                feedback_sample_count=int(
                    ((feedback_rules.get(campaign) or {}).get("approved", 0) or 0) +
                    ((feedback_rules.get(campaign) or {}).get("rejected", 0) or 0) +
                    ((feedback_rules.get(campaign) or {}).get("missed", 0) or 0)
                ),
                recommended_adjustments=_feedback_adjustments(
                    campaign,
                    list(((feedback_rules.get(campaign) or {}).get("reasons", []) or [])),
                    int((feedback_rules.get(campaign) or {}).get("missed", 0) or 0),
                    int((feedback_rules.get(campaign) or {}).get("rejected", 0) or 0),
                ),
            )
            for campaign, quota in SELECTION_POLICY.quotas.items()
        ],
    )
    return Response(data=policy)


@router.get("/selection/standards", response_model=Response[SelectionStandardsResponse])
async def get_selection_standards():
    return Response(data=SelectionStandardsResponse(**SELECTION_STANDARD_LIBRARY))


@router.post("/{product_id}/selection-auto-tags", response_model=Response[SelectionTaggingResponse])
async def auto_tag_selection_product(
    product_id: int,
    current_user_id: CurrentUser,
    db: DBSession,
):
    product = (await db.execute(
        select(Product).where(Product.id == product_id, Product.is_deleted == False)
    )).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    record = (await db.execute(
        select(UserProduct).where(
            UserProduct.user_id == current_user_id,
            UserProduct.product_id == product_id,
            UserProduct.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not record:
        record = UserProduct(
            user_id=current_user_id,
            product_id=product_id,
            status="saved",
            selection_status="candidate",
        )
        db.add(record)

    tagging = infer_selection_tags(product, record)
    _apply_tagging_result(record, tagging)
    await db.commit()

    return Response(data=SelectionTaggingResponse(
        season_tags=tagging.season_tags,
        holiday_tags=tagging.holiday_tags,
        audience_tags=tagging.audience_tags,
        scenario_tags=tagging.scenario_tags,
        customization_type=tagging.customization_type,
        event_window=tagging.event_window,
        content_hook=tagging.content_hook,
        tag_confidence=tagging.tag_confidence,
        tag_summary=tagging.tag_summary,
    ))


@router.post("/selection/auto-curate", response_model=Response[SelectionAutoCurateResult])
async def auto_curate_selection(
    current_user_id: CurrentUser,
    db: DBSession,
    per_campaign: int | None = Query(None, ge=1, le=30),
):
    existing_rows = await db.execute(
        select(UserProduct).where(
            UserProduct.user_id == current_user_id,
            UserProduct.is_deleted == False,
        )
    )
    existing_records = existing_rows.scalars().all()
    existing_map = {record.product_id: record for record in existing_records}
    feedback_rules = _campaign_feedback_rules(existing_records)

    curated_pairs: list[tuple[Product, UserProduct]] = []
    total_saved = 0
    used_product_ids: set[int] = set()
    for campaign in SELECTION_CAMPAIGNS:
        base_target = per_campaign or SELECTION_CAMPAIGN_QUOTAS.get(campaign, 15)
        campaign_target = _effective_campaign_target(base_target, feedback_rules.get(campaign))
        products = await _get_campaign_candidate_products(
            db,
            campaign,
            campaign_target,
            used_product_ids,
            feedback_rules.get(campaign),
        )
        for product in products:
            used_product_ids.add(product.id)
            record = existing_map.get(product.id)
            if not record:
                record = UserProduct(
                    user_id=current_user_id,
                    product_id=product.id,
                    status="saved",
                    selection_status="candidate",
                )
                db.add(record)
                existing_map[product.id] = record
                total_saved += 1

            _apply_campaign_defaults(record, campaign)
            _apply_tagging_result(record, infer_selection_tags(product, record))
            score_result = score_selection_candidate(product, record)
            record.embroidery_fit_score = score_result.embroidery_fit_score
            record.trend_score = score_result.trend_score
            record.gift_score = score_result.gift_score
            record.campaign_score = score_result.campaign_score
            record.final_selection_score = score_result.final_selection_score
            record.selection_confidence = score_result.selection_confidence
            record.manual_review_flag = score_result.manual_review_flag
            record.selection_reason = score_result.selection_reason
            record.selection_status = "candidate"
            curated_pairs.append((product, record))

    for record in existing_records:
        if record.weekly_campaign in SELECTION_CAMPAIGNS and record.product_id not in used_product_ids:
            record.weekly_campaign = None
            if record.selection_status != "featured":
                record.selection_status = "candidate"

    curated_pairs.sort(
        key=lambda pair: (
            pair[1].final_selection_score or 0,
            pair[1].embroidery_fit_score or 0,
            pair[1].trend_score or 0,
        ),
        reverse=True,
    )

    for index, (_, record) in enumerate(curated_pairs):
        if index < 8:
            record.selection_status = "featured"
        elif index < 20:
            record.selection_status = "shortlisted"
        elif (record.final_selection_score or 0) < 35:
            record.selection_status = "rejected"
        else:
            record.selection_status = "candidate"

    await db.commit()

    campaigns: list[SelectionCampaignSummary] = []
    for campaign in SELECTION_CAMPAIGNS:
        items = [record for _, record in curated_pairs if record.weekly_campaign == campaign]
        campaigns.append(SelectionCampaignSummary(
            campaign=campaign,
            candidate=len([item for item in items if item.selection_status == "candidate"]),
            shortlisted=len([item for item in items if item.selection_status == "shortlisted"]),
            featured=len([item for item in items if item.selection_status == "featured"]),
            rejected=len([item for item in items if item.selection_status == "rejected"]),
            total=len(items),
        ))

    result = SelectionAutoCurateResult(
        candidate=len([record for _, record in curated_pairs if record.selection_status == "candidate"]),
        shortlisted=len([record for _, record in curated_pairs if record.selection_status == "shortlisted"]),
        featured=len([record for _, record in curated_pairs if record.selection_status == "featured"]),
        rejected=len([record for _, record in curated_pairs if record.selection_status == "rejected"]),
        total_curated=len(curated_pairs),
        total_saved=total_saved,
        campaigns=campaigns,
    )
    return Response(data=result)


@router.get("/library/list", response_model=PagedResponse[LibraryProductCard])
async def get_my_library(
    current_user_id: CurrentUser,
    db: DBSession,
    page: int = Query(1),
    page_size: int = Query(20),
    keyword: str | None = Query(None),
    shop_id: int | None = Query(None),
    current_cycle_only: bool = Query(False),
):
    q = (
        select(Product, UserProduct)
        .join(UserProduct, UserProduct.product_id == Product.id)
        .where(UserProduct.user_id == current_user_id)
        .where(UserProduct.is_deleted == False)
        .where(Product.is_deleted == False)
    )
    if keyword:
        q = q.where(Product.title.ilike(f"%{keyword}%"))
    if shop_id:
        q = q.where(UserProduct.shop_id == shop_id)
    if current_cycle_only:
        q = q.where(UserProduct.weekly_campaign.in_(list(SELECTION_CAMPAIGNS.keys())))
    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar() or 0

    data_q = q.order_by(Product.ai_score.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(data_q)
    rows = result.all()

    return PagedResponse(
        data=[_library_card(product, record) for product, record in rows],
        page_info=PageInfo(page=page, page_size=page_size, total=total, total_pages=math.ceil(total / page_size) if page_size else 1),
    )


@router.post("/selection/batch-update", response_model=Response[None])
async def batch_update_selection(
    body: SelectionBatchUpdateRequest,
    current_user_id: CurrentUser,
    db: DBSession,
):
    if not body.product_ids:
        raise HTTPException(status_code=400, detail="product_ids 不能为空")
    if body.selection_status is None and body.manual_review_flag is None:
        raise HTTPException(status_code=400, detail="至少提供一个更新字段")

    rows = (await db.execute(
        select(UserProduct).where(
            UserProduct.user_id == current_user_id,
            UserProduct.product_id.in_(body.product_ids),
            UserProduct.is_deleted == False,
        )
    )).scalars().all()
    if not rows:
        raise HTTPException(status_code=404, detail="未找到可更新的选品记录")

    for record in rows:
        if body.selection_status is not None:
            record.selection_status = body.selection_status
        if body.manual_review_flag is not None:
            record.manual_review_flag = body.manual_review_flag

    await db.commit()
    return Response(message=f"已更新 {len(rows)} 条选品记录")


def _feedback_adjustments(campaign: str, reasons: list[str], missed: int, rejected: int) -> list[str]:
    joined = " ".join(reasons).lower()
    adjustments: list[str] = []
    if "custom" in joined or "定制" in joined or "embroidery" in joined:
        adjustments.append(f"{campaign} 下轮提高定制信号权重，优先 name / monogram / keepsake 类商品。")
    if "audience" in joined or "人群" in joined:
        adjustments.append(f"{campaign} 下轮提高 audience_tags 命中要求，弱人群商品延后进入重点池。")
    if "scenario" in joined or "场景" in joined:
        adjustments.append(f"{campaign} 下轮收紧场景规则，优先 gift / travel / celebration 等明确场景。")
    if missed > rejected:
        adjustments.append(f"{campaign} 当前淘汰偏严，下轮建议扩大候选召回范围再做二次压缩。")
    if not adjustments:
        adjustments.append(f"{campaign} 当前反馈稳定，下轮保持现有配额，重点优化高误判关键词。")
    return adjustments[:3]


def _effective_campaign_target(base_target: int, feedback_rule: dict | None) -> int:
    if not feedback_rule:
        return base_target
    delta = int(feedback_rule.get("quota_delta", 0) or 0)
    missed = int(feedback_rule.get("missed", 0) or 0)
    approved = int(feedback_rule.get("approved", 0) or 0)
    if missed > 0:
        return max(12, min(18, base_target + min(missed, 3)))
    if approved >= 3 and delta > 0:
        return min(20, base_target + delta)
    return base_target


@router.post("/{product_id}/selection-feedback", response_model=Response[SelectionMeta])
async def save_selection_feedback(
    product_id: int,
    body: SelectionFeedbackPayload,
    current_user_id: CurrentUser,
    db: DBSession,
):
    record = (await db.execute(
        select(UserProduct).where(
            UserProduct.user_id == current_user_id,
            UserProduct.product_id == product_id,
            UserProduct.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Product not found in your library")

    product = (await db.execute(
        select(Product).where(Product.id == product_id, Product.is_deleted == False)
    )).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    payload = {
        "outcome": body.outcome,
        "reasons": body.reasons,
        "notes": body.notes,
        "next_action": body.next_action,
    }
    _set_feedback_payload(record, payload)
    if body.outcome in {"rejected_missed", "featured_missed"}:
        record.manual_review_flag = True
    await db.commit()
    await db.refresh(record)
    return Response(data=_selection_meta_with_scoring(product, record))


@router.delete("/{product_id}/selection-feedback", response_model=Response[SelectionMeta])
async def delete_selection_feedback(
    product_id: int,
    current_user_id: CurrentUser,
    db: DBSession,
):
    record = (await db.execute(
        select(UserProduct).where(
            UserProduct.user_id == current_user_id,
            UserProduct.product_id == product_id,
            UserProduct.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Product not found in your library")

    product = (await db.execute(
        select(Product).where(Product.id == product_id, Product.is_deleted == False)
    )).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    payload = _extract_notes_payload(record)
    payload.pop("selection_feedback", None)
    if payload:
        _persist_notes_payload(record, payload)
    else:
        record.notes = None
    await db.commit()
    await db.refresh(record)
    return Response(data=_selection_meta_with_scoring(product, record))


@router.get("/selection/feedback-summary", response_model=Response[SelectionFeedbackSummary])
async def get_selection_feedback_summary(
    current_user_id: CurrentUser,
    db: DBSession,
):
    rows = (await db.execute(
        select(Product, UserProduct)
        .join(UserProduct, UserProduct.product_id == Product.id)
        .where(UserProduct.user_id == current_user_id)
        .where(UserProduct.is_deleted == False)
        .where(Product.is_deleted == False)
    )).all()

    grouped: dict[str, dict[str, list]] = {
        campaign: {"feedback": [], "reasons": []}
        for campaign in SELECTION_CAMPAIGNS
    }
    total_approved = total_rejected = total_missed = 0
    for product, record in rows:
        if record.weekly_campaign not in grouped:
            continue
        feedback = _get_feedback_payload(record)
        if not feedback:
            continue
        grouped[record.weekly_campaign]["feedback"].append(feedback)
        grouped[record.weekly_campaign]["reasons"].extend(feedback.get("reasons") or [])
        outcome = feedback.get("outcome")
        if outcome in {"approved", "featured_confirmed"}:
            total_approved += 1
        elif outcome in {"rejected_confirmed"}:
            total_rejected += 1
        elif outcome in {"rejected_missed", "featured_missed"}:
            total_missed += 1

    campaigns: list[SelectionFeedbackSummaryCampaign] = []
    global_reasons: list[str] = []
    for campaign, payload in grouped.items():
        feedback_items = payload["feedback"]
        reasons = [reason for reason in payload["reasons"] if isinstance(reason, str)]
        global_reasons.extend(reasons)
        approved = len([item for item in feedback_items if item.get("outcome") in {"approved", "featured_confirmed"}])
        rejected = len([item for item in feedback_items if item.get("outcome") == "rejected_confirmed"])
        missed = len([item for item in feedback_items if item.get("outcome") in {"rejected_missed", "featured_missed"}])
        top_reasons = [reason for reason, _count in sorted(
            ((reason, reasons.count(reason)) for reason in set(reasons)),
            key=lambda item: item[1],
            reverse=True,
        )[:3]]
        campaigns.append(SelectionFeedbackSummaryCampaign(
            campaign=campaign,
            total_feedback=len(feedback_items),
            approved=approved,
            rejected=rejected,
            missed=missed,
            top_reasons=top_reasons,
            recommended_adjustments=_feedback_adjustments(campaign, reasons, missed, rejected),
        ))

    global_recommendations = []
    if total_missed:
        global_recommendations.append("当前误判已出现，下一轮应提高人工复核优先级并保留误判样本。")
    if any("custom" in reason.lower() or "定制" in reason for reason in global_reasons):
        global_recommendations.append("误判原因集中在定制表达，下一轮优先提高 customization_type 和 embroidery_fit 判断强度。")
    if any("audience" in reason.lower() or "人群" in reason for reason in global_reasons):
        global_recommendations.append("误判原因涉及人群不清，下轮提高 audience_tags 命中要求。")
    if not global_recommendations:
        global_recommendations.append("当前反馈量不足，先持续收集主推确认和淘汰误判样本。")

    summary = SelectionFeedbackSummary(
        total_feedback=sum(item.total_feedback for item in campaigns),
        total_approved=total_approved,
        total_rejected=total_rejected,
        total_missed=total_missed,
        campaigns=campaigns,
        global_recommendations=global_recommendations[:4],
    )
    return Response(data=summary)


@router.get("/{product_id}", response_model=Response[ProductDetail])
async def get_product_detail(product_id: int, db: DBSession, current_user_id: CurrentUser):
    result = await db.execute(select(Product).where(Product.id == product_id, Product.is_deleted == False))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    saved = (await db.execute(
        select(UserProduct).where(
            UserProduct.user_id == current_user_id,
            UserProduct.product_id == product_id,
            UserProduct.is_deleted == False,
        )
    )).scalar_one_or_none()
    detail = ProductDetail.model_validate(product)
    detail.is_saved = bool(saved)
    detail.selection_meta = _selection_meta_with_scoring(product, saved)
    return Response(data=detail)


@router.post("/{product_id}/save", response_model=Response[None])
async def save_product(product_id: int, current_user_id: CurrentUser, db: DBSession):
    result = await db.execute(select(Product).where(Product.id == product_id, Product.is_deleted == False))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    existing = await db.execute(
        select(UserProduct).where(
            UserProduct.user_id == current_user_id,
            UserProduct.product_id == product_id,
            UserProduct.is_deleted == False,
        )
    )
    if existing.scalar_one_or_none():
        return Response(message="Already in your library")

    db.add(UserProduct(
        user_id=current_user_id,
        product_id=product_id,
        status="saved",
        selection_status="candidate",
    ))
    await db.commit()
    return Response(message="Product saved to your library")


@router.post("/batch-save", response_model=Response[None])
async def batch_save_products(
    body: dict,
    current_user_id: CurrentUser,
    db: DBSession,
):
    """批量加入选品库"""
    product_ids: list[int] = body.get("product_ids", [])
    if not product_ids:
        raise HTTPException(status_code=400, detail="product_ids 不能为空")
    if len(product_ids) > 100:
        raise HTTPException(status_code=400, detail="单次最多批量保存 100 条")

    # 查出已保存的
    existing_result = await db.execute(
        select(UserProduct.product_id).where(
            UserProduct.user_id == current_user_id,
            UserProduct.product_id.in_(product_ids),
            UserProduct.is_deleted == False,
        )
    )
    already_saved = {row[0] for row in existing_result.fetchall()}

    added = 0
    for pid in product_ids:
        if pid not in already_saved:
            db.add(UserProduct(
                user_id=current_user_id,
                product_id=pid,
                status="saved",
                selection_status="candidate",
            ))
            added += 1

    await db.commit()
    return Response(message=f"成功加入 {added} 件，跳过 {len(product_ids) - added} 件（已在库中）")


@router.patch("/{product_id}/selection-meta", response_model=Response[SelectionMeta])
async def update_selection_meta(
    product_id: int,
    body: SelectionMetaUpdateRequest,
    current_user_id: CurrentUser,
    db: DBSession,
):
    record = (await db.execute(
        select(UserProduct).where(
            UserProduct.user_id == current_user_id,
            UserProduct.product_id == product_id,
            UserProduct.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Product not found in your library")

    product = (await db.execute(
        select(Product).where(
            Product.id == product_id,
            Product.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    changed_fields = body.model_dump(exclude_unset=True)
    for field, value in changed_fields.items():
        setattr(record, field, value)

    _apply_product_inference_tags(product, record)
    score_result = score_selection_candidate(product, record)
    record.embroidery_fit_score = score_result.embroidery_fit_score
    record.trend_score = score_result.trend_score
    record.gift_score = score_result.gift_score
    record.campaign_score = score_result.campaign_score
    record.final_selection_score = score_result.final_selection_score
    record.selection_confidence = score_result.selection_confidence
    record.manual_review_flag = score_result.manual_review_flag
    if "selection_reason" not in changed_fields:
        record.selection_reason = score_result.selection_reason
    if "manual_review_flag" not in changed_fields:
        record.manual_review_flag = score_result.manual_review_flag
    if "selection_status" not in changed_fields:
        record.selection_status = score_result.recommended_status

    await db.commit()
    await db.refresh(record)
    return Response(data=_selection_meta_with_scoring(product, record))


@router.delete("/{product_id}/save", response_model=Response[None])
async def remove_product(product_id: int, current_user_id: CurrentUser, db: DBSession):
    existing = await db.execute(
        select(UserProduct).where(
            UserProduct.user_id == current_user_id,
            UserProduct.product_id == product_id,
            UserProduct.is_deleted == False,
        )
    )
    record = existing.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Not in your library")
    record.is_deleted = True
    await db.commit()
    return Response(message="Removed from your library")
