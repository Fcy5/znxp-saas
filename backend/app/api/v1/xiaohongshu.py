"""
小红书商品数据 API
- 爬虫触发 & 状态查询
- 商品列表（分页 + 搜索）
- 直接上架到 Shopify
"""
import threading
import json
import os
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Query
from sqlalchemy import text
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from pydantic import BaseModel

from app.core.deps import CurrentUser, DBSession
from app.schemas.common import Response, PagedResponse, PageInfo
from app.models.shop import Shop
from sqlalchemy import select

router = APIRouter(prefix="/xiaohongshu", tags=["XiaoHongShu"])
logger = logging.getLogger("xiaohongshu")

# ── 爬虫状态 ──
_spider_status = {"running": False, "last_result": None, "last_run_at": None}

# ── 定时调度器 ──
_scheduler = BackgroundScheduler(timezone="Asia/Shanghai")
_scheduler.start()

_schedule_config = {
    "enabled": False,
    "cron": "0 8 * * *",
    "max_scrolls": 10,
    "job_id": "xhs_spider_cron",
}


# ── Schemas ──
class XhsSpiderRequest(BaseModel):
    max_scrolls: int = 10
    headless: bool = True


class XhsScheduleConfig(BaseModel):
    enabled: bool
    cron: str
    max_scrolls: int = 10


class XhsPublishRequest(BaseModel):
    xhs_product_id: int
    shop_id: int
    title: Optional[str] = None
    description: Optional[str] = None
    price: float = 29.99
    tags: str = "embroidery,custom,小红书"


