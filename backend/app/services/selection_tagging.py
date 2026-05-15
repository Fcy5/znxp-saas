from __future__ import annotations

from dataclasses import dataclass

from app.models.product import Product, UserProduct


@dataclass
class SelectionTaggingResult:
    season_tags: list[str]
    holiday_tags: list[str]
    audience_tags: list[str]
    scenario_tags: list[str]
    customization_type: list[str]
    event_window: str | None
    content_hook: str | None
    tag_confidence: float
    tag_summary: str


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


def _unique(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        if item and item not in seen:
            seen.add(item)
            result.append(item)
    return result


def infer_selection_tags(product: Product, record: UserProduct | None = None) -> SelectionTaggingResult:
    text = _product_text(product)
    season_tags: list[str] = []
    holiday_tags: list[str] = []
    audience_tags: list[str] = []
    scenario_tags: list[str] = []
    customization_type: list[str] = []
    event_window: str | None = None

    if _has_any(text, ("spring", "easter", "mother's day", "graduation")):
        season_tags.append("spring")
    if _has_any(text, ("summer", "beach", "vacation", "camp", "travel", "bbq", "pool")):
        season_tags.append("summer")
    if not season_tags:
        season_tags.extend(["spring", "summer"])

    if _has_any(text, ("father", "dad", "grandpa", "husband")):
        holiday_tags.append("fathers_day")
        audience_tags.extend(["dad", "family"])
    if _has_any(text, ("graduation", "graduate", "class of", "senior", "college")):
        holiday_tags.append("graduation")
        audience_tags.extend(["graduate", "family"])
    if _has_any(text, ("memorial", "memory", "remembrance", "tribute", "keepsake")):
        holiday_tags.append("memorial_day")
        audience_tags.append("family")
        scenario_tags.append("memorial")
    if _has_any(text, ("summer", "beach", "vacation", "camp", "travel")):
        holiday_tags.append("summer")
        audience_tags.append("traveler")
        scenario_tags.append("travel")

    if _has_any(text, ("pet", "dog", "cat", "paw")):
        audience_tags.append("pet_owner")
    if _has_any(text, ("gift", "present", "keepsake")):
        audience_tags.append("gift_buyer")
        scenario_tags.append("gift")
    if _has_any(text, ("bbq", "cookout", "outdoor", "camp", "beach")):
        scenario_tags.append("outdoor")
    if _has_any(text, ("school", "graduation", "class of")):
        scenario_tags.append("celebration")
    if _has_any(text, ("home", "living room", "bedroom", "cozy")):
        scenario_tags.append("home")

    if _has_any(text, ("name", "monogram", "initial", "personalized")):
        customization_type.append("name")
    if _has_any(text, ("date", "year", "class of", "anniversary")):
        customization_type.append("date")
    if _has_any(text, ("dad", "father", "mom", "grandpa", "graduate", "husband")):
        customization_type.append("title")
    if _has_any(text, ("portrait", "photo", "line art", "sketch")):
        customization_type.append("line_art")

    if holiday_tags:
        if "graduation" in holiday_tags or "memorial_day" in holiday_tags:
            event_window = "warming"
        elif "summer" in holiday_tags:
            event_window = "peak"
        else:
            event_window = "warming"

    hooks: list[str] = []
    if "fathers_day" in holiday_tags:
        hooks.append("gift for dad / keepsake for father")
    if "graduation" in holiday_tags:
        hooks.append("graduation keepsake / class of gift")
    if "memorial_day" in holiday_tags:
        hooks.append("family remembrance / memorial keepsake")
    if "summer" in holiday_tags:
        hooks.append("summer trip / outdoor lifestyle gift")
    if "pet_owner" in audience_tags:
        hooks.append("pet lover keepsake / custom pet gift")
    content_hook = " / ".join(_unique(hooks)) or None

    confidence = 42.0
    confidence += min(16, len(_unique(holiday_tags)) * 6)
    confidence += min(16, len(_unique(audience_tags)) * 3)
    confidence += min(12, len(_unique(scenario_tags)) * 3)
    confidence += min(10, len(_unique(customization_type)) * 4)
    if product.main_image:
        confidence += 8

    summary_parts: list[str] = []
    if holiday_tags:
        summary_parts.append(f"识别节日 {', '.join(_unique(holiday_tags))}")
    if audience_tags:
        summary_parts.append(f"识别人群 {', '.join(_unique(audience_tags)[:3])}")
    if customization_type:
        summary_parts.append(f"识别定制类型 {', '.join(_unique(customization_type))}")
    if scenario_tags:
        summary_parts.append(f"识别场景 {', '.join(_unique(scenario_tags)[:3])}")
    tag_summary = "；".join(summary_parts) + "。" if summary_parts else "未识别到明确标签，建议人工补充。"

    return SelectionTaggingResult(
        season_tags=_unique(season_tags),
        holiday_tags=_unique(holiday_tags),
        audience_tags=_unique(audience_tags),
        scenario_tags=_unique(scenario_tags),
        customization_type=_unique(customization_type),
        event_window=event_window,
        content_hook=content_hook,
        tag_confidence=min(round(confidence, 2), 100.0),
        tag_summary=tag_summary,
    )
