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
