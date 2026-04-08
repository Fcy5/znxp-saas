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
                     output_data={"products": output, "niche": niche})

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
