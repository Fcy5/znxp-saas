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

router = APIRouter(prefix="/facebook", tags=["Facebook"])
logger = logging.getLogger("facebook")

# ── 爬虫状态 ──
_spider_status = {"running": False, "last_result": None, "last_run_at": None}

# ── 批量同步状态 ──
_sync_status = {"running": False, "last_result": None, "last_run_at": None}

# ── 定时调度器（全局单例） ──
_scheduler = BackgroundScheduler(timezone="Asia/Shanghai")
_scheduler.start()

# 默认爬取 URL（可通过接口修改）
_schedule_config = {
    "enabled": False,
    "cron": "0 6 * * *",   # 默认每天早 6 点
    "url": "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&is_targeted_country=false&media_type=all&q=embroidery&search_type=keyword_unordered",
    "max_scrolls": 20,
    "job_id": "fb_spider_cron",
}


# ── Schema ──
class SpiderRequest(BaseModel):
    url: str
    max_scrolls: int = 20
    headless: bool = True


class ScheduleConfig(BaseModel):
    enabled: bool
    cron: str          # standard 5-field cron, e.g. "0 6 * * *"
    url: str
    max_scrolls: int = 20


# ── 内部函数 ──
def _run_spider_thread(url: str, max_scrolls: int, headless: bool = True):
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../../../spider"))
    from fb_spider import run_spider, sync_existing_media
    _spider_status["running"] = True
    _spider_status["last_run_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        result = run_spider(url, max_scrolls=max_scrolls, headless=headless)
        _spider_status["last_result"] = result
        logger.info(f"爬虫完成: {result}，开始同步媒体...")
        # 爬完自动同步媒体（下载新广告的图片/视频到本地）
        sync_result = sync_existing_media()
        _spider_status["last_result"]["sync"] = sync_result
        logger.info(f"媒体同步完成: {sync_result}")
    except Exception as e:
        _spider_status["last_result"] = {"error": str(e), "inserted": 0, "parsed": 0}
        logger.error(f"爬虫出错: {e}")
    finally:
        _spider_status["running"] = False


def _schedule_job():
    """定时任务入口"""
    if _spider_status["running"]:
        logger.info("上次爬虫还未结束，跳过本次调度")
        return
    t = threading.Thread(
        target=_run_spider_thread,
        args=(_schedule_config["url"], _schedule_config["max_scrolls"], True),
        daemon=True,
    )
    t.start()


def _apply_schedule():
    """根据 _schedule_config 更新调度器"""
    job_id = _schedule_config["job_id"]
    if _scheduler.get_job(job_id):
        _scheduler.remove_job(job_id)
    if _schedule_config["enabled"]:
        fields = _schedule_config["cron"].split()
        if len(fields) == 5:
            minute, hour, day, month, day_of_week = fields
            _scheduler.add_job(
                _schedule_job,
                CronTrigger(minute=minute, hour=hour, day=day, month=month, day_of_week=day_of_week),
                id=job_id,
                replace_existing=True,
            )
            logger.info(f"定时任务已设置: {_schedule_config['cron']}")


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

@router.post("/spider/run", response_model=Response[None])
async def run_spider_api(body: SpiderRequest, current_user_id: CurrentUser):
    """手动触发 FB 广告爬虫（后台运行）"""
    if _spider_status["running"]:
        return Response(code=400, message="爬虫正在运行中，请等待完成")
    t = threading.Thread(
        target=_run_spider_thread,
        args=(body.url, body.max_scrolls, body.headless),
        daemon=True,
    )
    t.start()
    return Response(message="爬虫已启动")


@router.get("/spider/status", response_model=Response[dict])
async def spider_status(current_user_id: CurrentUser):
    """查询爬虫运行状态 + 当前调度配置"""
    job = _scheduler.get_job(_schedule_config["job_id"])
    next_run = str(job.next_run_time) if job and job.next_run_time else None
    return Response(data={
        "running": _spider_status["running"],
        "last_result": _spider_status["last_result"],
        "last_run_at": _spider_status["last_run_at"],
        "schedule": {**_schedule_config, "next_run": next_run},
    })


@router.post("/spider/schedule", response_model=Response[dict])
async def set_schedule(body: ScheduleConfig, current_user_id: CurrentUser):
    """设置定时爬虫计划"""
    fields = body.cron.strip().split()
    if len(fields) != 5:
        return Response(code=400, message="cron 格式错误，需要 5 个字段，如 '0 6 * * *'")

    _schedule_config.update({
        "enabled": body.enabled,
        "cron": body.cron.strip(),
        "url": body.url,
        "max_scrolls": body.max_scrolls,
    })
    _apply_schedule()

    job = _scheduler.get_job(_schedule_config["job_id"])
    next_run = str(job.next_run_time) if job and job.next_run_time else None
    return Response(data={**_schedule_config, "next_run": next_run}, message="调度已更新")


def _run_sync_thread():
    """批量下载现有 DB 记录中的远端媒体"""
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../../../spider"))
    from fb_spider import sync_existing_media
    _sync_status["running"] = True
    _sync_status["last_run_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        result = sync_existing_media()
        _sync_status["last_result"] = result
        logger.info(f"批量同步完成: {result}")
    except Exception as e:
        _sync_status["last_result"] = {"error": str(e), "updated": 0, "skipped": 0}
        logger.error(f"批量同步出错: {e}")
    finally:
        _sync_status["running"] = False


@router.post("/ads/sync-media", response_model=Response[None])
async def sync_media(current_user_id: CurrentUser):
    """批量下载现有广告的图片/视频到本地（后台运行）"""
    if _sync_status["running"]:
        return Response(code=400, message="同步正在进行中，请等待完成")
    t = threading.Thread(target=_run_sync_thread, daemon=True)
    t.start()
    return Response(message="媒体同步已启动，请稍后查看状态")


@router.get("/ads/sync-status", response_model=Response[dict])
async def sync_media_status(current_user_id: CurrentUser):
    """查询批量媒体同步状态"""
    return Response(data={
        "running": _sync_status["running"],
        "last_result": _sync_status["last_result"],
        "last_run_at": _sync_status["last_run_at"],
    })


@router.get("/ads", response_model=PagedResponse[dict])
async def list_fb_ads(
    current_user_id: CurrentUser,
    db: DBSession,
    keyword: str = Query(None),
    ad_type: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """获取 FB 广告列表"""
    where = ["is_delete = 0"]
    params: dict = {}
    if keyword:
        where.append("(store_name LIKE :kw OR advertising_text LIKE :kw)")
        params["kw"] = f"%{keyword}%"
    if ad_type:
        where.append("advertising_type = :ad_type")
        params["ad_type"] = ad_type

    where_sql = " AND ".join(where)
    total = (await db.execute(
        text(f"SELECT COUNT(*) FROM fb_advertising_table WHERE {where_sql}"), params
    )).scalar()

    rows = (await db.execute(
        text(f"""SELECT id, store_name, store_icon, advertising_text,
                        advertising_img, advertising_video, advertising_type,
                        fb_url, advertising_time, advertising_platform
                 FROM fb_advertising_table
                 WHERE {where_sql}
                 ORDER BY id DESC
                 LIMIT :limit OFFSET :offset"""),
        {**params, "limit": page_size, "offset": (page - 1) * page_size},
    )).mappings().all()

    data = [
        {
            "id": r["id"],
            "store_name": r["store_name"],
            "store_icon": _parse_json_field(r["store_icon"]),
            "advertising_text": r["advertising_text"],
            "advertising_img": _parse_json_field(r["advertising_img"]),
            "advertising_video": _parse_json_field(r["advertising_video"]),
            "advertising_type": r["advertising_type"],
            "fb_url": _parse_json_field(r["fb_url"]),
            "advertising_time": str(r["advertising_time"]) if r["advertising_time"] else None,
            "advertising_platform": r["advertising_platform"],
        }
        for r in rows
    ]

    return PagedResponse(
        data=data,
        page_info=PageInfo(page=page, page_size=page_size, total=total,
                           total_pages=(total + page_size - 1) // page_size),
    )
