"""
把 product_etsy_table / product_ama_table / fb_advertising_table
同步到主 products 表。

用法:
  python sync_all_products.py           # 同步全部
  python sync_all_products.py --source etsy
  python sync_all_products.py --source amazon
  python sync_all_products.py --source facebook
  python sync_all_products.py --source google
"""
import argparse
import hashlib
import json
import pymysql
import pymysql.cursors

DB = dict(
    host="52.8.149.180", port=3306,
    user="znxp", password="ZRiACK48n2h7WJtJ",
    db="znxp", charset="utf8mb4",
    cursorclass=pymysql.cursors.DictCursor,
)

CATEGORY_MAP = [
    (["embroidered", "embroidery"],         "Embroidery"),
    (["pet portrait", "pet photo", "dog portrait", "cat portrait", "pet face"], "Pet Gifts"),
    (["wedding", "bride", "bachelorette"],  "Wedding"),
    (["baby", "toddler", "kids"],           "Baby & Kids"),
    (["blanket", "pillow", "canvas"],       "Home Decor"),
    (["necklace", "bracelet", "jewelry", "ring", "earring"], "Jewelry"),
    (["mug", "tumbler", "coffee", "cup"],   "Drinkware"),
    (["hat", "cap", "beanie"],              "Hats"),
    (["hoodie", "sweatshirt", "shirt", "tee", "apparel"], "Apparel"),
    (["christmas", "holiday", "ornament"],  "Holiday"),
    (["memorial", "anniversary", "gift"],   "Gifts"),
    (["bag", "tote", "backpack", "purse"],  "Bags"),
]


def map_category(text: str) -> str:
    t = text.lower()
    for keywords, cat in CATEGORY_MAP:
        if any(kw in t for kw in keywords):
            return cat
    return "Other"


def make_source_id(prefix: str, uid: str) -> str:
    return prefix + hashlib.md5(uid.encode()).hexdigest()[:16]


def url_exists(cur, url: str) -> bool:
    cur.execute("SELECT id FROM products WHERE source_url=%s LIMIT 1", (url[:1000],))
    return cur.fetchone() is not None


def source_id_exists(cur, sid: str) -> bool:
    cur.execute("SELECT id FROM products WHERE source_id=%s LIMIT 1", (sid,))
    return cur.fetchone() is not None


# ─── Etsy ────────────────────────────────────────────────────────────────────

def sync_etsy(conn):
    cur = conn.cursor()
    cur.execute("""
        SELECT id, title, product_type, tags, vendor, images, variants,
               product_url, number_ratings_num
        FROM product_etsy_table
        WHERE is_delete=0
          AND images IS NOT NULL AND images != '[]'
          AND title IS NOT NULL AND title != ''
    """)
    rows = cur.fetchall()
    print(f"Etsy 待同步: {len(rows)} 条")

    inserted = skipped = 0
    for row in rows:
        url = (row["product_url"] or "").strip()[:1000]
        source_id = make_source_id("etsy_", str(row["id"]))

        if url and url_exists(cur, url):
            skipped += 1
            continue
        if source_id_exists(cur, source_id):
            skipped += 1
            continue

        title = (row["title"] or "")[:500]
        vendor = (row["vendor"] or "")[:255]
        product_type = row.get("product_type") or ""
        tags = row.get("tags") or ""
        category = map_category(title + " " + product_type + " " + tags)

        # 取第一张图
        try:
            imgs = json.loads(row["images"]) if row["images"] else []
            main_image = imgs[0].get("src", "") if imgs else ""
        except Exception:
            main_image = ""
        if not main_image:
            skipped += 1
            continue

        # 取最低价
        price = None
        try:
            variants = json.loads(row["variants"]) if row["variants"] else []
            prices = [float(v["price"]) for v in variants if v.get("price")]
            if prices:
                price = min(prices)
                # Etsy HK 价格约为 USD 的 7.8 倍，简单转换
                if price > 200:
                    price = round(price / 7.8, 2)
        except Exception:
            pass

        ratings = row.get("number_ratings_num")
        ai_score = 50.0
        if ratings and float(ratings) > 100:
            ai_score += 10
        if any(kw in title.lower() for kw in ["custom", "personalized", "embroidered"]):
            ai_score += 10

        try:
            cur.execute("""
                INSERT INTO products
                    (source_platform, source_id, source_url, title, category, brand,
                     price, currency, main_image, review_count, ai_score,
                     is_published, is_deleted, created_at, updated_at)
                VALUES ('etsy', %s, %s, %s, %s, %s,
                        %s, 'USD', %s, %s, %s,
                        0, 0, NOW(), NOW())
            """, (
                source_id, url or None, title, category, vendor,
                price, main_image[:1000], ratings, ai_score,
            ))
            inserted += 1
        except Exception as e:
            print(f"  Etsy写入失败 [{title[:40]}]: {e}")

        if inserted % 200 == 0 and inserted > 0:
            conn.commit()
            print(f"  Etsy 已写入 {inserted} 条...")

    conn.commit()
    print(f"Etsy 完成: 新增 {inserted} | 跳过 {skipped}")


