"""
Agent 后台任务执行器（同步版本，使用 pymysql 直连，避免 SQLAlchemy async greenlet 问题）
FastAPI BackgroundTasks 会把同步函数丢进线程池执行。
"""
import json
import pymysql
import pymysql.cursors
from datetime import datetime
from openai import OpenAI
import httpx
from bs4 import BeautifulSoup
from app.core.config import settings


# ── DB 直连 ────────────────────────────────────────────────────────────────────

def _db():
    import re
    url = settings.database_url
    # 解析 mysql+asyncmy://user:pass@host:port/db
    m = re.match(r"mysql\+\w+://([^:]+):([^@]+)@([^:/]+):?(\d+)?/(\w+)", url)
    if not m:
        raise ValueError(f"无法解析 DATABASE_URL: {url}")
    user, password, host, port, db = m.groups()
    return pymysql.connect(
        host=host, port=int(port or 3306),
        user=user, password=password, db=db,
        charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )


def _update_task(task_id: int, **kwargs):
    if not kwargs:
        return
    conn = _db()
    try:
        parts = []
        vals = []
        for k, v in kwargs.items():
            if isinstance(v, (dict, list)):
                v = json.dumps(v, ensure_ascii=False)
            parts.append(f"`{k}` = %s")
            vals.append(v)
        vals.append(task_id)
        sql = f"UPDATE agent_tasks SET {', '.join(parts)} WHERE id = %s"
        with conn.cursor() as cur:
            cur.execute(sql, vals)
        conn.commit()
    finally:
        conn.close()


def _ai_client():
    return OpenAI(api_key=settings.ai_api_key, base_url=settings.ai_base_url)


# ── store_profile ─────────────────────────────────────────────────────────────

def _fetch_store_content(shop_url: str) -> dict:
    """抓取店铺页面内容，返回结构化文本"""
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
    }
    result = {"homepage": "", "products": [], "meta": {}, "announcement": ""}

    with httpx.Client(timeout=15, follow_redirects=True) as client:
        # 1. 抓首页
        try:
            r = client.get(shop_url, headers=headers)
            if r.status_code == 200:
                soup = BeautifulSoup(r.text, "html.parser")
                # 提取 meta
                title = soup.find("title")
                desc = soup.find("meta", attrs={"name": "description"})
                result["meta"]["title"] = title.get_text(strip=True) if title else ""
                result["meta"]["description"] = desc.get("content", "") if desc else ""
                # 移除无用标签（含 select/option 国家下拉）
                for tag in soup(["script", "style", "iframe", "noscript", "select", "option"]):
                    tag.decompose()
                # 提取 announcement bar
                for sel in ["[class*='announcement']", "[class*='notice']", "[class*='promo-bar']"]:
                    bar = soup.select_one(sel)
                    if bar:
                        result["announcement"] = bar.get_text(separator=" ", strip=True)[:200]
                        break
                # 移除 nav/footer/header（保留 main/section 内容）
                for tag in soup(["nav", "footer", "header"]):
                    tag.decompose()
                # 提取主要文本，过滤短行噪音
                text = soup.get_text(separator="\n", strip=True)
                lines = [l.strip() for l in text.splitlines() if len(l.strip()) > 15]
                # 去重（Shopify 页面常有重复行）
                seen, deduped = set(), []
                for l in lines:
                    if l not in seen:
                        seen.add(l)
                        deduped.append(l)
                result["homepage"] = "\n".join(deduped[:120])
        except Exception:
            pass

        # 2. 抓 /products.json（Shopify 原生接口）
        try:
            r = client.get(f"{shop_url.rstrip('/')}/products.json?limit=20", headers=headers)
            if r.status_code == 200:
                data = r.json()
                for p in data.get("products", [])[:20]:
                    variants = p.get("variants", [])
                    prices = [float(v["price"]) for v in variants if v.get("price")]
                    result["products"].append({
                        "title": p.get("title", ""),
                        "type": p.get("product_type", ""),
                        "tags": p.get("tags", [])[:8],
                        "price_min": min(prices) if prices else None,
                        "price_max": max(prices) if prices else None,
                    })
        except Exception:
            pass

    return result


