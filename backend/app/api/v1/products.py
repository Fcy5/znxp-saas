from fastapi import APIRouter, Query, HTTPException
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import CurrentUser, DBSession
from app.models.product import Product, UserProduct
from app.schemas.product import ProductCard, ProductDetail, ProductFilterRequest, ProductRecommendation
from app.schemas.common import Response, PagedResponse, PageInfo
import math

router = APIRouter(prefix="/products", tags=["Products"])

ALLOWED_SORT = {"ai_score", "sales_trend", "tiktok_views", "profit_margin_estimate", "review_score", "review_count"}


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
async def get_recommendations(db: DBSession, limit: int = Query(5, le=20)):
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
    # 每个平台取 top 60（按 review_count + tiktok_views 混合排序），共约 360 候选
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
            .limit(60)
        )
        res = await db.execute(per_q)
        candidates.extend(res.scalars().all())

    # 对所有候选打分并排序
    scored_candidates = sorted(candidates, key=lambda p: _rec_score(p, maxes), reverse=True)

    # 多样化去重：title[:60] 去重 + 每平台最多 2 条 + 每品类最多 2 条
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
        if platform_count.get(plat, 0) >= 2:
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

    # 混入小红书热品（取 3 条，插在第 2、5、8 位，分散不扎堆）
    xhs_recs = await _get_xhs_recommendations(db, limit=3)
    for i, xrec in enumerate(xhs_recs):
        insert_pos = min(1 + i * 3, len(recs))
        recs.insert(insert_pos, xrec)

    return Response(data=recs[:limit + 3])


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


@router.get("/library/list", response_model=PagedResponse[ProductCard])
async def get_my_library(
    current_user_id: CurrentUser,
    db: DBSession,
    page: int = Query(1),
    page_size: int = Query(20),
    keyword: str | None = Query(None),
):
    q = (
        select(Product)
        .join(UserProduct, UserProduct.product_id == Product.id)
        .where(UserProduct.user_id == current_user_id)
        .where(UserProduct.is_deleted == False)
        .where(Product.is_deleted == False)
    )
    if keyword:
        q = q.where(Product.title.ilike(f"%{keyword}%"))
    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar() or 0

    data_q = q.order_by(Product.ai_score.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(data_q)
    products = result.scalars().all()

    return PagedResponse(
        data=[ProductCard.model_validate(p) for p in products],
        page_info=PageInfo(page=page, page_size=page_size, total=total, total_pages=math.ceil(total / page_size) if page_size else 1),
    )


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

    db.add(UserProduct(user_id=current_user_id, product_id=product_id, status="saved"))
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
            db.add(UserProduct(user_id=current_user_id, product_id=pid, status="saved"))
            added += 1

    await db.commit()
    return Response(message=f"成功加入 {added} 件，跳过 {len(product_ids) - added} 件（已在库中）")


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
