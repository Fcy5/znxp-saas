"""
把 google_gcm_table 里的数据同步进主 products 表
- source_platform = "google"
- 去重：source_url 已存在则跳过
- 自动设置 category（根据 product_type 关键词映射）
用法：
  python google_sync_products.py           # 同步全部未同步数据
  python google_sync_products.py --limit 500
"""
import argparse
import sys
import os

# 兼容从 spider/ 目录或 backend/ 目录运行
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pymysql
import hashlib
import re

DB = dict(
    host="52.8.149.180", port=3306,
    user="znxp", password="ZRiACK48n2h7WJtJ",
    db="znxp", charset="utf8mb4",
)

# product_type（关键词）→ category 映射
CATEGORY_MAP = [
    (["embroidered", "embroidery"],        "Embroidery"),
    (["pet portrait", "cat", "dog"],       "Pet Gifts"),
    (["wedding", "bride", "bachelorette"], "Wedding"),
    (["baby", "toddler", "kids"],          "Baby & Kids"),
    (["blanket", "pillow", "canvas"],      "Home Decor"),
    (["necklace", "bracelet", "jewelry"],  "Jewelry"),
    (["mug", "tumbler", "coffee"],         "Drinkware"),
    (["apron", "kitchen"],                 "Kitchen"),
    (["hat", "cap", "beanie"],             "Hats"),
    (["hoodie", "sweatshirt", "shirt"],    "Apparel"),
    (["christmas", "holiday", "ornament"], "Holiday"),
    (["memorial", "anniversary", "gift"],  "Gifts"),
]


def map_category(product_type: str) -> str:
    pt = product_type.lower()
    for keywords, cat in CATEGORY_MAP:
        if any(kw in pt for kw in keywords):
            return cat
    return "Other"


def make_source_id(url: str) -> str:
    return "g_" + hashlib.md5(url.encode()).hexdigest()[:16]


def sync(limit: int = 0):
    conn = pymysql.connect(**DB)
    cur = conn.cursor(pymysql.cursors.DictCursor)

    # 查 google_gcm_table 未删除数据
    sql = """
        SELECT g.id, g.url, g.title, g.price, g.rating, g.reviews_count,
               g.thumbnail, g.product_type, g.merchant_name
        FROM google_gcm_table g
        WHERE g.is_delete = 0
          AND g.thumbnail IS NOT NULL AND g.thumbnail != ''
          AND g.title IS NOT NULL AND g.title != ''
    """
    if limit > 0:
        sql += f" LIMIT {limit}"

    cur.execute(sql)
    rows = cur.fetchall()
    print(f"google_gcm_table 待同步: {len(rows)} 条")

    inserted = skipped = 0
    for row in rows:
        url = (row["url"] or "").strip()
        if not url:
            skipped += 1
            continue

        # 检查 products 表是否已有此 url
        cur.execute("SELECT id FROM products WHERE source_url=%s LIMIT 1", (url[:1000],))
        if cur.fetchone():
            skipped += 1
            continue

        title = (row["title"] or "")[:500]
        price = row.get("price")
        rating = row.get("rating")
        reviews = row.get("reviews_count")
        thumbnail = (row.get("thumbnail") or "")[:1000]
        product_type = row.get("product_type") or ""
        brand = (row.get("merchant_name") or "")[:255]
        category = map_category(product_type)
        source_id = make_source_id(url)

        # 简单的 ai_score 估算
        ai_score = 50.0
        if rating and float(rating) >= 4.5:
            ai_score += 15
        if reviews and int(reviews) > 100:
            ai_score += 10
        if any(kw in title.lower() for kw in ["custom", "personalized", "embroidered"]):
            ai_score += 10

        try:
            cur.execute("""
                INSERT INTO products
                    (source_platform, source_id, source_url, title, category, brand,
                     price, currency, main_image,
                     review_score, review_count, ai_score,
                     is_published, is_deleted, created_at, updated_at)
                VALUES
                    ('google', %s, %s, %s, %s, %s,
                     %s, 'USD', %s,
                     %s, %s, %s,
                     0, 0, NOW(), NOW())
            """, (
                source_id, url[:1000], title, category, brand,
                price, thumbnail,
                rating, reviews, ai_score,
            ))
            inserted += 1
        except Exception as e:
            print(f"  写入失败 [{title[:40]}]: {e}")

        if inserted % 100 == 0 and inserted > 0:
            conn.commit()
            print(f"  已写入 {inserted} 条...")

    conn.commit()
    conn.close()
    print(f"\n同步完成: 新增 {inserted} | 跳过(重复/无效) {skipped}")
    return inserted


def main():
    parser = argparse.ArgumentParser(description="同步 Google Shopping 数据到 products 表")
    parser.add_argument("--limit", type=int, default=0, help="最多同步条数 (0=全部)")
    args = parser.parse_args()
    sync(args.limit)


if __name__ == "__main__":
    main()