def run_store_profile(task_id: int, shop_id: int, user_id: int):
    """抓取店铺真实页面内容，用 AI 生成店铺诊断报告"""
    _update_task(task_id, status="running", progress=10)
    try:
        # 1. 取店铺信息
        conn = _db()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT domain, name FROM shops WHERE id=%s AND user_id=%s AND is_deleted=0",
                    (shop_id, user_id)
                )
                row = cur.fetchone()
        finally:
            conn.close()

        if not row:
            _update_task(task_id, status="failed", error_message="店铺不存在")
            return

        domain = row["domain"]
        shop_name = row["name"]
        shop_url = f"https://{domain}" if not domain.startswith("http") else domain

        # 2. 抓取店铺页面
        _update_task(task_id, progress=20)
        content = _fetch_store_content(shop_url)

        _update_task(task_id, progress=50)

        if not settings.ai_api_key:
            _update_task(task_id, status="failed", error_message="AI API Key 未配置")
            return

        # 3. 组装真实内容给 AI
        products_text = ""
        if content["products"]:
            products_text = "\n".join(
                f"- {p['title']} | type: {p['type'] or 'N/A'} | price: ${p['price_min']}~${p['price_max']} | tags: {', '.join(p['tags'])}"
                for p in content["products"]
            )
        else:
            products_text = "No product data retrieved."

        homepage_text = content["homepage"][:2500] if content["homepage"] else "Homepage content not available."
        meta_title = content["meta"].get("title", "")
        meta_desc = content["meta"].get("description", "")
        announcement = content.get("announcement", "")

        prompt = f"""You are a senior cross-border e-commerce CRO (Conversion Rate Optimization) consultant with deep expertise in Shopify stores selling to North American consumers.

Below is the REAL scraped content from this Shopify store. Analyze it thoroughly and produce a detailed, actionable CRO diagnosis report in Chinese (中文).

Store: {shop_name}
URL: {shop_url}
Page Title: {meta_title}
Meta Description: {meta_desc}
Announcement Bar: {announcement}

--- Homepage Content (scraped) ---
{homepage_text}

--- Product Catalog Sample ---
{products_text}

---

Based on the ACTUAL content above, write a professional CRO diagnosis report in Chinese. Structure it EXACTLY as follows:

### 店铺现状分析
（2-3句话描述店铺的定位、核心品类、目标客群，基于真实页面内容）

### 当前核心问题
（列出3-5个具体问题，每条结合页面实际情况说明，重点关注：首屏设计、信任感建立、转化漏斗、情感共鸣、移动端体验）

### 高转化改版方案

**1. 顶部通栏 (Announcement Bar)**
（基于当前内容给出具体优化建议）

**2. 首屏视觉区 (Hero Section)**
（分析当前首屏问题，给出具体改版动作、主标题文案建议、CTA按钮文案）

**3. 信任与流程区 (How It Works)**
（是否有定制流程说明？位置是否合理？给出改版建议）

**4. 场景化产品分类 (Shop by Intent)**
（当前分类逻辑分析，基于产品数据给出情感化分类建议）

**5. 社会认同区 (Social Proof)**
（当前评价/UGC展示情况，给出具体改进建议）

**6. 直接落地建议**
（3条最优先执行的改版动作，每条一句话）

---

Return a JSON object with these keys:
{{
  "niche": "1-3 word niche in English",
  "target_audience": "one sentence in English",
  "price_range_min": <number>,
  "price_range_max": <number>,
  "visual_style": "1-3 words in English",
  "profile_summary": "<the full Chinese CRO diagnosis report above, as a single string with \\n for newlines>"
}}

Return ONLY valid JSON. The profile_summary value must be the complete Chinese report."""

        client = _ai_client()
        _update_task(task_id, progress=70)
        resp = client.chat.completions.create(
            model="google/gemini-3.1-pro-preview",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
        )
        raw = resp.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw.strip())

        _update_task(task_id, progress=85)

        # 3. 写回 shop 表
        conn = _db()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE shops SET
                        niche=%s, target_audience=%s,
                        price_range_min=%s, price_range_max=%s,
                        visual_style=%s, profile_summary=%s,
                        profile_generated_at=%s, updated_at=NOW()
                    WHERE id=%s
                """, (
                    (data.get("niche") or "")[:255],
                    data.get("target_audience") or "",
                    data.get("price_range_min"),
                    data.get("price_range_max"),
                    (data.get("visual_style") or "")[:255],
                    data.get("profile_summary") or "",
                    datetime.utcnow().isoformat(),
                    shop_id,
                ))
            conn.commit()
        finally:
            conn.close()

        _update_task(task_id, status="success", progress=100, output_data=data)

    except json.JSONDecodeError as e:
        _update_task(task_id, status="failed", error_message=f"AI 返回格式异常: {e}")
    except Exception as e:
        _update_task(task_id, status="failed", error_message=str(e))


# ── auto_discovery ────────────────────────────────────────────────────────────

def run_auto_discovery(task_id: int, shop_id: int, user_id: int, count: int = 10):
    """根据店铺 niche 从商品库检索最匹配的商品（同步，pymysql）"""
    _update_task(task_id, status="running", progress=10)
    try:
        # 1. 获取店铺 niche
        conn = _db()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT niche, profile_summary, target_audience FROM shops WHERE id=%s AND user_id=%s AND is_deleted=0",
                    (shop_id, user_id)
                )
                shop = cur.fetchone()
        finally:
            conn.close()

        if not shop:
            _update_task(task_id, status="failed", error_message="店铺不存在")
            return

        niche = shop.get("niche") or ""
        profile = shop.get("profile_summary") or ""

        _update_task(task_id, progress=20)

        if not niche and not profile:
            _update_task(task_id, status="failed", error_message="尚未生成店铺画像，请先运行「店铺诊脉」")
            return

        # 2. 关键词检索商品
        keywords = [w.strip() for w in niche.replace(",", " ").split() if len(w.strip()) > 2]
        if not keywords:
            keywords = ["embroidery", "custom", "personalized"]

        conn = _db()
        try:
            with conn.cursor() as cur:
                placeholders = " OR ".join([f"title LIKE %s" for _ in keywords[:5]])
                like_vals = [f"%{kw}%" for kw in keywords[:5]]
                cur.execute(f"""
                    SELECT id, title, category, price, ai_score, source_platform
                    FROM products
                    WHERE is_deleted=0 AND main_image IS NOT NULL AND main_image != ''
                    AND ({placeholders})
                    ORDER BY ai_score DESC
                    LIMIT %s
                """, like_vals + [count * 3])
                rows = cur.fetchall()

                if not rows:
                    cur.execute("""
                        SELECT id, title, category, price, ai_score, source_platform
                        FROM products
                        WHERE is_deleted=0 AND main_image IS NOT NULL
                        ORDER BY ai_score DESC
                        LIMIT %s
                    """, (count,))
                    rows = cur.fetchall()
        finally:
            conn.close()

        _update_task(task_id, progress=50)

        candidates = [
            {"id": r["id"], "title": r["title"], "category": r["category"] or "",
             "price": r["price"], "ai_score": r["ai_score"] or 0,
             "platform": r["source_platform"]}
            for r in rows
        ]

        recommended = candidates[:count]
        reasons: dict = {}

        # 3. AI 二次排序
        if settings.ai_api_key and len(candidates) > count:
            _update_task(task_id, progress=70)
            try:
                prompt = f"""You are a product selection expert for a Shopify dropshipping store.