# ── 内部函数 ──
def _run_spider_thread(max_scrolls: int, headless: bool = True):
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../../spider"))
    from xhs_spider import run_spider, EMBROIDERY_KEYWORDS
    _spider_status["running"] = True
    _spider_status["last_run_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        result = run_spider(keywords=None, max_scrolls=max_scrolls, headless=headless)
        _spider_status["last_result"] = result
        logger.info(f"小红书爬虫完成: {result}")
    except Exception as e:
        _spider_status["last_result"] = {"error": str(e), "inserted": 0, "parsed": 0}
        logger.error(f"小红书爬虫出错: {e}")
    finally:
        _spider_status["running"] = False


def _schedule_job():
    if _spider_status["running"]:
        return
    t = threading.Thread(
        target=_run_spider_thread,
        args=(_schedule_config["max_scrolls"], True),
        daemon=True,
    )
    t.start()


def _apply_schedule():
    job_id = _schedule_config["job_id"]
    if _scheduler.get_job(job_id):
        _scheduler.remove_job(job_id)
    if _schedule_config["enabled"]:
        fields = _schedule_config["cron"].split()
        if len(fields) == 5:
            minute, hour, day, month, dow = fields
            _scheduler.add_job(
                _schedule_job,
                CronTrigger(minute=minute, hour=hour, day=day, month=month, day_of_week=dow),
                id=job_id,
                replace_existing=True,
            )


def _parse_json_field(val):
    if val is None:
        return []
    if isinstance(val, list):
        return val
    try:
        return json.loads(val)
    except Exception:
        return [val] if val else []


# ── API ──

@router.get("/spider/keywords", response_model=Response[list])
async def get_keywords(current_user_id: CurrentUser):
    """获取内置刺绣关键词列表"""
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../../spider"))
    from xhs_spider import EMBROIDERY_KEYWORDS
    return Response(data=EMBROIDERY_KEYWORDS)


@router.post("/spider/run", response_model=Response[None])
async def run_spider_api(body: XhsSpiderRequest, current_user_id: CurrentUser):
    """手动触发小红书爬虫（自动轮询所有内置刺绣关键词）"""
    if _spider_status["running"]:
        return Response(code=400, message="爬虫正在运行中")
    t = threading.Thread(
        target=_run_spider_thread,
        args=(body.max_scrolls, body.headless),
        daemon=True,
    )
    t.start()
    return Response(message="爬虫已启动，自动轮询所有刺绣关键词")


@router.get("/spider/status", response_model=Response[dict])
async def spider_status(current_user_id: CurrentUser):
    """查询爬虫状态"""
    job = _scheduler.get_job(_schedule_config["job_id"])
    next_run = str(job.next_run_time) if job and job.next_run_time else None
    return Response(data={
        "running": _spider_status["running"],
        "last_result": _spider_status["last_result"],
        "last_run_at": _spider_status["last_run_at"],
        "schedule": {**_schedule_config, "next_run": next_run},
    })


@router.post("/spider/schedule", response_model=Response[dict])
async def set_schedule(body: XhsScheduleConfig, current_user_id: CurrentUser):
    """设置定时爬取"""
    fields = body.cron.strip().split()
    if len(fields) != 5:
        return Response(code=400, message="cron 格式错误")
    _schedule_config.update({
        "enabled": body.enabled,
        "cron": body.cron.strip(),
        "max_scrolls": body.max_scrolls,
    })
    _apply_schedule()
    job = _scheduler.get_job(_schedule_config["job_id"])
    next_run = str(job.next_run_time) if job and job.next_run_time else None
    return Response(data={**_schedule_config, "next_run": next_run}, message="调度已更新")


@router.get("/products", response_model=PagedResponse[dict])
async def list_xhs_products(
    current_user_id: CurrentUser,
    db: DBSession,
    keyword: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """获取小红书商品列表"""
    where = ["is_delete = 0", "images IS NOT NULL", "images != ''", "images != '[]'"]
    params: dict = {}
    if keyword:
        where.append("(title LIKE :kw OR author_name LIKE :kw OR keyword LIKE :kw)")
        params["kw"] = f"%{keyword}%"

    where_sql = " AND ".join(where)
    total = (await db.execute(
        text(f"SELECT COUNT(*) FROM xhs_products_table WHERE {where_sql}"), params
    )).scalar()

    rows = (await db.execute(
        text(f"""SELECT id, title, description, images, author_name, author_avatar,
                        likes_count, xhs_url, keyword, created_at
                 FROM xhs_products_table
                 WHERE {where_sql}
                 ORDER BY likes_count DESC, id DESC
                 LIMIT :limit OFFSET :offset"""),
        {**params, "limit": page_size, "offset": (page - 1) * page_size},
    )).mappings().all()

    data = [
        {
            "id": r["id"],
            "title": r["title"],
            "description": r["description"],
            "images": _parse_json_field(r["images"]),
            "author_name": r["author_name"],
            "author_avatar": r["author_avatar"] or "",
            "likes_count": r["likes_count"] or 0,
            "xhs_url": r["xhs_url"],
            "keyword": r["keyword"],
            "created_at": str(r["created_at"]) if r["created_at"] else None,
        }
        for r in rows
    ]

    return PagedResponse(
        data=data,
        page_info=PageInfo(page=page, page_size=page_size, total=total,
                           total_pages=(total + page_size - 1) // page_size),
    )


@router.post("/publish", response_model=Response[dict])
async def publish_xhs_product(body: XhsPublishRequest, current_user_id: CurrentUser, db: DBSession):
    """将小红书商品直接上架到 Shopify"""
    # 查商品
    row = (await db.execute(
        text("SELECT * FROM xhs_products_table WHERE id = :id AND is_delete = 0"),
        {"id": body.xhs_product_id},
    )).mappings().first()
    if not row:
        return Response(code=404, message="商品不存在")

    # 查店铺
    shop_result = await db.execute(
        select(Shop).where(Shop.id == body.shop_id, Shop.user_id == current_user_id, Shop.is_deleted == False)
    )
    shop = shop_result.scalar_one_or_none()
    if not shop:
        return Response(code=404, message="店铺不存在或无权限")
    if not shop.access_token:
        return Response(code=400, message="该店铺未配置 access token")

    from app.utils.shopify import create_product

    images = _parse_json_field(row["images"])
    # 转换本地路径为完整 URL（需配置 STATIC_BASE_URL，如 https://znxp-sass.vqmjc.cc）
    static_base = os.getenv("STATIC_BASE_URL", "https://znxp-sass.vqmjc.cc").rstrip("/")
    full_images = []
    for img in images:
        if img.startswith("/static/"):
            full_images.append(f"{static_base}{img}")
        elif img.startswith("http"):
            full_images.append(img)

    main_image = full_images[0] if full_images else None
    extra_images = full_images[1:] if len(full_images) > 1 else []

    final_title = (body.title or row["title"] or "Custom Embroidery Product")[:255]
    final_desc = body.description or row["description"] or ""

    try:
        shopify_product = await create_product(
            shop_domain=shop.domain,
            access_token=shop.access_token,
            title=final_title,
            description_html=f"<p>{final_desc}</p>" if final_desc else "",
            price=body.price,
            image_url=main_image,
            extra_images=extra_images,
            product_type="Custom Embroidery",
            tags=body.tags,
            vendor=row["author_name"] or "",
        )
        return Response(
            data={
                "shopify_product_id": str(shopify_product.get("id", "")),
                "shopify_url": shopify_product.get("onlineStoreUrl") or f"https://{shop.domain}/products/{shopify_product.get('handle', '')}",
            },
            message="上架成功",
        )
    except Exception as e:
        return Response(code=502, message=f"Shopify 上架失败: {str(e)[:200]}")


def _load_xhs_cookie_header() -> str:
    """从 xhs_cookies.json 组装 Cookie 请求头"""
    try:
        cookies_path = os.path.join(os.path.dirname(__file__), "../../../spider/xhs_cookies.json")
        if not os.path.exists(cookies_path):
            return ""
        with open(cookies_path, "r", encoding="utf-8") as f:
            cookies = json.load(f)
        # 只取关键 cookie
        key_names = {"web_session", "webId", "gid", "a1", "webBuild", "xsecappid",
                     "sec_poison_id", "unread", "loadts"}
        parts = []
        for c in cookies:
            name = c.get("name", "")
            if name in key_names or "session" in name.lower():
                parts.append(f"{name}={c.get('value', '')}")
        return "; ".join(parts)
    except Exception:
        return ""


@router.get("/img-proxy")
async def img_proxy(url: str):
    """代理 XHS CDN 图片，带上 session cookie 解决 403"""
    import httpx
    from fastapi.responses import StreamingResponse
    if not url.startswith("http") or "xhscdn" not in url:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="invalid url")
    headers = {
        "Referer": "https://www.xiaohongshu.com/",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    }
    cookie_header = _load_xhs_cookie_header()
    if cookie_header:
        headers["Cookie"] = cookie_header
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            from fastapi import HTTPException
            raise HTTPException(status_code=resp.status_code, detail=f"CDN returned {resp.status_code}")
        content_type = resp.headers.get("content-type", "image/jpeg")
        return StreamingResponse(iter([resp.content]), media_type=content_type,
                                 headers={"Cache-Control": "public, max-age=3600"})
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=502, detail=str(e))


@router.delete("/products/{product_id}", response_model=Response[None])
async def delete_xhs_product(product_id: int, current_user_id: CurrentUser, db: DBSession):
    """软删除小红书商品"""
    await db.execute(
        text("UPDATE xhs_products_table SET is_delete = 1 WHERE id = :id"),
        {"id": product_id},
    )
    await db.commit()
    return Response(message="已删除")
