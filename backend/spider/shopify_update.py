"""
Shopify 竞品店铺数据更新脚本
直接调用各店铺公开的 /products.json API，无需 Poky / 代理
用法: python shopify_update.py [--store couplehoodies] [--all]
"""
import json
import ssl
import time
import random
import argparse
import urllib.request
from datetime import datetime

import pymysql

# ── DB ──────────────────────────────────────────────────────────────────────
DB = dict(host="52.8.149.180", port=3306, user="znxp",
          password="ZRiACK48n2h7WJtJ", db="znxp", charset="utf8mb4")

# ── 店铺配置 ─────────────────────────────────────────────────────────────────
STORES = {
    "couplehoodies":  "couplehoodies.com",
    "custommybuddy":  "custommybuddy.com",
    "embroly":        "embroly.com",
    "foryourcustom":  "foryourcustom.com",
    "giantbighands":  "giantbighands.com",
    "loversdovey":    "loversdovey.com",
    "nowzen":         "nowzen.com",
    "pawaviva":       "pawaviva.com",
    "petfiestas":     "petfiestas.com",
    "petieisland":    "petieisland.com",
    "presentMalls":   "presentmalls.com",
    "printerval":     "printerval.com",
    "theurbanwalks":  "theurbanwalks.com",
}

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE


def fetch_products(domain: str) -> list[dict]:
    """分页拉取店铺全部商品，最多 250 条/页"""
    all_products = []
    page = 1
    while True:
        url = f"https://{domain}/products.json?limit=250&page={page}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            resp = urllib.request.urlopen(req, timeout=15, context=SSL_CTX)
            data = json.loads(resp.read())
            batch = data.get("products", [])
            if not batch:
                break
            all_products.extend(batch)
            print(f"  第{page}页: {len(batch)} 条，累计 {len(all_products)} 条")
            if len(batch) < 250:
                break
            page += 1
            time.sleep(random.uniform(1, 2))
        except Exception as e:
            print(f"  请求失败 page={page}: {e}")
            break
    return all_products


def safe_json(obj) -> str | None:
    if obj is None:
        return None
    return json.dumps(obj, ensure_ascii=False)


def upsert_products(conn, channel: str, products: list[dict]):
    """写入 product_table，已存在的按 handle 更新，不存在的插入，每50条 commit"""
    cur = conn.cursor()
    cur.execute("SET innodb_lock_wait_timeout=60")
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    inserted = updated = skipped = 0

    for idx, p in enumerate(products):
        handle = p.get("handle", "")
        product_url = f"https://{STORES[channel]}/products/{handle}"
        title = (p.get("title") or "")[:255]
        if not title:
            skipped += 1
            continue

        cur.execute(
            "SELECT id FROM product_table WHERE channel=%s AND handle=%s AND is_delete=0",
            (channel, handle)
        )
        existing = cur.fetchone()

        body_html = p.get("body_html") or ""
        product_type = (p.get("product_type") or "")[:255]
        tags = (", ".join(p.get("tags", [])) if isinstance(p.get("tags"), list) else (p.get("tags") or ""))[:1000]
        variants = safe_json(p.get("variants", []))
        options = safe_json(p.get("options", []))
        images = safe_json(p.get("images", []))
        image = safe_json(p.get("image"))
        vendor = (p.get("vendor") or "")[:255]
        published_scope = (p.get("published_scope") or "")[:255]

        try:
            if existing:
                cur.execute("""
                    UPDATE product_table SET
                        title=%s, body_html=%s, product_type=%s, tags=%s,
                        variants=%s, options=%s, images=%s, image=%s,
                        vendor=%s, published_scope=%s, product_url=%s,
                        updated_time=%s
                    WHERE id=%s
                """, (title, body_html, product_type, tags,
                      variants, options, images, image,
                      vendor, published_scope, product_url,
                      now, existing[0]))
                updated += 1
            else:
                product_id = f"{channel}_{handle[:80]}_{int(time.time()*1000)}"
                cur.execute("""
                    INSERT INTO product_table
                        (product_id, title, body_html, product_type, tags,
                         variants, options, images, image,
                         create_time, published_time, updated_time,
                         vendor, published_scope, handle, next_url,
                         channel, product_url, is_delete)
                    VALUES (%s,%s,%s,%s,%s, %s,%s,%s,%s, %s,%s,%s, %s,%s,%s,%s, %s,%s,%s)
                """, (product_id, title, body_html, product_type, tags,
                      variants, options, images, image,
                      now, now, now,
                      vendor, published_scope, handle, None,
                      channel, product_url, 0))
                inserted += 1
        except Exception as e:
            print(f"  写入失败 [{handle}]: {e}")
            conn.rollback()
            continue

        # 每50条提交一次，避免锁超时
        if (idx + 1) % 50 == 0:
            conn.commit()
            print(f"  已处理 {idx + 1} 条...")

    conn.commit()
    return inserted, updated, skipped


def run_store(channel: str):
    domain = STORES[channel]
    print(f"\n{'='*50}")
    print(f"店铺: {channel} ({domain})")
    print(f"{'='*50}")

    products = fetch_products(domain)
    if not products:
        print("  未获取到商品，跳过")
        return

    conn = pymysql.connect(**DB)
    try:
        ins, upd, skip = upsert_products(conn, channel, products)
        print(f"  完成: 新增 {ins} | 更新 {upd} | 跳过 {skip}")
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="Shopify 店铺数据更新")
    parser.add_argument("--store", help="指定店铺 key，如 couplehoodies")
    parser.add_argument("--all", action="store_true", help="更新所有店铺")
    parser.add_argument("--list", action="store_true", help="列出所有支持的店铺")
    args = parser.parse_args()

    if args.list:
        for k, v in STORES.items():
            print(f"  {k:<20} → {v}")
        return

    if args.all:
        for channel in STORES:
            run_store(channel)
            time.sleep(random.uniform(2, 4))
    elif args.store:
        if args.store not in STORES:
            print(f"未知店铺: {args.store}，可用: {list(STORES.keys())}")
            return
        run_store(args.store)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