Store profile:
- Niche: {niche}
- Target audience: {profile}

From the following candidate products, select the best {count} that match this store's niche and audience.

Candidates:
{json.dumps(candidates, ensure_ascii=False, indent=2)}

Return a JSON array of exactly {count} objects, each with:
{{"id": <product_id>, "reason": "1-2 sentences why this product matches the store"}}

Return ONLY valid JSON array, no markdown."""

                client = _ai_client()
                resp = client.chat.completions.create(
                    model=settings.ai_model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.3,
                )
                raw = resp.choices[0].message.content.strip()
                if raw.startswith("```"):
                    raw = raw.split("```")[1]
                    if raw.startswith("json"):
                        raw = raw[4:]
                ranked = json.loads(raw.strip())
                ranked_ids = [r["id"] for r in ranked if "id" in r]
                reasons = {r["id"]: r.get("reason", "") for r in ranked}
                id_to_c = {c["id"]: c for c in candidates}
                recommended = [id_to_c[i] for i in ranked_ids if i in id_to_c][:count]
            except Exception:
                pass

        output = [
            {**c, "rec_reason": reasons.get(c["id"], f"符合店铺 {niche} 定位")}
            for c in recommended
        ]

        _update_task(task_id, status="success", progress=100,
                     output_data={"products": output, "niche": niche, "shop_id": shop_id})

    except Exception as e:
        _update_task(task_id, status="failed", error_message=str(e))


# ── batch_copywriting ─────────────────────────────────────────────────────────

def run_batch_copywriting(task_id: int, user_id: int, product_ids: list, shop_id: int | None = None):
    """批量为指定商品生成 SEO & GEO 文案，写入 ai_description/seo_title/meta_description/alt_tags"""
    _update_task(task_id, status="running", progress=5)
    try:
        # 1. 取店铺 niche（可选，用于优化文案风格）
        niche = "custom embroidery"
        target_audience = ""
        if shop_id:
            conn = _db()
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT niche, target_audience FROM shops WHERE id=%s AND user_id=%s AND is_deleted=0",
                        (shop_id, user_id)
                    )
                    shop = cur.fetchone()
                    if shop:
                        niche = shop.get("niche") or niche
                        target_audience = shop.get("target_audience") or ""
            finally:
                conn.close()

        # 2. 取指定商品（校验归属于该用户选品库）
        if not product_ids:
            _update_task(task_id, status="failed", error_message="未选择任何商品")
            return

        placeholders = ",".join(["%s"] * len(product_ids))
        conn = _db()
        try:
            with conn.cursor() as cur:
                cur.execute(f"""
                    SELECT p.id, p.title, p.category, p.price, p.main_image,
                           p.description, p.source_platform
                    FROM user_products up
                    JOIN products p ON p.id = up.product_id
                    WHERE up.user_id = %s AND up.is_deleted = 0
                      AND p.is_deleted = 0
                      AND p.id IN ({placeholders})
                    ORDER BY p.ai_score DESC
                """, [user_id] + list(product_ids))
                products = cur.fetchall()
        finally:
            conn.close()

        if not products:
            _update_task(task_id, status="failed", error_message="所选商品不在你的选品库中")
            return

        total = len(products)
        _update_task(task_id, progress=10)

        if not settings.ai_api_key:
            _update_task(task_id, status="failed", error_message="AI API Key 未配置")
            return

        client = _ai_client()
        results = []

        for i, product in enumerate(products):
            progress = 10 + int((i / total) * 85)
            _update_task(task_id, progress=progress)

            title = product["title"] or ""
            category = product["category"] or ""
            price = product["price"]
            img_url = product["main_image"] or ""

            prompt = f"""You are an expert e-commerce copywriter for a Shopify store selling custom embroidery and personalized gifts to North American buyers.

