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
    async with AsyncSessionLocal() as db:
        task = await db.get(AgentTask, task_id)
        if task:
            for k, v in kwargs.items():
                setattr(task, k, v)
            await db.commit()


def _ai_client():
    from openai import AsyncOpenAI
    return AsyncOpenAI(api_key=settings.ai_api_key, base_url=settings.ai_base_url)


# ── store_profile ─────────────────────────────────────────────────────────────

async def run_store_profile(task_id: int, shop_id: int, user_id: int):
    """爬取店铺首页内容，用 AI 生成店铺画像，写回 shops 表"""
    await _update_task(task_id, status="running", progress=10)
    try:
        # 1. 取店铺信息
        async with AsyncSessionLocal() as db:
            shop = await db.get(Shop, shop_id)
            if not shop or shop.user_id != user_id:
                await _update_task(task_id, status="failed", error_message="店铺不存在")
                return
            domain = shop.domain
            shop_name = shop.name

        await _update_task(task_id, progress=20)

        # 2. 爬取店铺首页
        import httpx
        shop_url = domain if domain.startswith("http") else f"https://{domain}"
        page_text = ""
        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as hc:
                r = await hc.get(shop_url, headers={"User-Agent": "Mozilla/5.0"})
                # 取前 8000 字符，去掉 HTML 标签
                import re
                raw = r.text[:12000]
                page_text = re.sub(r"<[^>]+>", " ", raw)
                page_text = re.sub(r"\s+", " ", page_text).strip()[:6000]
        except Exception as e:
            page_text = f"(无法获取页面: {e})"

        await _update_task(task_id, progress=50)

        # 3. AI 分析
        if not settings.ai_api_key:
            await _update_task(task_id, status="failed", error_message="AI API Key 未配置")
            return

        prompt = f"""You are an e-commerce analyst. Analyze this Shopify store and generate a store profile.

Store name: {shop_name}
Store URL: {shop_url}
Page content (excerpt):
{page_text}

Return a JSON object with exactly these keys:
{{
  "niche": "1-3 word product niche (e.g. 'custom embroidery', 'pet portraits', 'wedding gifts')",
  "target_audience": "2-3 sentences describing target customers (age, interests, occasions)",
  "price_range_min": <number, typical lowest price in USD>,
  "price_range_max": <number, typical highest price in USD>,
  "visual_style": "1-3 words describing visual style (e.g. 'rustic warm', 'minimalist modern', 'colorful playful')",
  "profile_summary": "3-4 sentences summarizing the store's positioning, best-selling products, and target market"
}}

Return ONLY valid JSON, no markdown."""

        client = _ai_client()
        resp = await client.chat.completions.create(
            model=settings.ai_model,
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

        # 4. 写回 shop 表
        async with AsyncSessionLocal() as db:
            shop = await db.get(Shop, shop_id)
            if shop:
                shop.niche = data.get("niche", "")[:255]
                shop.target_audience = data.get("target_audience", "")
                shop.price_range_min = data.get("price_range_min")
                shop.price_range_max = data.get("price_range_max")
                shop.visual_style = data.get("visual_style", "")[:255]
                shop.profile_summary = data.get("profile_summary", "")
                shop.profile_generated_at = datetime.utcnow().isoformat()
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
