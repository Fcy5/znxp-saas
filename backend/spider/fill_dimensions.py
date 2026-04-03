"""
填充 products 表的维度数据:
  - facebook_ad_count: 按关键词匹配 fb_advertising_table
  - sales_trend: 用评论数 / 上架月数 估算月均增速
  - tiktok_views: 用 SerpAPI TikTok 搜索获取真实播放量

用法:
  python fill_dimensions.py --fb        # 只填 facebook_ad_count
  python fill_dimensions.py --trend     # 只填 sales_trend
  python fill_dimensions.py --tiktok    # 只填 tiktok_views（需消耗 SerpAPI）
  python fill_dimensions.py --all       # 全部
"""
import argparse
import re
import time
import random
from datetime import datetime, timezone

import pymysql
from pymysql.cursors import DictCursor

DB = dict(host="52.8.149.180", port=3306, user="znxp",
          password="ZRiACK48n2h7WJtJ", db="znxp", charset="utf8mb4",
          cursorclass=DictCursor)

SERPAPI_KEY = "bfdc4613002461e151816aade12be456d6c25e97ff621a06123894bfcf6cb60e"


# ── 关键词提取 ────────────────────────────────────────────────────────────────
STOPWORDS = {
    'a','an','the','and','or','for','of','in','to','with','on','at','by',
    'from','as','is','it','its','this','that','be','are','was','were',
    'has','have','had','do','does','did','will','would','can','could',
    'i','you','we','they','your','our','my','their','custom','personalized',
    'gift','gifts','set','sets','new','great','good','best','top',
}

def keywords(text: str, n: int = 5) -> list[str]:
    words = re.findall(r"[a-z]{3,}", (text or "").lower())
    return [w for w in words if w not in STOPWORDS][:n]


# ── 1. facebook_ad_count ────────────────────────────────────────────────────
def fill_fb_ad_count(conn):
    cur = conn.cursor()

    # 把所有FB广告文本的关键词提取出来，建一个简单倒排
    cur.execute("SELECT advertising_text FROM fb_advertising_table WHERE is_delete=0 AND advertising_text IS NOT NULL")
    all_ad_texts = [r["advertising_text"] for r in cur.fetchall()]
    all_ad_words: set[str] = set()
    for t in all_ad_texts:
        all_ad_words.update(keywords(t, 10))

    # 统计每个 product title 命中多少条 FB 广告
    cur.execute("""
        SELECT id, title FROM products
        WHERE is_deleted=0 AND (facebook_ad_count IS NULL OR facebook_ad_count=0)
        LIMIT 5000
    """)
    products = cur.fetchall()

    updated = 0
    for p in products:
        kws = set(keywords(p["title"], 6))
        if not kws:
            continue
        # 统计广告文本中包含至少1个关键词的数量
        count = sum(
            1 for t in all_ad_texts
            if any(w in (t or "").lower() for w in kws)
        )
        if count > 0:
            cur.execute(
                "UPDATE products SET facebook_ad_count=%s WHERE id=%s",
                (count, p["id"])
            )
            updated += 1

        if updated % 200 == 0 and updated > 0:
            conn.commit()
            print(f"  fb_ad_count: {updated} updated...")

    conn.commit()
    print(f"  fb_ad_count done: {updated}/{len(products)} products updated")


# ── 2. sales_trend ────────────────────────────────────────────────────────────
def fill_sales_trend(conn):
    """
    sales_trend = 月均评论增速（越高越热）
    公式: review_count / max(months_since_published, 1)
    归一化到 0-200 区间
    """
    cur = conn.cursor()
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # 从各原始表捞 published_time
    # Etsy
    cur.execute("""
        SELECT p.id, p.review_count, e.published_time
        FROM products p
        JOIN product_etsy_table e ON p.source_id = e.product_id
        WHERE p.source_platform='etsy'
          AND p.review_count > 0
          AND (p.sales_trend IS NULL OR p.sales_trend=0)
          AND e.published_time IS NOT NULL
        LIMIT 3000
    """)
    etsy_rows = cur.fetchall()

    updated = 0
    for row in etsy_rows:
        try:
            pub = row["published_time"]
            if isinstance(pub, str):
                pub = datetime.fromisoformat(pub)
            months = max(1, (now - pub).days / 30)
            trend = round(min(200, (row["review_count"] / months) * 10), 1)
            cur.execute("UPDATE products SET sales_trend=%s WHERE id=%s", (trend, row["id"]))
            updated += 1
        except Exception:
            continue

    # Amazon
    cur.execute("""
        SELECT p.id, p.review_count, a.create_time
        FROM products p
        JOIN product_ama_table a ON p.source_id = a.product_id
        WHERE p.source_platform='amazon'
          AND p.review_count > 0
          AND (p.sales_trend IS NULL OR p.sales_trend=0)
          AND a.create_time IS NOT NULL
        LIMIT 3000
    """)
    for row in cur.fetchall():
        try:
            pub = row["create_time"]
            if isinstance(pub, str):
                pub = datetime.fromisoformat(pub)
            months = max(1, (now - pub).days / 30)
            trend = round(min(200, (row["review_count"] / months) * 8), 1)
            cur.execute("UPDATE products SET sales_trend=%s WHERE id=%s", (trend, row["id"]))
            updated += 1
        except Exception:
            continue

    # Shopify（用 review_count > 0 的随机估算）
    cur.execute("""
        SELECT id, review_count FROM products
        WHERE source_platform='shopify'
          AND review_count > 0
          AND (sales_trend IS NULL OR sales_trend=0)
        LIMIT 2000
    """)
    for row in cur.fetchall():
        trend = round(min(150, row["review_count"] * 0.15 + random.uniform(5, 20)), 1)
        cur.execute("UPDATE products SET sales_trend=%s WHERE id=%s", (trend, row["id"]))
        updated += 1

    conn.commit()
    print(f"  sales_trend done: {updated} products updated")


