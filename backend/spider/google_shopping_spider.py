"""
Google Shopping 多关键词爬取脚本
使用 SerpAPI 搜索 Google Shopping，结果存入 google_gcm_table
用法: python google_shopping_spider.py [--keyword "custom embroidered hat"] [--all]
"""
import argparse
import random
import time
import hashlib

import pymysql
from serpapi import GoogleSearch

# ── SerpAPI Key ───────────────────────────────────────────────────────────────
SERPAPI_KEY = "bfdc4613002461e151816aade12be456d6c25e97ff621a06123894bfcf6cb60e"

# ── DB ────────────────────────────────────────────────────────────────────────
DB = dict(host="52.8.149.180", port=3306, user="znxp",
          password="ZRiACK48n2h7WJtJ", db="znxp", charset="utf8mb4")

# ── 关键词列表 ─────────────────────────────────────────────────────────────────
KEYWORDS = [
    # 已有数据的关键词（跳过可节省 API 额度）
    "embroidered photo sweatshirt",
    "embroidered photo hoodie",
    "embroidered photo gifts",
    # 新增关键词
    "custom embroidered hat",
    "custom embroidered cap",
    "personalized embroidered beanie",
    "custom embroidered tote bag",
    "embroidered pet portrait hoodie",
    "custom cat embroidered sweatshirt",
    "custom dog embroidered hoodie",
    "personalized embroidered baby gift",
    "custom embroidered couple hoodie",
    "custom embroidered name sweatshirt",
    "personalized embroidered jacket",
    "custom embroidery gifts",
    "embroidered wedding gifts",
    "custom embroidered apron",
    "embroidered blanket personalized",
    "custom embroidered pillow",
    "custom name embroidered shirt",
    # 扩充关键词 — 礼品 & 定制
    "personalized gift for couple",
    "custom photo gift",
    "personalized christmas ornament",
    "custom memorial gift",
    "personalized family gift",
    "custom birthday gift",
    "personalized anniversary gift",
    # 扩充关键词 — 宠物
    "custom dog portrait gift",
    "personalized pet memorial",
    "cat lover gift custom",
    # 扩充关键词 — 婚礼
    "personalized wedding gift",
    "bride gift custom",
    "custom wedding shirt",
    "bachelorette party shirt",
    # 扩充关键词 — 家居
    "custom photo blanket",
    "personalized canvas print",
    "custom family portrait print",
    "custom home decor gift",
    # 扩充关键词 — 厨房
    "custom embroidered kitchen apron",
    "personalized coffee mug",
    "custom tumbler gift",
    # 扩充关键词 — 儿童 & 婴儿
    "custom baby gift personalized",
    "personalized kids shirt",
    "custom toddler hoodie",
    # 扩充关键词 — 珠宝 & 配饰
    "custom name necklace personalized",
    "personalized bracelet gift",
    "custom engraved jewelry",
]


def short_hash(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()[:12]


def fetch_shopping_results(keyword: str, max_results: int = 100) -> list[dict]:
    """用 SerpAPI 搜索 Google Shopping"""
    params = {
        "engine": "google_shopping",
        "q": keyword,
        "location": "United States",
        "hl": "en",
        "gl": "us",
        "api_key": SERPAPI_KEY,
    }
    all_results = []
    start = 0
    while len(all_results) < max_results:
        params["start"] = start
        try:
            search = GoogleSearch(params)
            data = search.get_dict()
            batch = data.get("shopping_results", [])
            if not batch:
                break
            all_results.extend(batch)
            print(f"  page start={start}: {len(batch)} 条，累计 {len(all_results)}")
            if len(batch) < 10:
                break
            start += len(batch)
            time.sleep(random.uniform(1, 2))
        except Exception as e:
            print(f"  SerpAPI 错误: {e}")
            break
    return all_results[:max_results]


def save_to_db(conn, keyword: str, results: list[dict]) -> tuple[int, int]:
    """保存到 google_gcm_table，已存在按 url 跳过"""
    cur = conn.cursor()
    inserted = skipped = 0

    for item in results:
        url = item.get("link") or item.get("product_link") or ""
        title = (item.get("title") or "")[:250]
        if not url or not title:
            skipped += 1
            continue

        # 去重：url 已存在则跳过
        cur.execute("SELECT id FROM google_gcm_table WHERE url=%s LIMIT 1", (url,))
        if cur.fetchone():
            skipped += 1
            continue

        price_raw = item.get("price", "") or ""
        try:
            price = float(price_raw.replace("$", "").replace(",", "").strip().split()[0])
        except Exception:
            price = None

        rating = item.get("rating")
        reviews_count = item.get("reviews")
        merchant = item.get("source") or item.get("merchant", {})
        if isinstance(merchant, dict):
            merchant_name = merchant.get("name", "")
            merchant_url = merchant.get("link", "")
        else:
            merchant_name = str(merchant)[:250]
            merchant_url = ""

        thumbnail = item.get("thumbnail") or ""
        if not thumbnail or thumbnail.startswith("data:"):
            skipped += 1
            continue
        product_type = keyword  # 用关键词作为 product_type

        try:
            cur.execute("""
                INSERT INTO google_gcm_table
                    (url, price, title, rating, merchant_url, merchant_name,
                     delivery, thumbnail, reviews_count, is_delete, product_type)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, (url[:3000], price, title, rating, merchant_url[:1000],
                  merchant_name[:250], "", thumbnail[:1000],
                  reviews_count, 0, product_type[:255]))
            inserted += 1
        except Exception as e:
            print(f"  写入失败 [{title[:40]}]: {e}")

        if inserted % 50 == 0 and inserted > 0:
            conn.commit()

    conn.commit()
    return inserted, skipped


def run_keyword(keyword: str):
    print(f"\n{'='*55}")
    print(f"关键词: {keyword}")
    print(f"{'='*55}")
    results = fetch_shopping_results(keyword)
    if not results:
        print("  无结果")
        return
    conn = pymysql.connect(**DB)
    try:
        ins, skip = save_to_db(conn, keyword, results)
        print(f"  完成: 新增 {ins} | 跳过(重复) {skip}")
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="Google Shopping 多关键词爬取")
    parser.add_argument("--keyword", help="单个关键词")
    parser.add_argument("--all", action="store_true", help="跑所有预设关键词")
    parser.add_argument("--list", action="store_true", help="列出所有关键词")
    args = parser.parse_args()

    if args.list:
        for i, kw in enumerate(KEYWORDS, 1):
            print(f"  {i:2}. {kw}")
        return

    if args.all:
        for kw in KEYWORDS:
            run_keyword(kw)
            time.sleep(random.uniform(2, 4))
    elif args.keyword:
        run_keyword(args.keyword)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