Store niche: {niche}
Target audience: {target_audience}

Product:
- Title: {title}
- Category: {category}
- Price: ${price or "N/A"}

Generate SEO & GEO-optimized copy in English. Return JSON:
{{
  "seo_title": "SEO title under 70 chars with primary keyword",
  "meta_description": "Meta description under 155 chars with CTA",
  "html_description": "Full HTML description: <h2> headline, <p> opening, <ul> features (5 bullets), <h3>Q:</h3><p>A:</p> FAQ (3 questions). Min 250 words.",
  "alt_tags": ["main image alt", "lifestyle alt", "detail alt"]
}}

Rules: natural keywords, warm gift-oriented tone, Q&A for GEO/AI search, return ONLY valid JSON."""

            messages: list = [{"role": "user", "content": prompt}]
            if img_url and img_url.startswith("http"):
                messages = [{"role": "user", "content": [
                    {"type": "image_url", "image_url": {"url": img_url}},
                    {"type": "text", "text": prompt},
                ]}]

            try:
                resp = client.chat.completions.create(
                    model=settings.ai_model,
                    messages=messages,
                    temperature=0.5,
                )
                raw = resp.choices[0].message.content.strip()
                if raw.startswith("```"):
                    raw = raw.split("```")[1]
                    if raw.startswith("json"):
                        raw = raw[4:]
                copy_data = json.loads(raw.strip())

                ai_desc = copy_data.get("html_description") or ""
                seo_title = (copy_data.get("seo_title") or "")[:500]
                meta_desc = (copy_data.get("meta_description") or "")[:500]
                alt_tags = copy_data.get("alt_tags") or []
                if ai_desc or seo_title:
                    conn = _db()
                    try:
                        with conn.cursor() as cur:
                            cur.execute(
                                """UPDATE products
                                   SET ai_description=%s, seo_title=%s, meta_description=%s,
                                       alt_tags=%s, updated_at=NOW()
                                   WHERE id=%s""",
                                (ai_desc or None, seo_title or None, meta_desc or None,
                                 json.dumps(alt_tags, ensure_ascii=False), product["id"])
                            )
                        conn.commit()
                    finally:
                        conn.close()

                results.append({
                    "product_id": product["id"],
                    "title": title[:60],
                    "seo_title": copy_data.get("seo_title", ""),
                    "meta_description": copy_data.get("meta_description", ""),
                    "alt_tags": copy_data.get("alt_tags", []),
                })
            except Exception as e:
                results.append({"product_id": product["id"], "title": title[:60], "error": str(e)})

        success_count = sum(1 for r in results if "error" not in r)
        _update_task(task_id, status="success", progress=100, output_data={
            "total": total,
            "success": success_count,
            "niche": niche,
            "products": results,
        })

    except Exception as e:
        _update_task(task_id, status="failed", error_message=str(e))


# ── shopify_seo_optimize ──────────────────────────────────────────────────────

async def _seo_one_product(product: dict, shop_name: str, niche: str,
                            target_audience: str, brand_style: str) -> dict:
    """为单个商品异步调用 AI 生成 SEO，供 asyncio.gather 并发调用"""
    from openai import AsyncOpenAI
    ai = AsyncOpenAI(api_key=settings.ai_api_key, base_url=settings.ai_base_url)

    pid = product["id"]
    title = product.get("title") or ""
    body_html = (product.get("body_html") or "")[:300]
    product_type = product.get("product_type") or ""
    tags = ", ".join((product.get("tags") or "").split(",")[:8])
    variants = product.get("variants") or []
    price = variants[0].get("price", "") if variants else ""
    images = product.get("images") or []
    first_img = images[0] if images else {}
    img_url = first_img.get("src", "")

    prompt = f"""You are a senior Shopify SEO specialist for the store "{shop_name}".

Store context:
- Niche: {niche}
- Target audience: {target_audience}
- Brand style notes: {brand_style or "warm, trustworthy, gift-oriented"}

Product details:
- Title: {title}
- Type: {product_type}
- Tags: {tags}
- Price: ${price}
- Description snippet: {body_html}