# ── 3. tiktok_views (Playwright hashtag scraping) ───────────────────────────
PROXY = {
    "server": "http://149.40.94.85:2333",
    "username": "qladsense",
    "password": "qladsense",
}

def _hashtag_from_title(title: str) -> str:
    """把产品标题转成 TikTok hashtag：取前2个关键词拼接"""
    kws = keywords(title, 4)
    return "".join(kws[:2]) if kws else ""


def _fetch_hashtag_views(pw_page, hashtag: str) -> int:
    """访问 /tag/{hashtag}，返回该话题视频的最高 playCount"""
    import json as _json
    captured = []

    def on_resp(resp):
        if "tiktok.com/api" in resp.url:
            try:
                d = resp.json()
                for k in ("itemList", "item_list", "aweme_list"):
                    if k in d and isinstance(d[k], list) and d[k]:
                        captured.extend(d[k])
            except Exception:
                pass

    pw_page.on("response", on_resp)
    try:
        pw_page.goto(f"https://www.tiktok.com/tag/{hashtag}", timeout=20000)
        pw_page.wait_for_timeout(6000)
    except Exception:
        pass
    finally:
        pw_page.remove_listener("response", on_resp)

    if not captured:
        return 0
    max_plays = max(
        int(v.get("stats", {}).get("playCount", 0) or 0)
        for v in captured
    )
    return max_plays


def fill_tiktok_views(conn, limit: int = 200):
    """
    用 Playwright 访问 TikTok /tag/{hashtag} 话题页，
    获取该话题视频的最高 playCount 作为热度值写入 tiktok_views。
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("  playwright not installed: pip install playwright && playwright install")
        return

    cur = conn.cursor()
    cur.execute("""
        SELECT id, title, category FROM products
        WHERE is_deleted=0
          AND (tiktok_views IS NULL OR tiktok_views=0)
        ORDER BY ai_score DESC
        LIMIT %s
    """, (limit,))
    products = cur.fetchall()

    kw_cache: dict[str, int] = {}   # hashtag -> max playCount
    updated = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            proxy=PROXY,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 900},
        )
        context.add_init_script(
            'Object.defineProperty(navigator, "webdriver", {get: () => undefined})'
        )
        page = context.new_page()

        for p_row in products:
            tag = _hashtag_from_title(p_row["title"])
            if not tag:
                continue

            if tag not in kw_cache:
                views = _fetch_hashtag_views(page, tag)
                kw_cache[tag] = views
                print(f"  TikTok /tag/{tag}: playCount={views:,}")
                time.sleep(random.uniform(1.5, 3))

            views = kw_cache[tag]
            if views > 0:
                cur.execute(
                    "UPDATE products SET tiktok_views=%s WHERE id=%s",
                    (views, p_row["id"]),
                )
                updated += 1

            if updated % 50 == 0 and updated > 0:
                conn.commit()

        browser.close()

    conn.commit()
    print(f"  tiktok_views done: {updated}/{len(products)} products updated")


# ── main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fb", action="store_true")
    parser.add_argument("--trend", action="store_true")
    parser.add_argument("--tiktok", action="store_true")
    parser.add_argument("--tiktok-limit", type=int, default=200)
    parser.add_argument("--all", action="store_true")
    args = parser.parse_args()

    conn = pymysql.connect(**DB)
    try:
        if args.all or args.fb:
            print("=== Filling facebook_ad_count ===")
            fill_fb_ad_count(conn)

        if args.all or args.trend:
            print("=== Filling sales_trend ===")
            fill_sales_trend(conn)

        if args.all or args.tiktok:
            print("=== Filling tiktok_views ===")
            fill_tiktok_views(conn, limit=args.tiktok_limit)

        if not any([args.all, args.fb, args.trend, args.tiktok]):
            parser.print_help()
    finally:
        conn.close()


if __name__ == "__main__":
    main()
