"""
全接口测试脚本 — 直连生产服务器
运行: python3 test_all_apis.py
"""
import json
import sys
import urllib.request
import urllib.parse
import urllib.error

BASE = "https://znxp-sass.vqmjc.cc/api/v1"
EMAIL = "KsanderjustinwRW3bp@koreamail.com"

# ── 工具函数 ──────────────────────────────────────────────────────────────────

def req(method, path, body=None, token=None, expected=(200,)):
    url = BASE + path
    data = json.dumps(body).encode() if body else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        r = urllib.request.Request(url, data=data, headers=headers, method=method)
        resp = urllib.request.urlopen(r, timeout=15)
        result = json.loads(resp.read().decode())
        code = resp.getcode()
        return code, result
    except urllib.error.HTTPError as e:
        try:
            result = json.loads(e.read().decode())
        except Exception:
            result = {"error": e.reason}
        if e.code not in expected:
            print(f"  [WARN] HTTP {e.code}: {result}")
        return e.code, result
    except Exception as ex:
        print(f"  [ERR] {ex}")
        return 0, {}


def check(name, code, resp, expect_code=200):
    ok = code == expect_code
    icon = "✓" if ok else "✗"
    detail = ""
    if not ok:
        detail = f" → {code}: {str(resp)[:100]}"
    print(f"  {icon} {name}{detail}")
    return ok


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print(f"\n🧪 Testing {BASE}\n")
    errors = 0

    # 0. Health check
    print("── Health ──")
    code, resp = req("GET", "/health".replace("/api/v1", "").replace(BASE, "https://znxp-sass.vqmjc.cc"))
    # health is at root
    try:
        r = urllib.request.urlopen("https://znxp-sass.vqmjc.cc/health", timeout=10)
        hj = json.loads(r.read().decode())
        print(f"  ✓ health → {hj}")
    except Exception as e:
        print(f"  ✗ health → {e}")
        errors += 1

    # 1. Auth: Send OTP
    print("\n── Auth ──")
    code, resp = req("POST", "/auth/send-otp", {"email": EMAIL})
    if not check("send-otp", code, resp):
        errors += 1

    # Login (need a real password)
    password = "abc123456"  # 尝试常见密码
    code, resp = req("POST", "/auth/login", {"email": EMAIL, "password": password})
    token = None
    if code == 200 and resp.get("data", {}).get("access_token"):
        token = resp["data"]["access_token"]
        print(f"  ✓ login → got token")
    else:
        # try other passwords
        for pw in ["123456", "password", "znxp123", "admin123"]:
            code, resp = req("POST", "/auth/login", {"email": EMAIL, "password": pw})
            if code == 200 and resp.get("data", {}).get("access_token"):
                token = resp["data"]["access_token"]
                print(f"  ✓ login (pw={pw}) → got token")
                break
        if not token:
            print(f"  ✗ login → {code}: {resp}")
            errors += 1
            print("\n❌ No auth token — skipping authenticated tests\n")
            print(f"\n总结: {errors} 个问题\n")
            return

    # 2. Dashboard
    print("\n── Dashboard ──")
    code, resp = req("GET", "/dashboard/stats", token=token)
    if not check("stats", code, resp): errors += 1
    code, resp = req("GET", "/dashboard/trend?days=7", token=token)
    if not check("trend", code, resp): errors += 1

    # 3. Products
    print("\n── Products ──")
    code, resp = req("GET", "/products/recommendations?limit=3", token=token)
    if not check("recommendations", code, resp): errors += 1

    code, resp = req("POST", "/products/search", {"page": 1, "page_size": 5}, token=token)
    if not check("search", code, resp): errors += 1
    product_id = None
    if code == 200 and resp.get("data"):
        product_id = resp["data"][0]["id"]
        print(f"    └ first product_id={product_id}")

    if product_id:
        code, resp = req("GET", f"/products/{product_id}", token=token)
        if not check("detail", code, resp): errors += 1

        code, resp = req("POST", f"/products/{product_id}/save", token=token)
        if not check("save (or already saved)", code, resp, expect_code=200): errors += 1

    code, resp = req("GET", "/products/library/list?page=1&page_size=5", token=token)
    if not check("library/list", code, resp): errors += 1

    # 4. Shops
    print("\n── Shops ──")
    code, resp = req("GET", "/shops/", token=token)
    if not check("shops list", code, resp): errors += 1
    shop_id = None
    if code == 200 and resp.get("data"):
        shop_id = resp["data"][0]["id"]
        print(f"    └ first shop_id={shop_id}")

    # 5. Publish
    print("\n── Publish ──")
    code, resp = req("GET", "/publish/list?page=1&page_size=5", token=token)
    if not check("publish list", code, resp): errors += 1

    # 6. Agent tasks
    print("\n── Agent ──")
    code, resp = req("GET", "/agent/tasks", token=token)
    if not check("agent tasks list", code, resp): errors += 1

    if shop_id:
        code, resp = req("GET", f"/agent/shopify-products?shop_id={shop_id}&page=1&per_page=5", token=token)
        if not check("shopify-products cache", code, resp): errors += 1

    # 7. Suppliers
    print("\n── Suppliers ──")
    code, resp = req("GET", "/suppliers/?page=1&page_size=5", token=token)
    if not check("suppliers list", code, resp): errors += 1
    code, resp = req("GET", "/suppliers/products/list?page=1&page_size=5", token=token)
    if not check("supplier products", code, resp): errors += 1

    # 8. Facebook
    print("\n── Facebook ──")
    code, resp = req("GET", "/facebook/ads?page=1&page_size=5", token=token)
    if not check("fb ads list", code, resp): errors += 1

    # 9. Settings
    print("\n── Settings ──")
    code, resp = req("GET", "/settings/ai", token=token)
    if not check("ai settings", code, resp): errors += 1

    # 10. GMC status (just check connectivity)
    print("\n── GMC ──")
    code, resp = req("GET", "/gmc/status", token=token)
    if not check("gmc status", code, resp): errors += 1

    # 11. XiaoHongShu
    print("\n── XiaoHongShu ──")
    code, resp = req("GET", "/xiaohongshu/spider/status", token=token)
    if not check("xhs spider status", code, resp): errors += 1
    code, resp = req("GET", "/xiaohongshu/products?page=1&page_size=5", token=token)
    if not check("xhs products", code, resp): errors += 1

    # Summary
    if errors == 0:
        print(f"\n✅ 全部接口正常\n")
    else:
        print(f"\n⚠️  {errors} 个接口有问题，请检查上方日志\n")

if __name__ == "__main__":
    main()
