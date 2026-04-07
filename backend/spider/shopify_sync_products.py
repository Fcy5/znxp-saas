"""
把 product_table 里的 Shopify 竞品数据同步进主 products 表
- source_platform = "shopify"
- 去重：source_url 已存在则跳过
- 自动映射 category（根据 product_type 关键词）
用法：
  python shopify_sync_products.py              # 同步全部
  python shopify_sync_products.py --limit 500
  python shopify_sync_products.py --channel couplehoodies
"""
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pymysql

DB = dict(
    host="52.8.149.180", port=3306,
    user="znxp", password="ZRiACK48n2h7WJtJ",
    db="znxp", charset="utf8mb4",
)

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


def map_category(product_type: str, tags: str = "") -> str:
    text = (product_type + " " + tags).lower()
    for keywords, cat in CATEGORY_MAP:
        if any(kw in text for kw in keywords):
            return cat
    return "Other"


def extract_price(variants_json: str | None) -> float | None:
    if not variants_json:
        return None
    try:
        variants = json.loads(variants_json)
        if variants and isinstance(variants, list):
            price = variants[0].get("price")
            if price:
                return float(price)
    except Exception:
        pass
    return None


def extract_main_image(image_json: str | None, images_json: str | None) -> str | None:
    # 优先用 image 字段（主图）
    if image_json:
        try:
            img = json.loads(image_json)
            if img and img.get("src"):
                return img["src"][:1000]
        except Exception:
            pass
    # 回退到 images 列表第一张
    if images_json:
        try:
            imgs = json.loads(images_json)
            if imgs and isinstance(imgs, list) and imgs[0].get("src"):
                return imgs[0]["src"][:1000]
        except Exception:
            pass
    return None


def sync(limit: int = 0, channel: str | None = None):
    conn = pymysql.connect(**DB)
    cur = conn.cursor(pymysql.cursors.DictCursor)

    sql = """
        SELECT product_id, title, body_html, product_type, tags,
               variants, image, images, vendor, channel, product_url
        FROM product_table
        WHERE is_delete = 0
          AND title IS NOT NULL AND title != ''
          AND product_url IS NOT NULL AND product_url != ''
    """
    params = []
    if channel:
        sql += " AND channel = %s"
        params.append(channel)
    if limit > 0:
        sql += f" LIMIT {limit}"

    cur.execute(sql, params)
    rows = cur.fetchall()
    print(f"product_table 待同步: {len(rows)} 条" + (f"（{channel}）" if channel else ""))

    inserted = skipped = 0
    for row in rows:
        url = (row["product_url"] or "").strip()
        if not url:
            skipped += 1
            continue

        # 去重
        cur.execute("SELECT id FROM products WHERE source_url=%s LIMIT 1", (url[:1000],))
        if cur.fetchone():
            skipped += 1
            continue

        title = (row["title"] or "")[:500]
        brand = (row["vendor"] or row["channel"] or "")[:255]
        product_type = row.get("product_type") or ""
        tags = row.get("tags") or ""
        category = map_category(product_type, tags)
        price = extract_price(row.get("variants"))
        main_image = extract_main_image(row.get("image"), row.get("images"))
        description = row.get("body_html") or ""
        source_id = (row["product_id"] or "")[:255]

        ai_score = 50.0
        if any(kw in title.lower() for kw in ["custom", "personalized", "embroidered"]):
            ai_score += 10
        if price and price > 30:
            ai_score += 5

        try:
            cur.execute("""
                INSERT INTO products
                    (source_platform, source_id, source_url, title, description,
                     category, brand, price, currency, main_image,
                     ai_score, is_published, is_deleted, created_at, updated_at)
                VALUES
                    ('shopify', %s, %s, %s, %s,
                     %s, %s, %s, 'USD', %s,
                     %s, 0, 0, NOW(), NOW())
            """, (
                source_id, url[:1000], title, description,
                category, brand, price, main_image,
                ai_score,
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
    parser = argparse.ArgumentParser(description="同步 Shopify 竞品数据到 products 表")
    parser.add_argument("--limit", type=int, default=0, help="最多同步条数 (0=全部)")
    parser.add_argument("--channel", help="指定店铺，如 couplehoodies")
    args = parser.parse_args()
    sync(args.limit, args.channel)


if __name__ == "__main__":
    main()
