"""
批量下载 TikTok 商品封面图到本地，并更新 products 表的 main_image 字段。
用法: python sync_tiktok_covers.py
"""
import os
import hashlib
import logging
import pymysql
from pymysql.cursors import DictCursor
import requests

DB = dict(host="52.8.149.180", port=3306, user="znxp",
          password="ZRiACK48n2h7WJtJ", db="znxp", charset="utf8mb4",
          cursorclass=DictCursor)

STATIC_DIR = os.path.join(os.path.dirname(__file__), "../static/uploads/tiktok")
os.makedirs(STATIC_DIR, exist_ok=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("sync_tiktok_covers")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15",
    "Referer": "https://www.tiktok.com/",
}


def download_cover(url: str) -> str:
    """下载封面图到本地，返回本地路径。失败返回空字符串。"""
    if not url or not url.startswith("http"):
        return ""

    clean = url.split("?")[0]
    ext = ".jpg"
    if "." in clean.split("/")[-1]:
        raw_ext = "." + clean.split("/")[-1].rsplit(".", 1)[-1].lower()
        if raw_ext in (".jpg", ".jpeg", ".png", ".webp"):
            ext = raw_ext

    filename = hashlib.md5(url.encode()).hexdigest() + ext
    local_path = os.path.join(STATIC_DIR, filename)
    url_path = f"/static/uploads/tiktok/{filename}"

    if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
        return url_path

    try:
        resp = requests.get(url, headers=HEADERS, timeout=15, stream=True)
        if resp.status_code == 200:
            with open(local_path, "wb") as f:
                for chunk in resp.iter_content(8192):
                    f.write(chunk)
            return url_path
        else:
            logger.warning(f"下载失败 {resp.status_code}: {url[:80]}")
            return ""
    except Exception as e:
        logger.warning(f"下载异常: {e} — {url[:80]}")
        return ""


def main():
    conn = pymysql.connect(**DB)
    cur = conn.cursor()

    # 查询所有 tiktok 商品中 main_image 仍是远端 URL 的
    cur.execute("""
        SELECT id, main_image FROM products
        WHERE source_platform = 'tiktok'
          AND main_image IS NOT NULL
          AND main_image != ''
          AND main_image NOT LIKE '/static/%'
          AND is_deleted = 0
    """)
    rows = cur.fetchall()
    logger.info(f"共 {len(rows)} 条 TikTok 商品需要同步封面图")

    updated = 0
    failed = 0
    skipped = 0

    for row in rows:
        pid = row["id"]
        url = row["main_image"]
        local = download_cover(url)
        if local:
            cur.execute("UPDATE products SET main_image = %s WHERE id = %s", (local, pid))
            updated += 1
            if updated % 50 == 0:
                conn.commit()
                logger.info(f"进度: {updated}/{len(rows)}")
        else:
            # 下载失败，清空 main_image 避免展示破损图
            cur.execute("UPDATE products SET main_image = NULL WHERE id = %s", (pid,))
            failed += 1

    conn.commit()
    conn.close()
    logger.info(f"完成: 更新 {updated} 条，失败清空 {failed} 条，跳过 {skipped} 条")


if __name__ == "__main__":
    main()
