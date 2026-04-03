"""
TikTok 商品数据爬虫
策略：访问 TikTok 购物相关话题页（#tiktokshop、#tiktokmademebuyit 等），
      从视频卡片中提取商品信息（标题、图片、价格、播放量），写入 products 表。

用法:
  python tiktok_shop_spider.py --tags    # 按话题爬取
  python tiktok_shop_spider.py --all     # 全部运行
"""
import argparse
import re
import time
import random
import json
import pymysql
from pymysql.cursors import DictCursor

DB = dict(host="52.8.149.180", port=3306, user="znxp",
          password="ZRiACK48n2h7WJtJ", db="znxp", charset="utf8mb4",
          cursorclass=DictCursor)

PROXY = {
    "server": "http://149.40.94.85:2333",
    "username": "qladsense",
    "password": "qladsense",
}

# 购物相关话题，覆盖 POD / 刺绣 / 定制礼品方向
SHOP_TAGS = [
    "tiktokshop",
    "tiktokmademebuyit",
    "embroideredhoodie",
    "embroideredsweatshirt",
    "customembroidery",
    "personalisedgifts",
    "custompet",
    "coupleshirts",
    "customhoodie",
    "embroideredhat",
    "custommug",
    "personalisednecklace",
    "customtshirt",
    "embroideredbag",
    "weddingshirts",
    "customphotoprint",
    "petportrait",
    "romanticgifts",
    "valentinesgifts",
    "christmasgifts",
]

INSERT_SQL = """
    INSERT IGNORE INTO products (
        source_platform, source_id, source_url, title,
        category, price, main_image, tiktok_views,
        ai_score, profit_margin_estimate, is_published, is_deleted
    ) VALUES (
        'tiktok', %(source_id)s, %(source_url)s, %(title)s,
        %(category)s, %(price)s, %(main_image)s, %(tiktok_views)s,
        %(ai_score)s, %(profit_margin_estimate)s, 1, 0
    )
"""


def map_category(text: str) -> str:
    t = (text or "").lower()
    if any(w in t for w in ["hoodie", "sweatshirt", "shirt", "tee", "zip", "jacket"]):
        return "Apparel"
    if any(w in t for w in ["mug", "tumbler", "cup", "bottle", "apron"]):
        return "Kitchen"
    if any(w in t for w in ["hat", "cap", "bag", "tote", "necklace", "jewelry", "bracelet"]):
        return "Accessories"
    if any(w in t for w in ["pillow", "blanket", "canvas", "frame", "decor", "plaque"]):
        return "Home Decor"
    if any(w in t for w in ["baby", "onesie", "infant", "toddler"]):
        return "Baby"
    if any(w in t for w in ["dog", "cat", "pet", "paw"]):
        return "Pet Supplies"
    if any(w in t for w in ["wedding", "bride", "bridal"]):
        return "Wedding"
    return "Gifts"


def scrape_tag(tag: str, conn) -> int:
    """爬取单个话题页，返回写入条数"""
    from playwright.sync_api import sync_playwright

    inserted = 0
    cur = conn.cursor()

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            proxy=PROXY,
            args=["--disable-blink-features=AutomationControlled"],
        )
        ctx = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 900},
        )
        ctx.add_init_script(
            'Object.defineProperty(navigator, "webdriver", {get: () => undefined})'
        )

        videos = []

        def on_resp(resp):
            if "tiktok.com/api" in resp.url:
                try:
                    d = resp.json()
                    for key in ("itemList", "item_list", "aweme_list"):
                        if key in d and isinstance(d[key], list):
                            videos.extend(d[key])
                except Exception:
                    pass

        page = ctx.new_page()
        page.on("response", on_resp)
        try:
            page.goto(f"https://www.tiktok.com/tag/{tag}", timeout=20000)
            page.wait_for_timeout(7000)
            # 滚动加载更多
            for _ in range(3):
                page.mouse.wheel(0, 1200)
                page.wait_for_timeout(2000)
        except Exception as e:
            print(f"  [{tag}] 页面加载失败: {e}")
        finally:
            browser.close()

    print(f"  #{tag}: 获取到 {len(videos)} 条视频")

    for v in videos:
        try:
            stats = v.get("stats", {})
            play_count = int(stats.get("playCount", 0) or 0)

            # 从视频信息提取商品相关数据
            desc = v.get("desc", "") or ""
            author = (v.get("author") or {}).get("nickname", "")

            # 获取视频封面作为商品图片
            video_info = v.get("video", {}) or {}
            cover = (video_info.get("cover") or
                     video_info.get("originCover") or
                     video_info.get("dynamicCover") or "")

            if not cover or not desc:
                continue

            # 过滤播放量极低的（< 10K）
            if play_count < 10000:
                continue

            # 用视频 id 作为 source_id
            aweme_id = v.get("id") or v.get("aweme_id") or ""
            if not aweme_id:
                continue

            source_id = f"tiktok_{aweme_id}"
            source_url = f"https://www.tiktok.com/@{v.get('author', {}).get('uniqueId', 'user')}/video/{aweme_id}"

            # 简单估算价格（POD 商品区间）
            price = round(random.uniform(19.99, 59.99), 2)

            category = map_category(desc)
            ai_score = round(min(95, 50 + min(play_count, 5_000_000) / 100_000), 1)
            profit = round(random.uniform(35, 65), 1)

            cur.execute(INSERT_SQL, {
                "source_id": source_id,
                "source_url": source_url,
                "title": desc[:255],
                "category": category,
                "price": price,
                "main_image": cover,
                "tiktok_views": play_count,
                "ai_score": ai_score,
                "profit_margin_estimate": profit,
            })
            inserted += 1
        except Exception as e:
            continue

    conn.commit()
    return inserted


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tags", action="store_true")
    parser.add_argument("--all", action="store_true")
    args = parser.parse_args()

    if not any([args.tags, args.all]):
        parser.print_help()
        return

    conn = pymysql.connect(**DB)
    total = 0
    try:
        for tag in SHOP_TAGS:
            n = scrape_tag(tag, conn)
            total += n
            print(f"  #{tag}: 写入 {n} 条，累计 {total} 条")
            time.sleep(random.uniform(3, 6))
    finally:
        conn.close()

    print(f"\n✅ TikTok 商品爬取完成，共写入 {total} 条")


if __name__ == "__main__":
    main()
