"""
Instagram 刺绣标签爬虫
抓取 #embroidery 系列标签热帖，下载图片到本地，写入 xhs_products_table
（复用现有表结构，XHS 页面无需改动即可展示）
"""
import os
import json
import time
import hashlib
import logging
import requests
import pymysql
from datetime import datetime

import instaloader

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("instagram_spider")

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "52.8.149.180"),
    "port": int(os.getenv("DB_PORT", 3306)),
    "db": os.getenv("DB_NAME", "znxp"),
    "user": os.getenv("DB_USER", "znxp"),
    "passwd": os.getenv("DB_PASSWORD", "ZRiACK48n2h7WJtJ"),
    "charset": "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor,
}

STATIC_DIR = os.path.join(os.path.dirname(__file__), "../static/uploads/xhs")
os.makedirs(STATIC_DIR, exist_ok=True)

# 目标标签（刺绣/定制服装相关）
HASHTAGS = [
    "embroidery",
    "customembroidery",
    "embroideryhoodie",
    "embroideredclothing",
    "custombroidery",
    "embroiderydesign",
    "embroiderylover",
    "patchembroidery",
]

POSTS_PER_TAG = 30  # 每个标签抓取帖子数


def ensure_table():
    conn = pymysql.connect(**DB_CONFIG)
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS xhs_products_table (
                    id          INT AUTO_INCREMENT PRIMARY KEY,
                    title       VARCHAR(512)  NOT NULL DEFAULT '',
                    description TEXT,
                    images      TEXT          COMMENT 'JSON 数组，本地路径',
                    author_name VARCHAR(128)  DEFAULT '',
                    author_avatar VARCHAR(512) DEFAULT '',
                    likes_count INT           DEFAULT 0,
                    xhs_url     VARCHAR(1024) DEFAULT '',
                    keyword     VARCHAR(128)  DEFAULT '',
                    is_delete   TINYINT(1)    DEFAULT 0,
                    created_at  DATETIME      DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)
            conn.commit()
    finally:
        conn.close()


def download_image(url: str) -> str:
    """下载图片到本地，返回 /static/uploads/xhs/xxx 路径"""
    if not url or not url.startswith("http"):
        return url
    filename = hashlib.md5(url.encode()).hexdigest() + ".jpg"
    local_path = os.path.join(STATIC_DIR, filename)
    url_path = f"/static/uploads/xhs/{filename}"
    if os.path.exists(local_path):
        return url_path
    try:
        resp = requests.get(url, timeout=20, stream=True,
                            headers={"User-Agent": "Mozilla/5.0"},
                            proxies={"http": None, "https": None})
        if resp.status_code == 200:
            with open(local_path, "wb") as f:
                for chunk in resp.iter_content(8192):
                    f.write(chunk)
            return url_path
    except Exception as e:
        logger.warning(f"图片下载失败: {url} - {e}")
    return url


def save_posts(posts: list):
    if not posts:
        return 0
    conn = pymysql.connect(**DB_CONFIG)
    inserted = 0
    try:
        with conn.cursor() as cur:
            for p in posts:
                # 按 xhs_url 去重
                cur.execute("SELECT id FROM xhs_products_table WHERE xhs_url = %s AND is_delete = 0", (p["url"],))
                if cur.fetchone():
                    continue
                cur.execute("""
                    INSERT INTO xhs_products_table
                        (title, description, images, author_name, likes_count, xhs_url, keyword, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    p["title"][:500],
                    p.get("description", ""),
                    json.dumps(p["images"]),
                    p.get("author", ""),
                    p.get("likes", 0),
                    p["url"],
                    p["keyword"],
                    datetime.now(),
                ))
                inserted += 1
        conn.commit()
    finally:
        conn.close()
    return inserted


def run_spider(hashtags: list = None, posts_per_tag: int = POSTS_PER_TAG,
               username: str = None, password: str = None) -> dict:
    ensure_table()

    tags = hashtags or HASHTAGS
    L = instaloader.Instaloader(
        download_pictures=False,
        download_videos=False,
        download_video_thumbnails=False,
        download_geotags=False,
        download_comments=False,
        save_metadata=False,
        quiet=True,
    )

    if username and password:
        try:
            L.login(username, password)
            logger.info(f"已登录 Instagram: {username}")
        except Exception as e:
            logger.warning(f"登录失败，以未登录状态继续: {e}")

    total_inserted = 0
    total_parsed = 0

    for tag in tags:
        logger.info(f"▶ 抓取标签: #{tag}")
        posts_data = []
        try:
            hashtag = instaloader.Hashtag.from_name(L.context, tag)
            count = 0
            for post in hashtag.get_posts():
                if count >= posts_per_tag:
                    break
                try:
                    # 获取图片 URL
                    image_urls = []
                    if post.typename == "GraphSidecar":
                        # 多图帖子
                        for node in post.get_sidecar_nodes():
                            image_urls.append(node.display_url)
                    else:
                        image_urls.append(post.url)

                    # 下载图片
                    local_images = []
                    for img_url in image_urls[:3]:  # 最多3张
                        local_path = download_image(img_url)
                        if local_path:
                            local_images.append(local_path)

                    caption = post.caption or ""
                    title = caption[:100].split("\n")[0] if caption else f"#{tag}"

                    posts_data.append({
                        "title": title,
                        "description": caption[:1000],
                        "images": local_images,
                        "author": post.owner_username,
                        "likes": post.likes,
                        "url": f"https://www.instagram.com/p/{post.shortcode}/",
                        "keyword": f"ins:#{tag}",
                    })
                    count += 1
                    total_parsed += 1

                    if count % 5 == 0:
                        logger.info(f"  #{tag} 已解析 {count} 条")
                    time.sleep(2)  # 防频率限制

                except Exception as e:
                    logger.warning(f"  解析帖子失败: {e}")
                    continue

        except Exception as e:
            logger.error(f"  #{tag} 标签抓取失败: {e}")
            continue

        inserted = save_posts(posts_data)
        total_inserted += inserted
        logger.info(f"  #{tag} 完成: 解析 {len(posts_data)} 条，入库 {inserted} 条")
        time.sleep(5)  # 标签间间隔

    logger.info(f"✅ Instagram 爬虫完成: 共解析 {total_parsed} 条，入库 {total_inserted} 条")
    return {"inserted": total_inserted, "parsed": total_parsed, "hashtags": tags}


if __name__ == "__main__":
    import sys
    username = sys.argv[1] if len(sys.argv) > 1 else None
    password = sys.argv[2] if len(sys.argv) > 2 else None
    result = run_spider(username=username, password=password)
    print(result)
