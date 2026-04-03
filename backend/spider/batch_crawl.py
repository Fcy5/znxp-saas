"""
批量爬取脚本 — 按顺序爬取多个 FB 广告库 URL
"""
import sys
import os
import time

sys.path.insert(0, os.path.dirname(__file__))
from fb_spider import run_spider

URLS = [
    "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=US&is_targeted_country=false&media_type=all&search_type=page&start_date[min]=2025-07-01&start_date[max]&view_all_page_id=286165591236928",
    "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&is_targeted_country=false&media_type=all&q=embroidered%20photo%20hoodie&search_type=keyword_unordered",
    "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&is_targeted_country=false&media_type=all&q=petfiestas&search_type=keyword_unordered",
    "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&is_targeted_country=false&media_type=all&q=custommybuddy&search_type=keyword_unordered",
    "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&is_targeted_country=false&media_type=all&q=printerval&search_type=keyword_unordered",
    "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&is_targeted_country=false&media_type=all&q=%22foryourcustom%22&search_type=keyword_exact_phrase",
    "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&is_targeted_country=false&media_type=all&q=presentmalls&search_type=keyword_unordered",
    "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&is_targeted_country=false&media_type=all&q=giantbighands&search_type=keyword_unordered",
    "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&is_targeted_country=false&media_type=all&q=pawaviva&search_type=keyword_unordered",
    "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&is_targeted_country=false&media_type=all&q=loversdovey&search_type=keyword_unordered",
    "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&is_targeted_country=false&media_type=all&q=petieisland&search_type=keyword_unordered",
]

MAX_SCROLLS = 20

total_inserted = 0
total_parsed = 0

for i, url in enumerate(URLS, 1):
    label = url.split("q=")[-1].split("&")[0] if "q=" in url else url.split("view_all_page_id=")[-1].split("&")[0]
    print(f"\n[{i}/{len(URLS)}] 开始爬取: {label}")
    print(f"  URL: {url[:80]}...")
    t0 = time.time()
    result = run_spider(url, max_scrolls=MAX_SCROLLS, headless=True)
    elapsed = time.time() - t0
    total_inserted += result.get("inserted", 0)
    total_parsed += result.get("parsed", 0)
    print(f"  ✅ 解析 {result['parsed']} 条，入库 {result['inserted']} 条，耗时 {elapsed:.0f}s")
    if result.get("error"):
        print(f"  ⚠️  错误: {result['error']}")
    # 短暂休息，避免频率过高
    if i < len(URLS):
        print(f"  等待 10s 后继续下一个...")
        time.sleep(10)

print(f"\n{'='*50}")
print(f"✅ 批量爬取完成: 共解析 {total_parsed} 条，入库 {total_inserted} 条")