Your task: Generate SEO-optimized content that reflects current Google search trends for this product category and maintains the store's brand voice.

Return ONLY valid JSON with these exact keys:
{{
  "seo_title": "SEO title 50-70 chars, lead with primary keyword, reflect current search intent",
  "meta_description": "Meta description 140-155 chars, compelling CTA, emotional hook for gift buyers",
  "alt_text": "Main image alt text under 125 chars, descriptive and keyword-rich",
  "structured_data": {{
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": "<product name>",
    "description": "<1-2 sentence product description>",
    "brand": {{"@type": "Brand", "name": "{shop_name}"}},
    "offers": {{
      "@type": "Offer",
      "priceCurrency": "USD",
      "price": "{price}",
      "availability": "https://schema.org/InStock",
      "seller": {{"@type": "Organization", "name": "{shop_name}"}}
    }}
  }}
}}"""

    messages = [{"role": "user", "content": prompt}]
    if img_url:
        messages = [{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": img_url}},
            {"type": "text", "text": prompt},
        ]}]

    try:
        resp = await ai.chat.completions.create(
            model=settings.ai_model,
            messages=messages,
            temperature=0.4,
        )
        raw = resp.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw.strip())

        schema = data.get("structured_data") or {}
        if img_url and schema:
            schema["image"] = img_url

        return {
            "shopify_product_id": pid,
            "title": title,
            "image_url": img_url,
            "images": [{"id": img["id"], "alt": img.get("alt", "")} for img in images[:3]],
            "current_seo_title": "",
            "current_meta_desc": "",
            "new_seo_title": data.get("seo_title", "")[:70],
            "new_meta_desc": data.get("meta_description", "")[:155],
            "new_alt_text": data.get("alt_text", "")[:125],
            "structured_data": schema,
        }
    except Exception as e:
        return {
            "shopify_product_id": pid,
            "title": title,
            "image_url": img_url,
            "images": [],
            "error": str(e),
        }


async def run_shopify_seo_optimize(task_id: int, shop_id: int, user_id: int, product_ids: list | None = None):
    """拉取 Shopify 商品 → 并发 AI 生成 SEO → 存预览，不自动写入 Shopify"""
    import asyncio
    _update_task(task_id, status="running", progress=5)
    try:
        conn = _db()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT domain, shopify_access_token AS access_token, name, niche, profile_summary, target_audience FROM shops WHERE id=%s AND user_id=%s AND is_deleted=0",
                    (shop_id, user_id)
                )
                shop = cur.fetchone()
        finally:
            conn.close()

        if not shop:
            _update_task(task_id, status="failed", error_message="店铺不存在或无权限")
            return
        if not shop.get("access_token"):
            _update_task(task_id, status="failed", error_message="店铺未配置 Access Token")
            return

        domain = shop["domain"]
        token = shop["access_token"]
        shop_name = shop.get("name") or domain
        niche = shop.get("niche") or "custom embroidery gifts"
        target_audience = shop.get("target_audience") or "US buyers looking for personalized gifts"
        brand_style = (shop.get("profile_summary") or "")[:600]

        _update_task(task_id, progress=15)
        from app.utils.shopify import list_products as _list_products
        all_products = await _list_products(domain, token, limit=250)

        if product_ids:
            pid_set = {int(x) for x in product_ids}
            all_products = [p for p in all_products if int(p["id"]) in pid_set]

        if not all_products:
            _update_task(task_id, status="failed", error_message="未找到商品，请检查店铺 Token 是否有效")
            return

        total = len(all_products)
        _update_task(task_id, progress=20)

        if not settings.ai_api_key:
            _update_task(task_id, status="failed", error_message="AI API Key 未配置")
            return

        # 并发 AI 调用（最多 10 个并发，避免超过 API 限流）
        sem = asyncio.Semaphore(10)
        async def _bounded(p):
            async with sem:
                return await _seo_one_product(p, shop_name, niche, target_audience, brand_style)

        results = await asyncio.gather(*[_bounded(p) for p in all_products])
        results = list(results)

        success_count = sum(1 for r in results if "error" not in r)
        _update_task(task_id, status="success", progress=100, output_data={
            "shop_id": shop_id,
            "domain": domain,
            "total": total,
            "success": success_count,
            "products": results,
        })

    except Exception as e:
        _update_task(task_id, status="failed", error_message=str(e))


# ── _run_seedance_video（火山引擎 ARK Seedance 2.0）──────────────────────────

def _run_seedance_video(task_id: int, image_url: str, prompt: str,
                        duration: int = 5, resolution: str = "720p"):
    """Seedance 2.0 视频生成：火山引擎 ARK API，异步轮询"""
    import time, os, uuid

    _update_task(task_id, progress=20)

    headers = {
        "Authorization": f"Bearer {settings.seedance_api_key}",
        "Content-Type": "application/json",
    }
    endpoint = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks"

    content = []
    if image_url and image_url.startswith("https://"):
        content.append({"type": "image_url", "image_url": {"url": image_url}})
    content.append({"type": "text", "text": prompt[:500]})

    payload = {
        "model": settings.seedance_model,
        "content": content,
        "parameters": {
            "duration": duration,
            "aspect_ratio": "16:9",
            "resolution": resolution,
        },
    }

    client_kwargs = {"timeout": 30, "trust_env": False}

    with httpx.Client(**client_kwargs) as client:
        resp = client.post(endpoint, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()

    sdk_task_id = data.get("id")
    if not sdk_task_id:
        _update_task(task_id, status="failed",
                     error_message=f"Seedance 创建任务失败: {json.dumps(data, ensure_ascii=False)}")
        return

    _update_task(task_id, progress=30)

    poll_url = f"https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{sdk_task_id}"
    poll_headers = {"Authorization": f"Bearer {settings.seedance_api_key}"}

    for i in range(36):  # 最多等 6 分钟（36 × 10s）
        time.sleep(10)
        with httpx.Client(**client_kwargs) as client:
            poll_data = client.get(poll_url, headers=poll_headers).json()

        status = poll_data.get("status", "")
        _update_task(task_id, progress=min(30 + (i + 1) * 2, 90))

        if status == "succeeded":
            contents = poll_data.get("content", [])
            video_url = None
            for c in contents:
                if c.get("type") == "video_url":
                    video_url = c.get("video_url", {}).get("url")
                    break
            if not video_url:
                _update_task(task_id, status="failed", error_message="Seedance 未返回视频 URL")
                return

            video_dir = os.path.join(os.path.dirname(__file__), "../../static/uploads/ai_videos")
            os.makedirs(video_dir, exist_ok=True)
            filename = f"{uuid.uuid4().hex}.mp4"
            with httpx.Client(timeout=120, trust_env=False) as client:
                r = client.get(video_url)
                with open(os.path.join(video_dir, filename), "wb") as f:
                    f.write(r.content)

            _update_task(task_id, status="success", progress=100, output_data={
                "video_url": f"/static/uploads/ai_videos/{filename}",
                "duration": duration,
            })
            return

        elif status in ("failed", "canceled"):
            err = poll_data.get("error", {}).get("message", status)
            _update_task(task_id, status="failed", error_message=f"Seedance 任务失败: {err}")
            return

    _update_task(task_id, status="failed", error_message="视频生成超时（6 分钟），请重试")


# ── run_image_processing（GPT-Image 2 图片深度处理）──────────────────────────

def run_image_processing(task_id: int, product_id: int, user_id: int, operations: list):
    """用 GPT-Image 2 对产品图做水印擦除 / 换背景 / 角标合成"""
    _update_task(task_id, status="running", progress=10)
    try:
        import base64, uuid, os
        from openai import OpenAI

        conn = _db()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT title, main_image FROM products WHERE id=%s AND is_deleted=0",
                    (product_id,)
                )
                product = cur.fetchone()
        finally:
            conn.close()

        if not product or not product.get("main_image"):
            _update_task(task_id, status="failed", error_message="商品不存在或无主图")
            return

        image_url = product["main_image"]
        title = product.get("title", "")

        # 拼接完整 URL（本地静态资源需加 host）
        if image_url.startswith("/static"):
            image_url = f"http://127.0.0.1:8000{image_url}"

        # 按操作类型生成 prompt
        op = operations[0] if operations else "change_background"
        if op == "remove_watermark":
            prompt = f"Remove all watermarks, brand logos, and text overlays from this product image. Keep the product intact and clean. Product: {title[:100]}"
        elif op == "change_background":
            prompt = f"Place this embroidery/textile product in a bright, clean lifestyle scene with a white or light neutral background. Keep the product as the focal point. Professional product photography style."
        elif op == "add_badge":
            prompt = f"Add a bold red discount badge with '30% OFF' text in the top-right corner of this product image. Keep the original product visible."
        else:
            prompt = f"Enhance this product image: remove background noise, improve lighting, make it suitable for e-commerce. Product: {title[:100]}"

        _update_task(task_id, progress=30)

        client = OpenAI(api_key=settings.ai_api_key, base_url=settings.ai_base_url)

        import httpx
        with httpx.Client(timeout=60) as hc:
            ref_resp = hc.get(image_url)
            ref_bytes = ref_resp.content

        resp = client.images.edit(
            model="openai/gpt-image-2",
            image=("product.png", ref_bytes, "image/png"),
            prompt=prompt,
            n=1,
            size="1024x1024",
            quality="low",
        )

        _update_task(task_id, progress=80)

        img_data = resp.data[0]
        upload_dir = os.path.join(os.path.dirname(__file__), "../../static/uploads/ai_images")
        os.makedirs(upload_dir, exist_ok=True)
        filename = f"{uuid.uuid4().hex}.png"
        filepath = os.path.join(upload_dir, filename)

        if img_data.b64_json:
            with open(filepath, "wb") as f:
                f.write(base64.b64decode(img_data.b64_json))
        elif img_data.url:
            with httpx.Client(timeout=60) as hc:
                r = hc.get(img_data.url)
                with open(filepath, "wb") as f:
                    f.write(r.content)
        else:
            _update_task(task_id, status="failed", error_message="模型未返回图片数据")
            return

        result_url = f"/static/uploads/ai_images/{filename}"

        _update_task(task_id, status="success", progress=100,
                     output_data={"image_url": result_url, "product_title": title,
                                  "operation": op, "product_id": product_id})

    except Exception as e:
        _update_task(task_id, status="failed", error_message=str(e))


# ── run_video_generation（视频生成，支持 wan2.7 / Seedance 2.0）──────────────

def run_video_generation(task_id: int, product_id: int, user_id: int,
                         duration: int = 5, resolution: str = "720p",
                         model: str = "doubao-seedance-2-0-260128"):
    """图生视频：支持 Seedance 2.0（火山引擎）和 wan2.7-i2v（阿里云）"""
    import time
    import os
    import uuid

    use_seedance = "seedance" in model

    if use_seedance and not settings.seedance_api_key:
        _update_task(task_id, status="failed", error_message="SEEDANCE_API_KEY 未配置，请在 .env 中设置")
        return
    if not use_seedance and not settings.dashscope_api_key:
        _update_task(task_id, status="failed",
                     error_message=(
                         "DASHSCOPE_API_KEY 未配置。"
                         "注册: https://bailian.aliyun.com/ 开通服务自动获得新人免费额度，"
                         "API Key: https://dashscope.console.aliyun.com/apiKey"
                     ))
        return

    try:
        _update_task(task_id, status="running", progress=10)

        conn = _db()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT title, main_image, category FROM products WHERE id = %s AND is_deleted = 0",
                    (product_id,),
                )
                product = cur.fetchone()
        finally:
            conn.close()

        if not product:
            _update_task(task_id, status="failed", error_message="商品不存在")
            return

        title = product["title"] or "product"
        image_url = product["main_image"] or ""
        category = product["category"] or ""

        prompt = (
            f"E-commerce product showcase. Product: {title}. Category: {category}. "
            "Smooth camera movement, bright studio lighting, commercial photography style, "
            "clean white background, no text overlay, professional quality."
        )

        if use_seedance:
            _run_seedance_video(task_id, image_url, prompt, duration, resolution)
            return

        headers = {
            "Authorization": f"Bearer {settings.dashscope_api_key}",
            "Content-Type": "application/json",
            "X-DashScope-Async": "enable",
        }
        # 绕过本地代理直连阿里云（trust_env=False 忽略 HTTPS_PROXY 环境变量）
        ds_client_kwargs = {"timeout": 30, "trust_env": False}

        endpoint = "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis"

        # 图生视频 or 文生视频
        if image_url.startswith("https://"):
            payload = {
                "model": "wan2.7-i2v",
                "input": {
                    "media": [{"type": "first_frame", "url": image_url}],
                    "prompt": prompt[:500],
                },
                "parameters": {"duration": duration},
            }
        else:
            payload = {
                "model": "wan2.1-t2v-turbo",
                "input": {"prompt": prompt[:500]},
                "parameters": {"duration": duration, "size": "1280*720"},
            }

        _update_task(task_id, progress=20)

        with httpx.Client(**ds_client_kwargs) as client:
            resp = client.post(endpoint, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()

        ds_task_id = data.get("output", {}).get("task_id")
        if not ds_task_id:
            _update_task(task_id, status="failed",
                         error_message=f"DashScope 创建任务失败: {json.dumps(data, ensure_ascii=False)}")
            return

        _update_task(task_id, progress=30)

        # 轮询，最多等 5 分钟（30 次 × 10 秒）
        poll_url = f"https://dashscope.aliyuncs.com/api/v1/tasks/{ds_task_id}"
        poll_headers = {"Authorization": f"Bearer {settings.dashscope_api_key}"}
        for i in range(30):
            time.sleep(10)
            with httpx.Client(**ds_client_kwargs) as client:
                poll_resp = client.get(poll_url, headers=poll_headers)
                poll_resp.raise_for_status()
                poll_data = poll_resp.json()

            ds_status = poll_data.get("output", {}).get("task_status", "")
            _update_task(task_id, progress=min(30 + (i + 1) * 2, 90))

            if ds_status == "SUCCEEDED":
                video_url = poll_data.get("output", {}).get("video_url")
                if not video_url:
                    _update_task(task_id, status="failed", error_message="DashScope 未返回视频 URL")
                    return

                video_dir = os.path.join(os.path.dirname(__file__), "../../static/uploads/ai_videos")
                os.makedirs(video_dir, exist_ok=True)
                filename = f"{uuid.uuid4().hex}.mp4"
                filepath = os.path.join(video_dir, filename)

                with httpx.Client(timeout=120, trust_env=False) as client:
                    video_resp = client.get(video_url)
                    with open(filepath, "wb") as f:
                        f.write(video_resp.content)

                _update_task(task_id, status="success", progress=100, output_data={
                    "video_url": f"/static/uploads/ai_videos/{filename}",
                    "product_id": product_id,
                    "product_title": title,
                    "duration": duration,
                    "resolution": resolution,
                })
                return

            elif ds_status in ("FAILED", "CANCELED"):
                err = poll_data.get("output", {}).get("message", ds_status)
                _update_task(task_id, status="failed",
                             error_message=f"DashScope 任务失败: {err}")
                return

        _update_task(task_id, status="failed", error_message="视频生成超时（5 分钟），请重试")

    except Exception as e:
        _update_task(task_id, status="failed", error_message=str(e))


# ── run_video_from_url（直接传图片URL，供 Shopify AI 页面使用）─────────────────

def run_video_from_url(task_id: int, image_url: str, title: str,
                       product_type: str = "", duration: int = 5,
                       model: str = "doubao-seedance-2-0-260128"):
    """图生视频：直接传入图片URL，无需 product_id（Shopify 商品用）"""
    import time, os, uuid

    use_seedance = "seedance" in model

    if use_seedance and not settings.seedance_api_key:
        _update_task(task_id, status="failed", error_message="SEEDANCE_API_KEY 未配置，请在 .env 中设置")
        return
    if not use_seedance and not settings.dashscope_api_key:
        _update_task(task_id, status="failed", error_message="DASHSCOPE_API_KEY 未配置")
        return

    try:
        _update_task(task_id, status="running", progress=10)

        prompt = (
            f"E-commerce product showcase. Product: {title}. Type: {product_type}. "
            "Smooth camera movement, bright studio lighting, commercial photography style, "
            "clean white background, no text overlay, professional quality."
        )

        if use_seedance:
            _run_seedance_video(task_id, image_url, prompt, duration)
            return

        headers = {
            "Authorization": f"Bearer {settings.dashscope_api_key}",
            "Content-Type": "application/json",
            "X-DashScope-Async": "enable",
        }
        ds_kwargs = {"timeout": 30, "trust_env": False}
        endpoint = "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis"

        if image_url.startswith("https://"):
            payload = {
                "model": "wan2.7-i2v",
                "input": {
                    "media": [{"type": "first_frame", "url": image_url}],
                    "prompt": prompt[:500],
                },
                "parameters": {"duration": duration},
            }
        else:
            payload = {
                "model": "wan2.1-t2v-turbo",
                "input": {"prompt": prompt[:500]},
                "parameters": {"duration": duration, "size": "1280*720"},
            }

        _update_task(task_id, progress=20)

        with httpx.Client(**ds_kwargs) as client:
            resp = client.post(endpoint, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()

        ds_task_id = data.get("output", {}).get("task_id")
        if not ds_task_id:
            _update_task(task_id, status="failed",
                         error_message=f"创建失败: {json.dumps(data, ensure_ascii=False)}")
            return

        _update_task(task_id, progress=30)

        poll_url = f"https://dashscope.aliyuncs.com/api/v1/tasks/{ds_task_id}"
        poll_headers = {"Authorization": f"Bearer {settings.dashscope_api_key}"}
        for i in range(30):
            time.sleep(10)
            with httpx.Client(**ds_kwargs) as client:
                d = client.get(poll_url, headers=poll_headers).json()

            status = d.get("output", {}).get("task_status", "")
            _update_task(task_id, progress=min(30 + (i + 1) * 2, 90))

            if status == "SUCCEEDED":
                video_url = d.get("output", {}).get("video_url")
                if not video_url:
                    _update_task(task_id, status="failed", error_message="未返回视频URL")
                    return

                video_dir = os.path.join(os.path.dirname(__file__), "../../static/uploads/ai_videos")
                os.makedirs(video_dir, exist_ok=True)
                filename = f"{uuid.uuid4().hex}.mp4"
                with httpx.Client(timeout=120, trust_env=False) as client:
                    r = client.get(video_url)
                    with open(os.path.join(video_dir, filename), "wb") as f:
                        f.write(r.content)

                _update_task(task_id, status="success", progress=100, output_data={
                    "video_url": f"/static/uploads/ai_videos/{filename}",
                    "title": title,
                    "duration": duration,
                })
                return

            elif status in ("FAILED", "CANCELED"):
                _update_task(task_id, status="failed",
                             error_message=d.get("output", {}).get("message", status))
                return

        _update_task(task_id, status="failed", error_message="视频生成超时，请重试")

    except Exception as e:
        _update_task(task_id, status="failed", error_message=str(e))
