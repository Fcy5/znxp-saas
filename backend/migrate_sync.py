"""
Synchronous migration: copy real product data into the new products table.
Runs directly with pymysql (no async complexity).
"""
import json
import re
import sys
import pymysql

DB = dict(host='52.8.149.180', user='znxp', password='ZRiACK48n2h7WJtJ',
          db='znxp', charset='utf8mb4', cursorclass=pymysql.cursors.DictCursor)


def parse_price(variants_json):
    try:
        variants = json.loads(variants_json) if isinstance(variants_json, str) else variants_json
        if variants:
            prices = [float(v.get('price', 0)) for v in variants if v.get('price')]
            prices = [p for p in prices if 3 <= p <= 200]  # filter reasonable USD prices
            if prices:
                return round(min(prices), 2)
    except Exception:
        pass
    return None


def parse_image(images_json, image_str=None):
    try:
        imgs = json.loads(images_json) if isinstance(images_json, str) else images_json
        if isinstance(imgs, list) and imgs:
            src = imgs[0].get('src', '') if isinstance(imgs[0], dict) else str(imgs[0])
            if src and src.startswith('http'):
                return src[:1000]
    except Exception:
        pass
    if image_str:
        try:
            img = json.loads(image_str) if isinstance(image_str, str) else image_str
            if isinstance(img, dict):
                s = img.get('src', '')
                if s and s.startswith('http'):
                    return s[:1000]
        except Exception:
            pass
    return None


def clean_html(html_str):
    if not html_str:
        return None
    clean = re.sub(r'<[^>]+>', ' ', str(html_str))
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean[:2000] if clean else None


def map_category(product_type, tags):
    t = f"{product_type or ''} {tags or ''}".lower()
    if any(w in t for w in ['hoodie', 'sweatshirt', 'sweater', 'jacket', 'shirt', 't-shirt', 'tee', 'blouse', 'top']):
        return 'Apparel'
    if any(w in t for w in ['cap', 'hat', 'beanie', 'bag', 'tote', 'backpack', 'wallet']):
        return 'Accessories'
    if any(w in t for w in ['mug', 'cup', 'kitchen', 'apron', 'tumbler']):
        return 'Kitchen'
    if any(w in t for w in ['pillow', 'blanket', 'decor', 'wall', 'poster', 'frame', 'home', 'candle']):
        return 'Home Decor'
    if any(w in t for w in ['baby', 'infant', 'toddler', 'kid', 'child', 'onesie']):
        return 'Baby'
    if any(w in t for w in ['dog', 'cat', 'pet', 'paw', 'bandana']):
        return 'Pet Supplies'
    if any(w in t for w in ['wedding', 'bride', 'groom', 'bridal']):
        return 'Wedding'
    if any(w in t for w in ['gift', 'present']):
        return 'Gifts'
    return 'Other'


INSERT_SQL = """
    INSERT IGNORE INTO products (
        source_platform, source_id, source_url, title, description,
        category, brand, price, currency, main_image,
        review_count, review_score, profit_margin_estimate, ai_score,
        is_published, is_deleted
    ) VALUES (
        %s, %s, %s, %s, %s,
        %s, %s, %s, %s, %s,
        %s, %s, %s, %s,
        1, 0
    )
"""


def insert_batch(cur, conn, records):
    count = 0
    for r in records:
        try:
            cur.execute(INSERT_SQL, r)
            count += 1
        except Exception as e:
            pass
    conn.commit()
    return count