# ─── Amazon ──────────────────────────────────────────────────────────────────

def sync_amazon(conn):
    cur = conn.cursor()
    cur.execute("""
        SELECT id, title, product_type, tags, vendor, images, variants,
               product_url, number_ratings
        FROM product_ama_table
        WHERE is_delete=0
          AND images IS NOT NULL AND images != '[]'
          AND title IS NOT NULL AND title != ''
    """)
    rows = cur.fetchall()
    print(f"Amazon 待同步: {len(rows)} 条")

    inserted = skipped = 0
    for row in rows:
        url = (row["product_url"] or "").strip()[:1000]
        source_id = make_source_id("ama_", str(row["id"]))

        if url and url_exists(cur, url):
            skipped += 1
            continue
        if source_id_exists(cur, source_id):
            skipped += 1
            continue

        title = (row["title"] or "")[:500]
        vendor = (row["vendor"] or "")[:255]
        product_type = row.get("product_type") or ""
        tags = row.get("tags") or ""
        category = map_category(title + " " + product_type + " " + tags)

        try:
            imgs = json.loads(row["images"]) if row["images"] else []
            main_image = imgs[0].get("src", "") if imgs else ""
        except Exception:
            main_image = ""
        if not main_image:
            skipped += 1
            continue

        price = None
        try:
            variants = json.loads(row["variants"]) if row["variants"] else []
            prices = [float(v["price"]) for v in variants if v.get("price")]
            if prices:
                price = min(prices)
        except Exception:
            pass

        ratings_str = row.get("number_ratings") or "0"
        try:
            review_count = int(str(ratings_str).replace(",", "").strip())
        except Exception:
            review_count = 0

        ai_score = 50.0
        if review_count > 100:
            ai_score += 10
        if review_count > 1000:
            ai_score += 10
        if any(kw in title.lower() for kw in ["custom", "personalized", "embroidered"]):
            ai_score += 10

        try:
            cur.execute("""
                INSERT INTO products
                    (source_platform, source_id, source_url, title, category, brand,
                     price, currency, main_image, review_count, ai_score,
                     is_published, is_deleted, created_at, updated_at)
                VALUES ('amazon', %s, %s, %s, %s, %s,
                        %s, 'USD', %s, %s, %s,
                        0, 0, NOW(), NOW())
            """, (
                source_id, url or None, title, category, vendor,
                price, main_image[:1000], review_count, ai_score,
            ))
            inserted += 1
        except Exception as e:
            print(f"  Amazon写入失败 [{title[:40]}]: {e}")

        if inserted % 200 == 0 and inserted > 0:
            conn.commit()
            print(f"  Amazon 已写入 {inserted} 条...")

    conn.commit()
    print(f"Amazon 完成: 新增 {inserted} | 跳过 {skipped}")


# ─── Facebook ────────────────────────────────────────────────────────────────

