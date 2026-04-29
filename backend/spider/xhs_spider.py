"""
小红书商品爬虫
搜索定制刺绣/绣花等商品笔记，下载图片到本地，写入 xhs_products_table
"""
import json
import re
import time
import random
import logging
import os
import hashlib
import requests
from datetime import datetime

from playwright.sync_api import sync_playwright
import pymysql

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "52.8.149.180"),
    "port": int(os.getenv("DB_PORT", 3306)),
    "db": os.getenv("DB_NAME", "znxp"),
    "user": os.getenv("DB_USER", "znxp"),
    "passwd": os.getenv("DB_PASSWORD", "ZRiACK48n2h7WJtJ"),
    "charset": "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor,
}

COOKIES_PATH = os.path.join(os.path.dirname(__file__), "xhs_cookies.json")
STATIC_DIR = os.path.join(os.path.dirname(__file__), "../static/uploads/xhs")
os.makedirs(STATIC_DIR, exist_ok=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("xhs_spider")

DOWNLOAD_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.xiaohongshu.com/",
}

# 内置刺绣商品关键词 —— 聚焦可售卖的定制刺绣商品，非教程
EMBROIDERY_KEYWORDS = [
    "刺绣卫衣定制",
    "刺绣T恤定制",
    "刺绣帽子定制",
    "刺绣包包定制",
    "定制绣花外套",
    "刺绣衬衫定制",
    "宠物刺绣定制衣服",
    "情侣刺绣卫衣",
    "刺绣牛仔定制",
    "刺绣胸章定制",
]

# 标题黑名单：包含这些词的笔记不是商品，跳过
TITLE_BLACKLIST = ["教程", "教学", "DIY", "手工教", "怎么绣", "针法", "图案绣", "学刺绣", "入门", "零基础"]

XHS_SEARCH_URL = "https://www.xiaohongshu.com/search_result?keyword={}&source=unknown&type=51"


def ensure_table():
    """确保 xhs_products_table 存在"""
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
            logger.info("xhs_products_table 已就绪")
    finally:
        conn.close()


def download_file(url: str, subdir: str = "") -> str:
    """下载单个文件到本地，返回 /static/uploads/xhs/xxx 路径"""
    if not url or not url.startswith("http"):
        return url

    ext = ".jpg"
    clean = url.split("?")[0]
    if "." in clean.split("/")[-1]:
        raw_ext = "." + clean.split("/")[-1].rsplit(".", 1)[-1].lower()
        if raw_ext in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
            ext = raw_ext

    filename = hashlib.md5(url.encode()).hexdigest() + ext
    local_path = os.path.join(STATIC_DIR, filename)
    url_path = f"/static/uploads/xhs/{filename}"

    if os.path.exists(local_path):
        return url_path

    try:
        resp = requests.get(url, headers=DOWNLOAD_HEADERS, timeout=20, stream=True,
                            proxies={"http": None, "https": None})  # 绕过系统代理
        if resp.status_code == 200:
            with open(local_path, "wb") as f:
                for chunk in resp.iter_content(8192):
                    f.write(chunk)
            logger.info(f"已下载: {filename}")
            return url_path
        else:
            logger.warning(f"下载失败 {resp.status_code}: {url[:80]}")
            return ""
    except Exception as e:
        logger.warning(f"下载异常: {e} — {url[:80]}")
        return ""


