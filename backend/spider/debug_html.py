"""
调试脚本：保存 FB 广告库页面 HTML，用于分析正确的 CSS 选择器
"""
import json, time, os, sys
from playwright.sync_api import sync_playwright

TARGET_URL = "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&is_targeted_country=false&media_type=all&q=pawaviva&search_type=keyword_unordered"
COOKIES_PATH = os.path.join(os.path.dirname(__file__), "facebook_cookies.json")
OUTPUT_HTML = "/tmp/fb_debug.html"
SCREENSHOT = "/tmp/fb_debug.png"

with sync_playwright() as p:
    browser = p.webkit.launch(headless=True)
    context = browser.new_context(
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15",
        viewport={"width": 1366, "height": 768},
    )
    page = context.new_page()

    print("访问页面...")
    page.goto(TARGET_URL, wait_until="domcontentloaded", timeout=90000)
    time.sleep(2)

    with open(COOKIES_PATH) as f:
        cookies = json.load(f)
    context.add_cookies(cookies)
    print(f"注入 {len(cookies)} 条 cookies，reload...")
    page.reload(wait_until="domcontentloaded", timeout=90000)
    time.sleep(5)

    page.screenshot(path=SCREENSHOT)
    print(f"截图已保存: {SCREENSHOT}")

    # 滚动一次
    page.evaluate("window.scrollTo(0, 2000)")
    time.sleep(3)

    html = page.content()
    with open(OUTPUT_HTML, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"HTML 已保存: {OUTPUT_HTML}  ({len(html)} bytes)")

    # 分析容器
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")

    print("\n=== 容器分析 ===")
    for sel in ['div._7jyg._7jyh', 'div[role="article"]', 'div.x193iq5w', 'div._8n1a', 'div[data-testid]']:
        els = soup.select(sel)
        print(f"  {sel}: {len(els)} 个")

    print("\n=== 第一个 role=article 内容 ===")
    art = soup.select_one('div[role="article"]')
    if art:
        # 找所有 a[target=_blank]
        links = art.select('a[target="_blank"]')
        print(f"  a[target=_blank]: {len(links)} 个")
        for lk in links[:5]:
            print(f"    href={lk.get('href','')[:60]}  text={lk.get_text(strip=True)[:40]}")
        # 找所有 img
        imgs = art.select("img")
        print(f"  img: {len(imgs)} 个")
        for img in imgs[:3]:
            print(f"    src={img.get('src','')[:80]}")
        # 找所有 video
        vids = art.select("video")
        print(f"  video: {len(vids)} 个")
        for v in vids[:2]:
            print(f"    src={v.get('src','')[:80]}")
    else:
        print("  未找到 role=article 容器")
        # 打印页面前2000字
        print("\n=== 页面文本前500字 ===")
        print(soup.get_text()[:500])

    browser.close()
