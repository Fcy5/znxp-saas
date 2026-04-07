"""
Agent 后台任务执行器（同步版本，使用 pymysql 直连，避免 SQLAlchemy async greenlet 问题）
FastAPI BackgroundTasks 会把同步函数丢进线程池执行。
"""
import json
import pymysql
import pymysql.cursors
from datetime import datetime
from openai import OpenAI
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

def run_store_profile(task_id: int, shop_id: int, user_id: int):
    """Gemini 通过店铺 URL 直接生成店铺画像（同步，pymysql）"""
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

        _update_task(task_id, progress=30)

        # 2. AI 直接分析店铺 URL
        if not settings.ai_api_key:
            _update_task(task_id, status="failed", error_message="AI API Key 未配置")
            return

        prompt = f"""You are a professional e-commerce analyst specializing in Shopify stores.
Analyze the following Shopify store and generate a detailed store profile.

Store name: {shop_name}
Store URL: {shop_url}

Based on the store name, URL domain, and your knowledge of this brand/niche, generate a comprehensive profile.

Return a JSON object with exactly these keys:
{{
  "niche": "1-3 word product niche (e.g. 'custom embroidery', 'pet portraits', 'wedding gifts')",
  "target_audience": "2-3 sentences describing target customers (age, interests, occasions)",
  "price_range_min": <number, estimated lowest price in USD>,
  "price_range_max": <number, estimated highest price in USD>,
  "visual_style": "1-3 words describing visual style (e.g. 'rustic warm', 'minimalist modern', 'colorful playful')",
  "profile_summary": "3-4 sentences summarizing the store positioning, best-selling product types, and target market"
}}

Return ONLY valid JSON, no markdown, no explanation."""

        client = _ai_client()
        _update_task(task_id, progress=50)
        resp = client.chat.completions.create(
            model="google/gemini-2.5-pro",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
        )
        raw = resp.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw.strip())

        _update_task(task_id, progress=80)

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