def save_to_db(products: list, keyword: str = "") -> int:
    conn = pymysql.connect(**DB_CONFIG)
    inserted = 0
    try:
        with conn.cursor() as cur:
            for p in products:
                try:
                    # 直接用原始 CDN URL（浏览器可正常加载，无需本地下载）
                    images = p.get("images", [])
                    if not images:
                        logger.info(f"跳过无图商品: {p.get('title', '')[:40]}")
                        continue

                    # 过滤教程类内容
                    title_check = p.get("title", "")
                    if any(kw in title_check for kw in TITLE_BLACKLIST):
                        logger.info(f"跳过教程内容: {title_check[:40]}")
                        continue

                    # 检查重复（同 URL）
                    if p.get("xhs_url"):
                        cur.execute("SELECT id FROM xhs_products_table WHERE xhs_url = %s LIMIT 1", (p["xhs_url"],))
                        if cur.fetchone():
                            logger.info(f"跳过重复: {p['xhs_url'][:60]}")
                            continue

                    cur.execute(
                        """INSERT INTO xhs_products_table
                           (title, description, images, author_name, author_avatar,
                            likes_count, xhs_url, keyword, is_delete)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 0)""",
                        (
                            p.get("title", "")[:512],
                            p.get("description", ""),
                            json.dumps(images, ensure_ascii=False),
                            p.get("author_name", ""),
                            p.get("author_avatar", ""),
                            p.get("likes_count", 0),
                            p.get("xhs_url", ""),
                            keyword,
                        ),
                    )
                    inserted += 1
                except Exception as e:
                    logger.warning(f"单条插入失败: {e}")
            conn.commit()
    finally:
        conn.close()
    return inserted


def _parse_likes(text: str) -> int:
    """将 '1.2万' / '999' 等转成整数"""
    if not text:
        return 0
    text = text.strip().replace(",", "")
    try:
        if "万" in text:
            return int(float(text.replace("万", "")) * 10000)
        return int(text)
    except Exception:
        return 0


def _save_image_bytes(url: str, data: bytes) -> str:
    """把图片 bytes 存本地，返回 /static/uploads/xhs/xxx 路径"""
    filename = hashlib.md5(url.encode()).hexdigest() + ".jpg"
    local_path = os.path.join(STATIC_DIR, filename)
    with open(local_path, "wb") as f:
        f.write(data)
    return f"/static/uploads/xhs/{filename}"


