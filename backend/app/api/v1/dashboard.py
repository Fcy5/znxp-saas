from fastapi import APIRouter
from sqlalchemy import select, func
from app.core.deps import CurrentUser, DBSession
from app.models.product import Product, UserProduct
from app.models.publish import PublishedProduct
from app.schemas.dashboard import DashboardStats, AgentDailySummary, TrendPoint
from app.schemas.common import Response
from datetime import date, datetime, timezone, timedelta
from typing import List

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=Response[DashboardStats])
async def get_stats(current_user_id: CurrentUser, db: DBSession):
    """全局概览数据"""
    # Total products in platform
    total_r = await db.execute(select(func.count()).where(Product.is_deleted == False))
    total_products = total_r.scalar() or 0

    # User's saved library
    lib_r = await db.execute(
        select(func.count()).where(
            UserProduct.user_id == current_user_id,
            UserProduct.is_deleted == False,
        )
    )
    library_count = lib_r.scalar() or 0

    # Today's publishes
    today = date.today()
    pub_r = await db.execute(
        select(func.count()).where(
            PublishedProduct.user_id == current_user_id,
            PublishedProduct.status == "published",
            func.date(PublishedProduct.published_at) == today,
        )
    )
    published_today = pub_r.scalar() or 0

    # Total published
    total_pub_r = await db.execute(
        select(func.count()).where(
            PublishedProduct.user_id == current_user_id,
            PublishedProduct.status == "published",
        )
    )
    total_published = total_pub_r.scalar() or 0

    # Per-platform counts
    plat_r = await db.execute(
        select(Product.source_platform, func.count())
        .where(Product.is_deleted == False)
        .group_by(Product.source_platform)
    )
    platform_counts = {row[0]: row[1] for row in plat_r.all() if row[0]}

    # Per-category counts
    cat_r = await db.execute(
        select(Product.category, func.count())
        .where(Product.is_deleted == False)
        .group_by(Product.category)
        .order_by(func.count().desc())
        .limit(8)
    )
    category_counts = {row[0]: row[1] for row in cat_r.all() if row[0]}

    return Response(data=DashboardStats(
        today_recommended=min(total_products, 12),
        total_products_in_library=library_count,
        published_today=published_today,
        total_published=total_published,
        total_products_platform=total_products,
        agent_tasks_running=0,
        agent_tasks_completed_today=0,
        platform_counts=platform_counts,
        category_counts=category_counts,
    ))


@router.get("/trend", response_model=Response[List[TrendPoint]])
async def get_trend(current_user_id: CurrentUser, db: DBSession, days: int = 14):
    """最近 N 天的趋势数据（新增商品 + 用户上架数）"""
    today = date.today()
    start = today - timedelta(days=days - 1)

    # Platform new products per day
    prod_r = await db.execute(
        select(func.date(Product.created_at), func.count())
        .where(Product.is_deleted == False, func.date(Product.created_at) >= start)
        .group_by(func.date(Product.created_at))
    )
    prod_by_day = {str(row[0]): row[1] for row in prod_r.all()}

    # User published per day
    pub_r = await db.execute(
        select(func.date(PublishedProduct.published_at), func.count())
        .where(
            PublishedProduct.user_id == current_user_id,
            PublishedProduct.status == "published",
            func.date(PublishedProduct.published_at) >= start,
        )
        .group_by(func.date(PublishedProduct.published_at))
    )
    pub_by_day = {str(row[0]): row[1] for row in pub_r.all()}

    points = []
    for i in range(days):
        d = start + timedelta(days=i)
        key = str(d)
        points.append(TrendPoint(
            date=d.strftime("%m-%d"),
            new_products=prod_by_day.get(key, 0),
            published=pub_by_day.get(key, 0),
        ))

    return Response(data=points)


@router.get("/agent-summary", response_model=Response[AgentDailySummary])
async def get_agent_summary(current_user_id: CurrentUser):
    """Agent今日工作摘要"""
    return Response(data=AgentDailySummary(
        products_found=0,
        images_processed=0,
        videos_generated=0,
        products_published=0,
        date=str(date.today()),
    ))
