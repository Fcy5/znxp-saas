"""
定时爬虫调度器
- Shopify 竞品更新：每天 01:00
- TikTok 话题爬取：每天 02:00
- FB 广告批量爬取：每天 04:00
- Google Shopping：每 3 天 06:00

所有爬虫以子进程方式运行，避免与 asyncio 事件循环冲突。
"""
import logging
import subprocess
import sys
import os
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger("scheduler")

SPIDER_DIR = Path(__file__).parent.parent / "spider"
PYTHON = sys.executable  # 与当前进程同一 Python 环境


def _run(script: str, *args: str, label: str = ""):
    """在子进程中运行爬虫脚本"""
    cmd = [PYTHON, str(SPIDER_DIR / script), *args]
    tag = label or script
    logger.info(f"[{tag}] 开始运行: {' '.join(cmd)}")
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=3600,  # 最长 1 小时
            cwd=str(SPIDER_DIR),
        )
        if result.returncode == 0:
            logger.info(f"[{tag}] 完成\n{result.stdout[-2000:] if result.stdout else ''}")
        else:
            logger.error(f"[{tag}] 异常退出 (code={result.returncode})\n{result.stderr[-2000:]}")
    except subprocess.TimeoutExpired:
        logger.error(f"[{tag}] 超时（>1h），已终止")
    except Exception as e:
        logger.error(f"[{tag}] 启动失败: {e}")


# ── 各爬虫任务 ─────────────────────────────────────────────────────────────────

def job_shopify():
    """Shopify 竞品店铺数据更新（所有店铺）"""
    _run("shopify_update.py", "--all", label="Shopify")


def job_shopify_cache_sync():
    """每日自动同步所有店铺商品到本地缓存（凌晨 03:00）"""
    import asyncio
    import pymysql
    import pymysql.cursors
    import re
    from datetime import datetime

    logger.info("[ShopifyCache] 开始同步所有店铺商品缓存")

    try:
        from app.core.config import settings
        from app.utils.shopify import list_products

        url = settings.database_url
        m = re.match(r"mysql\+\w+://([^:]+):([^@]+)@([^:/]+):?(\d+)?/(\w+)", url)
        if not m:
            logger.error("[ShopifyCache] 无法解析 DATABASE_URL")
            return
        db_user, db_pwd, db_host, db_port, db_name = m.groups()

        def _db():
            return pymysql.connect(
                host=db_host, port=int(db_port or 3306),
                user=db_user, password=db_pwd, db=db_name,
                charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor,
                autocommit=False,
            )

        # 取所有有 token 的店铺
        conn = _db()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, domain, shopify_access_token FROM shops WHERE is_deleted=0 AND shopify_access_token IS NOT NULL AND shopify_access_token != ''"
                )
                shops = cur.fetchall()
        finally:
            conn.close()

        if not shops:
            logger.info("[ShopifyCache] 没有配置 Token 的店铺，跳过")
            return

        logger.info(f"[ShopifyCache] 共 {len(shops)} 个店铺待同步")

        def _parse_dt(s):
            if not s:
                return None
            try:
                return datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None)
            except Exception:
                return None

        for shop in shops:
            shop_id = shop["id"]
            domain = shop["domain"]
            token = shop["shopify_access_token"]
            try:
                products = asyncio.run(list_products(domain, token, limit=250))
                now = datetime.utcnow()
                conn = _db()
                try:
                    with conn.cursor() as cur:
                        for p in products:
                            images = p.get("images") or []
                            variants = p.get("variants") or []
                            cur.execute("""
                                INSERT INTO shopify_products_cache
                                    (shop_id, shopify_product_id, title, image_url, status,
                                     product_type, tags, price, published_at, shopify_created_at, synced_at)
                                VALUES
                                    (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                                ON DUPLICATE KEY UPDATE
                                    title=VALUES(title), image_url=VALUES(image_url), status=VALUES(status),
                                    product_type=VALUES(product_type), tags=VALUES(tags), price=VALUES(price),
                                    published_at=VALUES(published_at), synced_at=VALUES(synced_at)
                            """, (
                                shop_id, p["id"],
                                (p.get("title") or "")[:512],
                                (images[0].get("src", "") if images else "")[:1024],
                                (p.get("status") or "active")[:32],
                                (p.get("product_type") or "")[:255],
                                (p.get("tags") or "")[:1024],
                                (variants[0].get("price", "") if variants else "")[:32],
                                _parse_dt(p.get("published_at")),
                                _parse_dt(p.get("created_at")),
                                now,
                            ))
                    conn.commit()
                finally:
                    conn.close()
                logger.info(f"[ShopifyCache] 店铺 {domain} 同步完成，{len(products)} 件商品")
            except Exception as e:
                logger.error(f"[ShopifyCache] 店铺 {domain} 同步失败: {e}")

        logger.info("[ShopifyCache] 所有店铺同步完成")
    except Exception as e:
        logger.error(f"[ShopifyCache] 任务异常: {e}")


def job_tiktok():
    """TikTok 话题商品爬取（所有话题）"""
    _run("tiktok_shop_spider.py", "--all", label="TikTok")


def job_fb():
    """Facebook 广告批量爬取"""
    _run("batch_crawl.py", label="FB-Ads")


def job_google():
    """Google Shopping 关键词爬取 + 同步进 products 表"""
    _run("google_shopping_spider.py", "--all", label="Google")
    _run("google_sync_products.py", label="Google-Sync")


# ── 调度器初始化 ───────────────────────────────────────────────────────────────

_scheduler: BackgroundScheduler | None = None


def start_scheduler():
    global _scheduler
    _scheduler = BackgroundScheduler(timezone="Asia/Shanghai")

    # Shopify：每天 01:00
    _scheduler.add_job(job_shopify, CronTrigger(hour=1, minute=0), id="shopify", name="Shopify每日更新", replace_existing=True)

    # TikTok：每天 02:00
    _scheduler.add_job(job_tiktok, CronTrigger(hour=2, minute=0), id="tiktok", name="TikTok每日爬取", replace_existing=True)

    # Shopify 商品缓存：每天 03:00（错开爬虫任务，流量低谷）
    _scheduler.add_job(job_shopify_cache_sync, CronTrigger(hour=3, minute=0), id="shopify_cache", name="Shopify商品缓存同步", replace_existing=True)

    # FB：每天 04:00（Playwright 较重，错开 TikTok）
    _scheduler.add_job(job_fb, CronTrigger(hour=4, minute=0), id="fb", name="FB广告每日爬取", replace_existing=True)

    # Google：每 3 天 06:00（SerpAPI 有额度限制）
    _scheduler.add_job(job_google, CronTrigger(hour=6, minute=0, day="*/3"), id="google", name="Google每3天爬取", replace_existing=True)

    _scheduler.start()
    logger.info("✅ 定时爬虫调度器已启动")
    print("✅ 定时爬虫调度器已启动")
    for job in _scheduler.get_jobs():
        msg = f"  · {job.name}  下次执行: {job.next_run_time}"
        logger.info(msg)
        print(msg)


def stop_scheduler():
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("👋 调度器已停止")