def _crawl_one_keyword(page, context, keyword: str, max_scrolls: int) -> list:
    """对单个关键词执行搜索+滚动+解析，返回商品列表"""
    search_url = XHS_SEARCH_URL.format(requests.utils.quote(keyword))
    logger.info(f"▶ 搜索关键词: 【{keyword}】")

    # 用 route 拦截器在网络层捕获图片字节（比 response 事件更可靠）
    captured_images: dict = {}   # clean_url -> bytes

    def _route_handler(route):
        url = route.request.url
        if "xhscdn.com" in url and "avatar" not in url:
            try:
                resp = route.fetch()
                if resp.status == 200:
                    ct = resp.headers.get("content-type", "")
                    if ct.startswith("image/"):
                        clean = re.sub(r"!.*$", "", url.split("?")[0])
                        if clean not in captured_images:
                            captured_images[clean] = resp.body()
                try:
                    route.fulfill(response=resp)
                except Exception:
                    pass  # route may already be handled
            except Exception:
                try:
                    route.continue_()
                except Exception:
                    pass
        else:
            try:
                route.continue_()
            except Exception:
                pass

    page.route("**/*xhscdn.com/**", _route_handler)

    page.goto(search_url, wait_until="domcontentloaded", timeout=60000)
    time.sleep(3)

    # 尝试多个选择器（XHS 前端版本迭代后 class 可能变化）
    NOTE_SELECTORS = [
        "section.note-item",
        ".note-item",
        ".feeds-page .note-item",
        "[class*='note-item']",
        ".search-container .note-item",
    ]
    found_selector = None
    for sel in NOTE_SELECTORS:
        try:
            page.wait_for_selector(sel, timeout=8000)
            found_selector = sel
            logger.info(f"【{keyword}】使用选择器: {sel}")
            break
        except Exception:
            continue

    if not found_selector:
        title = page.title()
        content = page.content()
        body_len = len(content)
        # 诊断：输出页面中所有 class 包含 note/card/feed/item 的元素数量
        diag = page.evaluate("""() => {
            const all = document.querySelectorAll('*');
            const hits = {};
            all.forEach(el => {
                (el.className || '').toString().split(' ').forEach(c => {
                    if (c && (c.includes('note') || c.includes('card') || c.includes('feed') || c.includes('item')))
                        hits[c] = (hits[c] || 0) + 1;
                });
            });
            return hits;
        }""")
        logger.warning(f"【{keyword}】所有选择器均未找到。页面标题='{title}' 内容长度={body_len}")
        logger.warning(f"【{keyword}】页面元素诊断(note/card/feed/item类名): {dict(list(diag.items())[:20])}")
        page.unroute("**/*xhscdn.com/**", _route_handler)
        return []

    time.sleep(2)

    # 慢速滚动加载更多卡片
    last_count = len(page.query_selector_all(found_selector))
    no_change = 0
    viewport_h = page.viewport_size["height"] if page.viewport_size else 900
    scroll_y = 0
    for i in range(max_scrolls * 3):
        scroll_y += viewport_h // 2   # 每次滚半屏，更慢更仔细
        page.evaluate(f"window.scrollTo(0, {scroll_y})")
        time.sleep(1.5)
        new_count = len(page.query_selector_all(found_selector))
        at_bottom = page.evaluate("window.scrollY + window.innerHeight >= document.body.scrollHeight - 100")
        if at_bottom:
            if new_count == last_count:
                no_change += 1
                if no_change >= 2:
                    break
            else:
                no_change = 0
                scroll_y = 0
            last_count = new_count
        if i % 3 == 0:
            logger.info(f"  滚动 {i//3+1}/{max_scrolls}，卡片数: {new_count}，已截获: {len(captured_images)}")

    # 收集所有卡片 img src URL，强制通过 new Image() 触发浏览器加载
    all_img_srcs = page.evaluate("""
        (sel) => {
            const urls = [];
            document.querySelectorAll(sel + ' img').forEach(img => {
                const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
                if (src && src.includes('xhscdn.com') && !src.includes('avatar')) {
                    urls.push(src);
                }
            });
            return [...new Set(urls)];
        }
    """, found_selector)
    logger.info(f"  发现 {len(all_img_srcs)} 个商品图 URL，强制加载...")

    # 强制通过 new Image() 触发 HTTP 请求（绕过 loading=lazy 限制）
    if all_img_srcs:
        page.evaluate("""
            (urls) => {
                urls.forEach(url => {
                    const img = new Image();
                    img.src = url;
                });
            }
        """, all_img_srcs)
        time.sleep(max(6, len(all_img_srcs) * 0.3))  # 给每张图平均 0.3s 加载时间

    logger.info(f"  【{keyword}】共截获图片: {len(captured_images)} 张")
    page.unroute("**/*xhscdn.com/**", _route_handler)

    # 解析卡片
    products = []
    for card in page.query_selector_all(found_selector):
        try:
            title_el = card.query_selector(".footer .title") or card.query_selector(".title")
            title = title_el.inner_text().strip() if title_el else ""

            raw_image_urls = []
            for img in card.query_selector_all("img"):
                src = (img.get_attribute("src") or
                       img.get_attribute("data-src") or
                       img.get_attribute("data-lazy-src") or "")
                if src and src.startswith("http") and "avatar" not in src and "sns-avatar" not in src:
                    clean = re.sub(r"!.*$", "", src.split("?")[0])
                    if clean not in raw_image_urls:
                        raw_image_urls.append(clean)

            images = []
            for img_url in raw_image_urls[:3]:
                if img_url in captured_images:
                    local_path = _save_image_bytes(img_url, captured_images[img_url])
                    images.append(local_path)
                else:
                    # 前缀匹配（URL 带有 !suffix 变体）
                    matched = next((k for k in captured_images if k == img_url or
                                    k.startswith(img_url) or img_url.startswith(k)), None)
                    if matched:
                        local_path = _save_image_bytes(img_url, captured_images[matched])
                        images.append(local_path)

            author_el = card.query_selector(".author-info .name") or card.query_selector(".author .name")
            author_name = author_el.inner_text().strip() if author_el else ""

            avatar_el = card.query_selector(".author-info img") or card.query_selector(".avatar img")
            author_avatar = (avatar_el.get_attribute("src") or "") if avatar_el else ""

            likes_el = card.query_selector(".interact-info .count") or card.query_selector(".like-wrapper .count")
            likes_count = _parse_likes(likes_el.inner_text() if likes_el else "0")

            link_el = card.query_selector("a[href]")
            xhs_url = ""
            if link_el:
                href = link_el.get_attribute("href") or ""
                xhs_url = ("https://www.xiaohongshu.com" + href) if href.startswith("/") else href

            if title or images:
                products.append({
                    "title": title,
                    "description": title,
                    "images": images[:6],
                    "author_name": author_name,
                    "author_avatar": author_avatar,
                    "likes_count": likes_count,
                    "xhs_url": xhs_url,
                    "_keyword": keyword,
                })
        except Exception as e:
            logger.warning(f"解析卡片失败: {e}")

    logger.info(f"  【{keyword}】解析到 {len(products)} 条（有图: {sum(1 for p in products if p['images'])} 条）")
    return products


