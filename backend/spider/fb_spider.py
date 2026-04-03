"""
Facebook Ads Library Spider
从 Facebook 广告库爬取广告数据，直接写入 fb_advertising_table
爬取时同步下载图片/视频到本地，避免 FB CDN URL 过期
"""
import json
import re
import time
import random
import logging
import os
import hashlib
import requests
from datetime import datetime, timedelta

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
import pymysql

# ── DB 配置（复用后端 .env） ──
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "52.8.149.180"),
    "port": int(os.getenv("DB_PORT", 3306)),
    "db": os.getenv("DB_NAME", "znxp"),
    "user": os.getenv("DB_USER", "znxp"),
    "passwd": os.getenv("DB_PASSWORD", "ZRiACK48n2h7WJtJ"),
    "charset": "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor,
}

COOKIES_PATH = os.path.join(os.path.dirname(__file__), "facebook_cookies.json")

# 本地存储目录
STATIC_DIR = os.path.join(os.path.dirname(__file__), "../static/uploads/fb")
os.makedirs(STATIC_DIR, exist_ok=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("fb_spider")

# 下载请求 headers（模拟浏览器，不带 Referer 避免 403）
DOWNLOAD_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15",
}


def download_file(url: str) -> str:
    """
    下载单个文件到本地，返回本地路径 /static/uploads/fb/xxx
    失败时返回空字符串
    """
    if not url or not url.startswith("http"):
        return url  # 已是本地路径或空，直接返回

    # 用 URL 的 MD5 作为文件名
    ext = ""
    clean = url.split("?")[0]
    if "." in clean.split("/")[-1]:
        ext = "." + clean.split("/")[-1].rsplit(".", 1)[-1].lower()
        if ext not in (".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".mov", ".webm"):
            ext = ".jpg"
    else:
        ext = ".jpg"

    filename = hashlib.md5(url.encode()).hexdigest() + ext
    local_path = os.path.join(STATIC_DIR, filename)
    url_path = f"/static/uploads/fb/{filename}"

    # 已下载则直接返回
    if os.path.exists(local_path):
        return url_path

    try:
        resp = requests.get(url, headers=DOWNLOAD_HEADERS, timeout=15, stream=True)
        if resp.status_code == 200:
            with open(local_path, "wb") as f:
                for chunk in resp.iter_content(8192):
                    f.write(chunk)
            logger.info(f"已下载: {filename}")
            return url_path
        else:
            logger.warning(f"下载失败 {resp.status_code}: {url[:80]}")
            return ""
    except Exception as e:
        logger.warning(f"下载异常: {e} — {url[:80]}")
        return ""


def download_url_list(url_str: str) -> str:
    """
    下载逗号分隔的 URL 列表，返回 JSON 字符串（本地路径列表）
    """
    if not url_str:
        return "[]"
    urls = [u.strip() for u in url_str.split(",") if u.strip()]
    local_urls = []
    for u in urls:
        local = download_file(u)
        if local:
            local_urls.append(local)
    return json.dumps(local_urls, ensure_ascii=False)


def download_json_list(json_str) -> str:
    """
    处理已是 JSON 格式的 URL 列表字段，下载后返回本地路径 JSON
    """
    if not json_str:
        return "[]"
    if isinstance(json_str, list):
        urls = json_str
    else:
        try:
            urls = json.loads(json_str)
        except Exception:
            urls = [json_str] if json_str else []

    local_urls = []
    for u in urls:
        if not u:
            continue
        if u.startswith("/static/"):
            local_urls.append(u)  # 已是本地
        else:
            local = download_file(u)
            if local:
                local_urls.append(local)
    return json.dumps(local_urls, ensure_ascii=False)


def translate_ad_type(cn: str) -> str:
    return {"图片": "Image", "视频": "Video", "轮播图": "Slideshow"}.get(cn, cn)


def parse_date(date_str: str):
    try:
        m = re.search(r"(\d{4})年(\d{1,2})月(\d{1,2})日", date_str)
        if m:
            return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except Exception:
        pass
    return None


def save_to_db(ads: list) -> int:
    conn = pymysql.connect(**DB_CONFIG)
    inserted = 0
    try:
        with conn.cursor() as cur:
            for ad in ads:
                try:
                    ad_type = translate_ad_type(ad.get("广告类型", ""))
                    ad_date = parse_date(ad.get("投放日期", ""))

                    # 下载媒体文件到本地
                    store_icon_local = download_url_list(ad.get("店铺头像", ""))
                    img_local = download_url_list(ad.get("广告图片", ""))
                    video_local = download_url_list(ad.get("广告视频", ""))

                    cur.execute(
                        """INSERT INTO fb_advertising_table
                           (store_name, store_icon, advertising_text, advertising_img,
                            advertising_video, advertising_type, fb_url, advertising_time,
                            advertising_platform, is_delete)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                        (
                            ad.get("投放店铺", "未知店铺"),
                            store_icon_local,
                            ad.get("广告文案", ""),
                            img_local,
                            video_local,
                            ad_type,
                            json.dumps([ad.get("广告链接", "")], ensure_ascii=False) if ad.get("广告链接") else "[]",
                            ad_date,
                            ad.get("投放平台", "Facebook"),
                            0,
                        ),
                    )
                    inserted += 1
                except Exception as e:
                    logger.warning(f"单条插入失败: {e}")
            conn.commit()
    finally:
        conn.close()
    return inserted


def parse_html(html_content: str) -> list:
    soup = BeautifulSoup(html_content, "html.parser")
    ads = []

    # 提取投放时间
    delivery_times = []
    time_spans = soup.select(
        "div.x3nfvp2.x1e56ztr > span.x8t9es0.xw23nyj.xo1l8bm.x63nzvj.x108nfp6.xq9mrsl.x1h4wwuj.xeuugli"
    )
    for span in time_spans:
        text = span.get_text(strip=True)
        if re.search(r"\d{4}年\d{1,2}月\d{1,2}日", text):
            delivery_times.append(text)

    if not delivery_times:
        for span in soup.find_all("span", string=re.compile(r"投放")):
            text = span.get_text(strip=True)
            if re.search(r"\d{4}年\d{1,2}月\d{1,2}日", text):
                delivery_times.append(text)

    # 主选择器：div._7jyh（当前页面结构）
    ad_containers = soup.select("div._7jyh")
    if not ad_containers:
        ad_containers = soup.select('div._7jyg._7jyh, div[role="article"]')

    logger.info(f"找到 {len(ad_containers)} 个广告容器")

    for idx, container in enumerate(ad_containers, 1):
        delivery_time = delivery_times[idx - 1] if idx - 1 < len(delivery_times) else "未知"
        try:
            # 店铺头像（img._8nqq），alt 属性即店铺名
            store_avatar = ""
            store_name = "未知店铺"
            av = container.select_one("img._8nqq")
            if av:
                store_avatar = av.get("src", "")
                alt = av.get("alt", "").strip()
                if alt:
                    store_name = alt

            # 备用店铺名：a[target=_blank] 第一个非空 span
            if store_name == "未知店铺":
                for a in container.select("a[target='_blank']"):
                    sp = a.select_one("span")
                    if sp:
                        txt = sp.get_text(strip=True)
                        if txt:
                            store_name = txt
                            break

            # 广告文案
            ad_text = "无文案"
            tc = container.select_one("div[style*='pre-wrap'], div._7jyr")
            if tc:
                ad_text = tc.get_text(" ", strip=True)

            # 广告视频
            video_url = ""
            ve = container.select_one("video")
            if ve:
                video_url = ve.get("src", "")
                if not video_url:
                    src_el = ve.select_one("source")
                    if src_el:
                        video_url = src_el.get("src", "")

            # 广告图片（单图 / 轮播）
            image_urls = []
            # 单图
            si = container.select_one("img.x15mokao")
            if si:
                image_urls = [si.get("src", "")]
            # 轮播
            if not image_urls:
                ci = container.select("img.x15mokao")
                if ci:
                    image_urls = [i.get("src", "") for i in ci if i.get("src")]
            # 视频封面作为缩略图
            if not image_urls and ve:
                poster = ve.get("poster", "")
                if poster:
                    image_urls = [poster]

            ad_type = "视频" if video_url else ("轮播图" if len(image_urls) > 1 else "图片")

            ad_link = ""
            le = container.select_one("a[target='_blank'][href]")
            if le:
                ad_link = le.get("href", "")

            delivery_date = "未知"
            if delivery_time != "未知":
                dm = re.search(r"(\d{4}年\d{1,2}月\d{1,2}日)", delivery_time)
                if dm:
                    delivery_date = dm.group(1)

            ads.append({
                "投放店铺": store_name,
                "店铺头像": store_avatar,
                "广告文案": ad_text,
                "广告图片": ",".join(image_urls),
                "广告视频": video_url,
                "广告类型": ad_type,
                "广告链接": ad_link,
                "投放日期": delivery_date,
                "投放平台": "Facebook",
            })
        except Exception as e:
            logger.error(f"解析第 {idx} 条失败: {e}")

    return ads


def sync_existing_media() -> dict:
    """
    批量下载现有 DB 记录中的远端媒体，更新为本地路径
    返回 {"updated": N, "skipped": M, "error": "..."}
    """
    conn = pymysql.connect(**DB_CONFIG)
    updated = 0
    skipped = 0
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, store_icon, advertising_img, advertising_video "
                "FROM fb_advertising_table WHERE is_delete = 0"
            )
            rows = cur.fetchall()
            logger.info(f"共 {len(rows)} 条记录需要检查")

            for row in rows:
                rid = row["id"]
                icon_new = download_json_list(row["store_icon"])
                img_new = download_json_list(row["advertising_img"])
                vid_new = download_json_list(row["advertising_video"])

                # 判断是否有变化
                if (icon_new == (row["store_icon"] or "[]") and
                        img_new == (row["advertising_img"] or "[]") and
                        vid_new == (row["advertising_video"] or "[]")):
                    skipped += 1
                    continue

                cur.execute(
                    "UPDATE fb_advertising_table SET store_icon=%s, advertising_img=%s, advertising_video=%s WHERE id=%s",
                    (icon_new, img_new, vid_new, rid),
                )
                updated += 1
                if updated % 10 == 0:
                    conn.commit()
                    logger.info(f"已更新 {updated} 条")

            conn.commit()
            logger.info(f"同步完成: 更新 {updated} 条，跳过 {skipped} 条")
    except Exception as e:
        logger.error(f"批量同步出错: {e}")
        return {"updated": updated, "skipped": skipped, "error": str(e)}
    finally:
        conn.close()
    return {"updated": updated, "skipped": skipped, "error": None}


def run_spider(target_url: str, max_scrolls: int = 20, cookies_path: str = None, headless: bool = True) -> dict:
    """
    运行爬虫，返回 {"inserted": N, "parsed": M, "error": "..."}
    """
    cookies_path = cookies_path or COOKIES_PATH
    result = {"inserted": 0, "parsed": 0, "error": None}

    with sync_playwright() as p:
        browser = p.webkit.launch(headless=headless)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15",
            viewport={"width": 1366, "height": 768},
        )
        page = context.new_page()
        try:
            if not os.path.exists(cookies_path):
                result["error"] = f"未找到 cookies 文件: {cookies_path}"
                return result

            # 先访问页面，再注入 cookies，再 reload（与旧爬虫保持一致）
            logger.info(f"访问: {target_url}")
            page.goto(target_url, wait_until="domcontentloaded", timeout=90000)
            time.sleep(2)

            with open(cookies_path, "r", encoding="utf-8") as f:
                cookies = json.load(f)
            context.add_cookies(cookies)
            logger.info(f"已注入 {len(cookies)} 条 cookies，重新加载页面")
            page.reload(wait_until="domcontentloaded", timeout=90000)
            time.sleep(3)

            # 等待广告容器出现（新结构用 div._7jyh）
            try:
                page.wait_for_selector('div._7jyh', timeout=30000)
                logger.info("广告容器已出现")
            except Exception:
                # 备用：等待 role=article
                try:
                    page.wait_for_selector('div[role="article"]', timeout=10000)
                    logger.info("广告容器(article)已出现")
                except Exception:
                    logger.warning("等待广告容器超时，继续执行")

            time.sleep(2)

            # 滚动加载
            last_height = page.evaluate("document.body.scrollHeight")
            last_ad_count = len(page.query_selector_all('div._7jyh'))
            no_change = 0
            for i in range(max_scrolls):
                page.evaluate(f"window.scrollTo(0, document.body.scrollHeight + {random.randint(-100, 50)})")
                # 等待新广告加载（比之前更长）
                time.sleep(random.uniform(3.5, 5.5))

                new_height = page.evaluate("document.body.scrollHeight")
                new_ad_count = len(page.query_selector_all('div._7jyh'))

                if abs(new_height - last_height) < 50 and new_ad_count == last_ad_count:
                    no_change += 1
                    if no_change >= 3:
                        logger.info("页面不再增长，停止滚动")
                        break
                else:
                    no_change = 0
                last_height = new_height
                last_ad_count = new_ad_count
                logger.info(f"第 {i+1} 次滚动，页面高度 {new_height}，广告数 {new_ad_count}")

            html = page.content()
            ads = parse_html(html)
            result["parsed"] = len(ads)

            if ads:
                result["inserted"] = save_to_db(ads)
                logger.info(f"✅ 解析 {len(ads)} 条，写入 DB {result['inserted']} 条（媒体已本地化）")
            else:
                result["error"] = "未解析到广告数据，可能 cookies 失效或页面结构变化"

        except Exception as e:
            result["error"] = str(e)
            logger.error(f"爬虫出错: {e}")
        finally:
            browser.close()

    return result


if __name__ == "__main__":
    url = "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&is_targeted_country=false&media_type=all&q=embroidery&search_type=keyword_unordered"
    print(run_spider(url, max_scrolls=15, headless=False))