def sync_facebook(conn):
    cur = conn.cursor()
    cur.execute("""
        SELECT id, store_name, advertising_text, advertising_img, advertising_time
        FROM fb_advertising_table
        WHERE is_delete=0
          AND advertising_img IS NOT NULL AND advertising_img != '[]'
          AND store_name IS NOT NULL AND store_name != ''
    """)
    rows = cur.fetchall()
    print(f"Facebook 待同步: {len(rows)} 条")

    inserted = skipped = 0
    for row in rows:
        source_id = make_source_id("fb_", str(row["id"]))
        if source_id_exists(cur, source_id):
            skipped += 1
            continue

        ad_text = (row["advertising_text"] or "")
        title = ad_text[:200].split("\n")[0].strip() or (row["store_name"] + " Ad")
        title = title[:500]
        store_name = (row["store_name"] or "")[:255]
        category = map_category(title + " " + ad_text)

        try:
            imgs = json.loads(row["advertising_img"]) if row["advertising_img"] else []
            # imgs 可能是字符串列表或对象列表
            main_image = ""
            for img in imgs:
                if isinstance(img, str) and img.startswith("http"):
                    main_image = img
                    break
                elif isinstance(img, dict):
                    main_image = img.get("src") or img.get("url") or img.get("image_url") or ""
                    if main_image:
                        break
        except Exception:
            main_image = ""

        if not main_image:
            skipped += 1
            continue

        ai_score = 55.0  # FB 广告素材天然有一定曝光价值

        try:
            cur.execute("""
                INSERT INTO products
                    (source_platform, source_id, source_url, title, category, brand,
                     price, currency, main_image, ai_score,
                     is_published, is_deleted, created_at, updated_at)
                VALUES ('facebook', %s, NULL, %s, %s, %s,
                        NULL, 'USD', %s, %s,
                        0, 0, NOW(), NOW())
            """, (
                source_id, title, category, store_name,
                main_image[:1000], ai_score,
            ))
            inserted += 1
        except Exception as e:
            print(f"  FB写入失败 [{title[:40]}]: {e}")

        if inserted % 200 == 0 and inserted > 0:
            conn.commit()
            print(f"  Facebook 已写入 {inserted} 条...")

    conn.commit()
    print(f"Facebook 完成: 新增 {inserted} | 跳过 {skipped}")


# ─── Google ──────────────────────────────────────────────────────────────────

def sync_google(conn):
    cur = conn.cursor()
    cur.execute("""
        SELECT id, url, title, price, rating, reviews_count,
               thumbnail, product_type, merchant_name
        FROM google_gcm_table
        WHERE is_delete=0
          AND thumbnail IS NOT NULL AND thumbnail != ''
          AND title IS NOT NULL AND title != ''
    """)
    rows = cur.fetchall()
    print(f"Google 待同步: {len(rows)} 条")

    inserted = skipped = 0
    for row in rows:
        url = (row["url"] or "").strip()[:1000]
        source_id = make_source_id("g_", url or str(row["id"]))

        if url and url_exists(cur, url):
            skipped += 1
            continue
        if source_id_exists(cur, source_id):
            skipped += 1
            continue

        title = (row["title"] or "")[:500]
        brand = (row.get("merchant_name") or "")[:255]
        product_type = row.get("product_type") or ""
        category = map_category(title + " " + product_type)
        thumbnail = (row.get("thumbnail") or "")[:1000]
        price = row.get("price")
        rating = row.get("rating")
        reviews = row.get("reviews_count")

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
                     price, currency, main_image, review_score, review_count, ai_score,
                     is_published, is_deleted, created_at, updated_at)
                VALUES ('google', %s, %s, %s, %s, %s,
                        %s, 'USD', %s, %s, %s, %s,
                        0, 0, NOW(), NOW())
            """, (
                source_id, url or None, title, category, brand,
                price, thumbnail, rating, reviews, ai_score,
            ))
            inserted += 1
        except Exception as e:
            print(f"  Google写入失败 [{title[:40]}]: {e}")

        if inserted % 200 == 0 and inserted > 0:
            conn.commit()
            print(f"  Google 已写入 {inserted} 条...")

    conn.commit()
    print(f"Google 完成: 新增 {inserted} | 跳过 {skipped}")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", choices=["etsy", "amazon", "facebook", "google", "all"],
                        default="all")
    args = parser.parse_args()

    conn = pymysql.connect(**DB)
    try:
        if args.source in ("etsy", "all"):
            sync_etsy(conn)
        if args.source in ("amazon", "all"):
            sync_amazon(conn)
        if args.source in ("facebook", "all"):
            sync_facebook(conn)
        if args.source in ("google", "all"):
            sync_google(conn)
    finally:
        conn.close()

    print("\n全部同步完成。")


if __name__ == "__main__":
    main()