def run_spider(keywords: list = None, max_scrolls: int = 10, cookies_path: str = None, headless: bool = True) -> dict:
    """
    运行小红书爬虫，自动轮询内置刺绣关键词抓取最热商品。
    keywords=None 时使用全部内置关键词；也可传入子集做定向补充。
    返回 {"inserted": N, "parsed": M, "keywords": [...], "error": "..."}
    """
    ensure_table()
    cookies_path = cookies_path or COOKIES_PATH
    kw_list = keywords if keywords else EMBROIDERY_KEYWORDS
    result = {"inserted": 0, "parsed": 0, "keywords": kw_list, "error": None}

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=headless,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1440, "height": 900},
            locale="zh-CN",
        )
        context.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        page = context.new_page()

        try:
            # 注入 cookies
            logger.info("访问小红书首页...")
            page.goto("https://www.xiaohongshu.com", wait_until="domcontentloaded", timeout=60000)
            time.sleep(2)

            if os.path.exists(cookies_path):
                with open(cookies_path, "r", encoding="utf-8") as f:
                    cookies = json.load(f)
                # Playwright 要求 sameSite 必须是 Strict/Lax/None 字符串
                for c in cookies:
                    if not c.get("sameSite") or c["sameSite"] is None:
                        c["sameSite"] = "Lax"
                    # expirationDate (Chrome扩展格式) → expires (Playwright格式)
                    if "expirationDate" in c:
                        c["expires"] = int(c.pop("expirationDate"))
                    # 去掉 Playwright 不认识的字段
                    for key in ("hostOnly", "session", "storeId"):
                        c.pop(key, None)
                context.add_cookies(cookies)
                logger.info(f"已注入 {len(cookies)} 条 cookies")
            else:
                logger.warning("未找到 cookies 文件，以未登录状态爬取")

            # 逐个关键词爬取
            all_products = []
            for kw in kw_list:
                try:
                    products = _crawl_one_keyword(page, context, kw, max_scrolls)
                    all_products.extend(products)
                    # 关键词间随机休眠，避免触发风控
                    time.sleep(random.uniform(3, 6))
                except Exception as e:
                    logger.error(f"关键词 【{kw}】 出错: {e}")

            result["parsed"] = len(all_products)

            if all_products:
                # 按点赞数排序，优先入库热度高的
                all_products.sort(key=lambda x: x.get("likes_count", 0), reverse=True)
                total_inserted = 0
                for prod in all_products:
                    kw = prod.pop("_keyword", "")
                    total_inserted += save_to_db([prod], kw)
                result["inserted"] = total_inserted
                logger.info(f"✅ 共解析 {len(all_products)} 条，入库 {total_inserted} 条")
            else:
                result["error"] = "未解析到任何商品，请检查 cookies 或页面结构"

        except Exception as e:
            result["error"] = str(e)
            logger.error(f"爬虫出错: {e}")
        finally:
            browser.close()

    return result


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-scrolls", type=int, default=8)
    parser.add_argument("--no-headless", dest="headless", action="store_false", default=True)
    args = parser.parse_args()
    result = run_spider(keywords=None, max_scrolls=args.max_scrolls, headless=args.headless)
    print(result)