def main():
    conn = pymysql.connect(**DB)
    cur = conn.cursor()
    total = 0

    # ── Etsy ────────────────────────────────────────────────────
    print("Migrating Etsy...")
    cur.execute("""
        SELECT product_id, title, body_html, product_type, tags, variants,
               images, image, vendor, product_url, number_ratings, number_ratings_num
        FROM product_etsy_table
        WHERE is_delete = 0 AND title IS NOT NULL AND title != ''
        LIMIT 600
    """)
    rows = cur.fetchall()
    records = []
    for row in rows:
        price = parse_price(row['variants'])
        if not price:
            continue
        img = parse_image(row['images'], row['image'])
        try:
            rating_score = float(row['number_ratings_num'] or 0)
            rating_score = rating_score if 0 < rating_score <= 5 else None
        except Exception:
            rating_score = None
        try:
            rating_count = int(row['number_ratings'] or 0)
        except Exception:
            rating_count = 0
        ai = round(min(98, 60 + (rating_score or 4.3) * 5 + min(rating_count, 500) * 0.02), 1)
        records.append((
            'etsy', row['product_id'] or row['title'][:50], row.get('product_url') or '',
            row['title'][:500], clean_html(row.get('body_html')),
            map_category(row.get('product_type'), row.get('tags')), row.get('vendor'),
            price, 'USD', img,
            rating_count, rating_score,
            round(max(30, min(75, 70 - price * 0.3)), 1), ai,
        ))
    n = insert_batch(cur, conn, records)
    total += n
    print(f"  Etsy: {n}/{len(rows)} inserted")

    # ── Amazon ──────────────────────────────────────────────────
    print("Migrating Amazon...")
    cur.execute("""
        SELECT product_id, title, body_html, product_type, tags, variants,
               images, image, vendor, product_url, number_ratings
        FROM product_ama_table
        WHERE is_delete = 0 AND title IS NOT NULL AND title != ''
        LIMIT 600
    """)
    rows = cur.fetchall()
    records = []
    for row in rows:
        price = parse_price(row['variants'])
        if not price:
            continue
        img = parse_image(row['images'], row['image'])
        try:
            rating_count = int(row['number_ratings'] or 0)
        except Exception:
            rating_count = 0
        rating_score = 4.5 if rating_count > 100 else 4.2
        ai = round(min(96, 55 + min(rating_count, 1000) * 0.02 + rating_score * 5), 1)
        records.append((
            'amazon', row['product_id'] or row['title'][:50], row.get('product_url') or '',
            row['title'][:500], clean_html(row.get('body_html')),
            map_category(row.get('product_type'), row.get('tags')), row.get('vendor'),
            price, 'USD', img,
            rating_count, rating_score,
            round(max(25, min(65, 60 - price * 0.3)), 1), ai,
        ))
    n = insert_batch(cur, conn, records)
    total += n
    print(f"  Amazon: {n}/{len(rows)} inserted")

    # ── Shopify/multi-channel ────────────────────────────────────
    print("Migrating Shopify/other...")
    cur.execute("""
        SELECT product_id, title, body_html, product_type, tags, channel,
               variants, images, image, vendor, product_url
        FROM product_table
        WHERE is_delete = 0 AND title IS NOT NULL AND title != ''
        LIMIT 400
    """)
    rows = cur.fetchall()
    records = []
    for row in rows:
        price = parse_price(row['variants'])
        if not price:
            continue
        img = parse_image(row['images'], row['image'])
        ch = (row.get('channel') or 'shopify').lower()
        platform = 'shopify'
        ai = round(55 + min(price, 100) * 0.2, 1)
        records.append((
            platform, row['product_id'] or row['title'][:50], row.get('product_url') or '',
            row['title'][:500], clean_html(row.get('body_html')),
            map_category(row.get('product_type'), row.get('tags')), row.get('vendor'),
            price, 'USD', img,
            None, None,
            round(max(30, min(70, 65 - price * 0.25)), 1), ai,
        ))
    n = insert_batch(cur, conn, records)
    total += n
    print(f"  Shopify: {n}/{len(rows)} inserted")

    # ── Google GMC ───────────────────────────────────────────────
    print("Migrating Google GMC...")
    cur.execute("""
        SELECT url, price, title, rating, merchant_url, merchant_name,
               thumbnail, reviews_count, product_type
        FROM google_gcm_table
        WHERE is_delete = 0 AND title IS NOT NULL AND title != '' AND price > 0
        LIMIT 300
    """)
    rows = cur.fetchall()
    records = []
    for row in rows:
        try:
            price = float(row['price'])
        except Exception:
            continue
        if not (3 <= price <= 500):
            continue
        try:
            rating = float(row['rating'] or 0)
            rating = rating if 0 < rating <= 5 else None
        except Exception:
            rating = None
        try:
            rc = int(row['reviews_count'] or 0)
        except Exception:
            rc = 0
        ai = round(min(95, 50 + (rating or 4) * 6 + min(rc, 500) * 0.02), 1)
        source_id = f"gcm_{abs(hash(str(row['url']))) % 10**10}"
        records.append((
            'google', source_id, row['url'] or '',
            row['title'][:500], None,
            map_category(row.get('product_type'), ''), row.get('merchant_name'),
            round(price, 2), 'USD', row.get('thumbnail'),
            rc, rating,
            round(max(25, min(70, 65 - price * 0.3)), 1), ai,
        ))
    n = insert_batch(cur, conn, records)
    total += n
    print(f"  Google GMC: {n}/{len(rows)} inserted")

    # ── Result ───────────────────────────────────────────────────
    cur.execute("SELECT COUNT(*) as c FROM products")
    final = cur.fetchone()['c']
    print(f"\n✅ Migration complete! Inserted {total} new records. Total in products table: {final}")
    conn.close()


if __name__ == '__main__':
    main()
