"""
Agent 后台任务执行器
- run_store_profile: 爬取店铺首页 → AI 分析 → 更新 shop profile
- run_auto_discovery: 根据店铺 niche 从商品库推荐匹配商品
每个任务更新 AgentTask.status / progress / output_data / error_message
"""
import json
import asyncio
from datetime import datetime
from sqlalchemy import select, or_
from app.core.database import AsyncSessionLocal
from app.models.agent_task import AgentTask
from app.models.shop import Shop
from app.models.product import Product
from app.core.config import settings


# ── 工具函数 ───────────────────────────────────────────────────────────────────

async def _update_task(task_id: int, **kwargs):
    from sqlalchemy import text
    set_parts = []
    values: dict = {"task_id": task_id}
    for k, v in kwargs.items():
        if isinstance(v, dict) or isinstance(v, list):
            v = json.dumps(v, ensure_ascii=False)
        set_parts.append(f"`{k}` = :{k}")
        values[k] = v
    if not set_parts:
        return
    sql = f"UPDATE agent_tasks SET {', '.join(set_parts)} WHERE id = :task_id"
    async with AsyncSessionLocal() as db:
        await db.execute(text(sql), values)
        await db.commit()


def _ai_client():
    from openai import AsyncOpenAI
    return AsyncOpenAI(api_key=settings.ai_api_key, base_url=settings.ai_base_url)


# ── store_profile ─────────────────────────────────────────────────────────────

async def run_store_profile(task_id: int, shop_id: int, user_id: int):
    """直接让 Gemini 通过店铺 URL 分析生成店铺画像，写回 shops 表（全程 raw SQL）"""
    from sqlalchemy import text
    await _update_task(task_id, status="running", progress=10)
    try:
        # 1. 取店铺信息（raw SQL，避免 ORM greenlet 问题）
        async with AsyncSessionLocal() as db:
            r = await db.execute(
                text("SELECT domain, name FROM shops WHERE id=:id AND user_id=:uid AND is_deleted=0"),
                {"id": shop_id, "uid": user_id}
            )
            row = r.fetchone()
        if not row:
            await _update_task(task_id, status="failed", error_message="店铺不存在")
            return
        domain, shop_name = row
        shop_url = f"https://{domain}" if not domain.startswith("http") else domain

        await _update_task(task_id, progress=30)

        # 2. AI 直接分析店铺 URL
        if not settings.ai_api_key:
            await _update_task(task_id, status="failed", error_message="AI API Key 未配置")
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
        await _update_task(task_id, progress=50)
        resp = await client.chat.completions.create(
            model="google/gemini-2.5-flash",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
        )
        raw = resp.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw.strip())

        await _update_task(task_id, progress=80)

        # 3. 写回 shop 表（raw SQL）
        async with AsyncSessionLocal() as db:
            await db.execute(text("""
                UPDATE shops SET
                    niche=:niche, target_audience=:ta,
                    price_range_min=:pmin, price_range_max=:pmax,
                    visual_style=:vs, profile_summary=:ps,
                    profile_generated_at=:pga, updated_at=NOW()
                WHERE id=:id
            """), {
                "niche": (data.get("niche") or "")[:255],
                "ta": data.get("target_audience") or "",
                "pmin": data.get("price_range_min"),
                "pmax": data.get("price_range_max"),
                "vs": (data.get("visual_style") or "")[:255],
                "ps": data.get("profile_summary") or "",
                "pga": datetime.utcnow().isoformat(),
                "id": shop_id,
            })
            await db.commit()

        await _update_task(task_id, status="success", progress=100,
                           output_data=data)

    except json.JSONDecodeError as e:
        await _update_task(task_id, status="failed", error_message=f"AI 返回格式异常: {e}")
    except Exception as e:
        await _update_task(task_id, status="failed", error_message=str(e))


# ── auto_discovery ────────────────────────────────────────────────────────────

async def run_auto_discovery(task_id: int, shop_id: int, user_id: int, count: int = 10):
    """根据店铺 niche 从商品库检索最匹配的商品"""
    await _update_task(task_id, status="running", progress=10)
    try:
        # 1. 获取店铺 niche
        async with AsyncSessionLocal() as db:
            shop = await db.get(Shop, shop_id)
            if not shop or shop.user_id != user_id:
                await _update_task(task_id, status="failed", error_message="店铺不存在")
                return
            niche = shop.niche or ""
            profile = shop.profile_summary or ""

        await _update_task(task_id, progress=20)

        if not niche and not profile:
            await _update_task(task_id, status="failed",
                               error_message="尚未生成店铺画像，请先运行「店铺诊脉」")
            return

        # 2. 从商品库关键词检索（分词匹配）
        keywords = [w.strip() for w in niche.replace(",", " ").split() if len(w.strip()) > 2]
        if not keywords:
            keywords = ["embroidery", "custom", "personalized"]

        async with AsyncSessionLocal() as db:
            conditions = [
                or_(*[Product.title.ilike(f"%{kw}%") for kw in keywords[:5]]),
            ]
            if shop.target_audience:
                # 用 category 辅助筛选
                pass

            q = (select(Product)
                 .where(Product.is_deleted == False)
                 .where(Product.main_image.isnot(None))
                 .where(Product.main_image != "")
                 .where(or_(*conditions))
                 .order_by(Product.ai_score.desc().nullslast())
                 .limit(count * 3))
            rows = (await db.execute(q)).scalars().all()

        await _update_task(task_id, progress=50)

        if not rows:
            # 无关键词匹配，退回到 ai_score 最高的商品
            async with AsyncSessionLocal() as db:
                q = (select(Product)
                     .where(Product.is_deleted == False)
                     .where(Product.main_image.isnot(None))
                     .order_by(Product.ai_score.desc().nullslast())
                     .limit(count))
                rows = (await db.execute(q)).scalars().all()

        # 3. 用 AI 二次排序（如果有 ai_api_key）
        candidates = [
            {"id": p.id, "title": p.title, "category": p.category or "",
             "price": p.price, "ai_score": p.ai_score or 0,
             "platform": p.source_platform}
            for p in rows
        ]

        recommended = candidates[:count]  # 默认取前 N
        reasons: dict[int, str] = {}

        if settings.ai_api_key and len(candidates) > count:
            await _update_task(task_id, progress=70)
            try:
                prompt = f"""You are a product selection expert for a Shopify dropshipping store.

Store profile:
- Niche: {niche}
- Target audience: {profile}

From the following candidate products, select the best {count} that match this store's niche and audience.

Candidates:
{json.dumps(candidates, ensure_ascii=False, indent=2)}

Return a JSON array of exactly {count} objects, each with:
{{
  "id": <product_id>,
  "reason": "1-2 sentences why this product matches the store"
}}

Return ONLY valid JSON array, no markdown."""

                client = _ai_client()
                resp = await client.chat.completions.create(
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
                # 按 AI 排序重排 candidates
                id_to_c = {c["id"]: c for c in candidates}
                recommended = [id_to_c[i] for i in ranked_ids if i in id_to_c][:count]
            except Exception:
                pass  # 降级为默认排序

        # 4. 合并 reason 写入 output
        output = [
            {**c, "rec_reason": reasons.get(c["id"], f"符合店铺 {niche} 定位")}
            for c in recommended
        ]

        await _update_task(task_id, status="success", progress=100,
                           output_data={"products": output, "niche": niche})

    except Exception as e:
        await _update_task(task_id, status="failed", error_message=str(e))
