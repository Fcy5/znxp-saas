import json
from fastapi import APIRouter, HTTPException, BackgroundTasks
from sqlalchemy import select
from app.core.deps import CurrentUser, DBSession
from app.core.config import settings
from app.models.product import Product
from app.models.agent_task import AgentTask
from app.schemas.agent import (
    StoreProfileRequest, AutoDiscoveryRequest, BatchCopywritingRequest,
    CopywritingRequest, CopywritingResult,
    ImageProcessRequest, ImageGenerateRequest, ImageGenerateResult,
    SocialCopyRequest, SocialCopyResult,
    VideoGenerationRequest, PublishRequest,
    ShopifySeoOptimizeRequest, ShopifySeoApplyRequest, ShopifySeoApplyResult,
    AgentTaskResponse,
)
from app.schemas.common import Response

router = APIRouter(prefix="/agent", tags=["AI Agent"])


# ── 工具：创建 AgentTask 记录 ─────────────────────────────────────────────────

async def _create_task(db, user_id: int, task_type: str,
                       product_id: int | None = None,
                       shop_id: int | None = None,
                       input_data: dict | None = None) -> AgentTask:
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    task = AgentTask(
        user_id=user_id,
        task_type=task_type,
        status="pending",
        progress=0,
        product_id=product_id,
        shop_id=shop_id,
        input_data=input_data,
        created_at=now,
        updated_at=now,
    )
    db.add(task)
    await db.flush()   # 获取自增 id
    return task


def _task_resp(task: AgentTask) -> AgentTaskResponse:
    return AgentTaskResponse(
        id=task.id,
        task_type=task.task_type,
        status=task.status,
        progress=task.progress,
        output_data=task.output_data,
        error_message=task.error_message,
        created_at=str(task.created_at),
    )


# ── store_profile ─────────────────────────────────────────────────────────────

@router.post("/store-profile", response_model=Response[AgentTaskResponse])
async def trigger_store_profile(
    body: StoreProfileRequest,
    background_tasks: BackgroundTasks,
    current_user_id: CurrentUser,
    db: DBSession,
):
    """爬取店铺首页 → AI 分析 → 生成店铺画像（异步执行）"""
    from app.models.shop import Shop
    from sqlalchemy import select as sa_select

    # 找到对应店铺
    shop = (await db.execute(
        sa_select(Shop).where(Shop.domain == body.shop_domain, Shop.user_id == current_user_id)
    )).scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="店铺不存在，请先在「我的店铺」中添加")

    task = await _create_task(db, current_user_id, "store_profile",
                              shop_id=shop.id,
                              input_data={"shop_domain": body.shop_domain})
    await db.commit()

    from app.services.agent_tasks import run_store_profile
    background_tasks.add_task(run_store_profile, task.id, shop.id, current_user_id)

    return Response(data=_task_resp(task), message="店铺诊脉已启动，请稍后查看结果")


# ── auto_discovery ────────────────────────────────────────────────────────────

@router.post("/auto-discovery", response_model=Response[AgentTaskResponse])
async def trigger_auto_discovery(
    body: AutoDiscoveryRequest,
    background_tasks: BackgroundTasks,
    current_user_id: CurrentUser,
    db: DBSession,
):
    """基于店铺画像智能推品（异步执行）"""
    task = await _create_task(db, current_user_id, "auto_discovery",
                              shop_id=body.shop_id,
                              input_data={"shop_id": body.shop_id, "count": body.count})
    await db.commit()

    from app.services.agent_tasks import run_auto_discovery
    background_tasks.add_task(run_auto_discovery, task.id, body.shop_id, current_user_id, body.count)

    return Response(data=_task_resp(task), message="智能推品已启动，请稍后查看结果")


# ── batch_copywriting（异步）─────────────────────────────────────────────────

@router.post("/batch-copywriting", response_model=Response[AgentTaskResponse])
async def trigger_batch_copywriting(
    body: BatchCopywritingRequest,
    background_tasks: BackgroundTasks,
    current_user_id: CurrentUser,
    db: DBSession,
):
    """批量为选品库商品生成 SEO & GEO 文案（异步执行）"""
    task = await _create_task(db, current_user_id, "batch_copywriting",
                              shop_id=body.shop_id,
                              input_data={"shop_id": body.shop_id, "count": body.count})
    await db.commit()

    from app.services.agent_tasks import run_batch_copywriting
    background_tasks.add_task(run_batch_copywriting, task.id, current_user_id, body.product_ids, body.shop_id)

    return Response(data=_task_resp(task), message="批量文案生成已启动，请稍后查看结果")


# ── copywriting（同步，直接返回）─────────────────────────────────────────────

@router.post("/copywriting", response_model=Response[CopywritingResult])
async def trigger_copywriting(body: CopywritingRequest, current_user_id: CurrentUser, db: DBSession):
    """SEO & GEO 双擎文案重构（同步直接返回）"""
    if not settings.ai_api_key:
        raise HTTPException(status_code=503, detail="AI API Key 未配置，请在系统设置中填写")

    product = (await db.execute(
        select(Product).where(Product.id == body.product_id, Product.is_deleted == False)
    )).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="商品不存在")

    lang_hint = "English" if body.language == "en" else "Chinese"
    img_url = product.main_image or ""
    img_note = f"- Product image URL (for reference): {img_url}" if img_url else ""

    prompt = f"""You are an expert e-commerce copywriter specializing in SEO and AI search (GEO).
Generate marketing copy for the following product in {lang_hint}.

Product info:
- Title: {product.title}
- Category: {product.category or ""}
- Price: ${product.price or ""}
- Platform: {product.source_platform}
- Original description: {product.description or ""}
{img_note}

Return a JSON object with exactly these keys:
{{
  "seo_title": "SEO-optimized product title (under 70 chars, include primary keyword)",
  "meta_description": "Meta description (under 155 chars, compelling CTA)",
  "html_description": "Full HTML product description with <h2>, <p>, <ul>, and a Q&A section using <h3>Q:</h3><p>A:</p> format. Min 300 words.",
  "alt_tags": ["alt tag for main image", "alt tag for lifestyle image", "alt tag for detail image"]
}}

Rules:
- Base the copy on the original product title and description above
- Include long-tail keywords naturally
- Make it suitable for AI search engines (GEO): use clear facts, Q&A format
- Target US market, English buyers
- Tone: warm, trustworthy, gift-oriented
- Return ONLY valid JSON, no markdown code blocks"""

    messages: list = [{"role": "user", "content": prompt}]
    if img_url and img_url.startswith("http"):
        messages = [{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": img_url}},
            {"type": "text", "text": prompt},
        ]}]

    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.ai_api_key, base_url=settings.ai_base_url)
        try:
            resp = client.chat.completions.create(
                model=body.model or settings.ai_model,
                messages=messages,
                temperature=0.7,
            )
        except Exception:
            resp = client.chat.completions.create(
                model=body.model or settings.ai_model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
            )
        raw = resp.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw.strip())
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"模型返回格式异常: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 调用失败: {e}")

    return Response(data=CopywritingResult(
        seo_title=data.get("seo_title", product.title),
        meta_description=data.get("meta_description", ""),
        html_description=data.get("html_description", ""),
        alt_tags=data.get("alt_tags", []),
    ), message="文案生成成功")


# ── image-generate（同步）────────────────────────────────────────────────────

@router.post("/image-generate", response_model=Response[ImageGenerateResult])
async def image_generate(body: ImageGenerateRequest, current_user_id: CurrentUser):
    """AI 图片生成/编辑，返回保存到本地的静态资源路径"""
    if not settings.ai_api_key:
        raise HTTPException(status_code=503, detail="AI API Key 未配置")

    try:
        import base64, uuid, os, io, httpx
        from openai import OpenAI
        client = OpenAI(api_key=settings.ai_api_key, base_url=settings.ai_base_url)

        upload_dir = os.path.join(os.path.dirname(__file__), "../../../static/uploads/ai_images")
        os.makedirs(upload_dir, exist_ok=True)
        filename = f"{uuid.uuid4().hex}.png"
        filepath = os.path.join(upload_dir, filename)

        ref_url = body.reference_image_url if (body.reference_image_url and body.reference_image_url.startswith("http")) else None

        if ref_url:
            # 图生图：先让视觉模型描述参考图，再用描述+prompt 文生图
            vision_resp = client.chat.completions.create(
                model="google/gemini-2.5-flash",
                messages=[{"role": "user", "content": [
                    {"type": "image_url", "image_url": {"url": ref_url}},
                    {"type": "text", "text": "Describe this product image in detail for use as an image generation prompt. Include: product type, colors, style, materials, background, lighting, mood. Return only the description, no extra text."},
                ]}],
            )
            img_description = vision_resp.choices[0].message.content.strip()
            final_prompt = f"{img_description}. Style requirement: {body.prompt}"
        else:
            final_prompt = body.prompt

        resp = client.images.generate(
            model=body.model,
            prompt=final_prompt[:4000],
            n=1,
            size=body.size,
        )

        img_data = resp.data[0]
        if img_data.b64_json:
            with open(filepath, "wb") as f:
                f.write(base64.b64decode(img_data.b64_json))
        elif img_data.url:
            async with httpx.AsyncClient(timeout=60) as hc:
                r = await hc.get(img_data.url)
                with open(filepath, "wb") as f:
                    f.write(r.content)
        else:
            raise Exception("模型未返回图片数据")

        url = f"/static/uploads/ai_images/{filename}"
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"图片生成失败: {e}")

    return Response(data=ImageGenerateResult(url=url), message="图片生成成功")


# ── social-copy（同步）───────────────────────────────────────────────────────

@router.post("/social-copy", response_model=Response[SocialCopyResult])
async def generate_social_copy(body: SocialCopyRequest, current_user_id: CurrentUser, db: DBSession):
    """生成 TikTok / Facebook / Instagram 社媒文案"""
    if not settings.ai_api_key:
        raise HTTPException(status_code=503, detail="AI API Key 未配置")

    product = (await db.execute(
        select(Product).where(Product.id == body.product_id, Product.is_deleted == False)
    )).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="商品不存在")

    img_url = product.main_image or ""
    img_note = f"- Product image: {img_url}" if img_url else ""

    prompt = f"""You are a viral social media copywriter for e-commerce.
Write social media captions for this product targeting US buyers.
Base the copy on the actual product information and image provided below.

Product: {product.title}
Category: {product.category or ""}
Price: ${product.price or ""}
Original description: {(product.description or "")[:300]}
{img_note}

Return a JSON object with exactly these keys:
{{
  "tiktok": "TikTok video caption (under 150 chars, hook + emoji + 3-5 hashtags, viral POV style, based on actual product)",
  "facebook": "Facebook ad copy (2-3 sentences, emotional storytelling, CTA, 1-2 hashtags, based on actual product)",
  "instagram": "Instagram caption (engaging opener, 2-3 sentences, line breaks, 8-10 hashtags, based on actual product)"
}}

Return ONLY valid JSON, no markdown."""

    social_messages: list = [{"role": "user", "content": prompt}]
    if img_url and img_url.startswith("http"):
        social_messages = [{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": img_url}},
            {"type": "text", "text": prompt},
        ]}]

    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.ai_api_key, base_url=settings.ai_base_url)
        try:
            resp = client.chat.completions.create(
                model=body.model or settings.ai_model,
                messages=social_messages,
                temperature=0.8,
            )
        except Exception:
            resp = client.chat.completions.create(
                model=body.model or settings.ai_model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.8,
            )
        raw = resp.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw.strip())
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"模型返回格式异常: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 调用失败: {e}")

    return Response(data=SocialCopyResult(
        tiktok=data.get("tiktok", ""),
        facebook=data.get("facebook", ""),
        instagram=data.get("instagram", ""),
    ), message="社媒文案生成成功")


# ── image-process（TODO）─────────────────────────────────────────────────────

@router.post("/image-process", response_model=Response[AgentTaskResponse])
async def trigger_image_process(
    body: ImageProcessRequest,
    background_tasks: BackgroundTasks,
    current_user_id: CurrentUser,
    db: DBSession,
):
    """图片深度处理（水印擦除 / AI 换背景 / 广告主图）"""
    task = await _create_task(db, current_user_id, "image_processing",
                              product_id=body.product_id,
                              input_data={"operations": body.operations})
    await db.commit()
    # TODO: 接入 Google Imagen / 其他图片处理 API
    return Response(data=_task_resp(task), message="图片处理任务已创建（功能开发中）")


# ── video-generation（TODO）──────────────────────────────────────────────────

@router.post("/video-generation", response_model=Response[AgentTaskResponse])
async def trigger_video_generation(
    body: VideoGenerationRequest,
    background_tasks: BackgroundTasks,
    current_user_id: CurrentUser,
    db: DBSession,
):
    """视频全自动二创（功能开发中）"""
    task = await _create_task(db, current_user_id, "video_generation",
                              product_id=body.product_id,
                              input_data={"variant_count": body.variant_count})
    await db.commit()
    return Response(data=_task_resp(task), message=f"视频生成任务已创建（功能开发中）")


# ── publish（TODO）───────────────────────────────────────────────────────────

@router.post("/publish", response_model=Response[AgentTaskResponse])
async def trigger_publish(
    body: PublishRequest,
    background_tasks: BackgroundTasks,
    current_user_id: CurrentUser,
    db: DBSession,
):
    """一键上架到 Shopify（通过 /publish/ 接口完成，此处保留任务记录）"""
    task = await _create_task(db, current_user_id, "publish",
                              product_id=body.product_id,
                              shop_id=body.shop_id)
    await db.commit()
    return Response(data=_task_resp(task), message="上架任务已创建")


# ── shopify 商品列表（无 AI，纯拉取）────────────────────────────────────────────

@router.get("/shopify-products", response_model=Response[list])
async def list_shopify_products(
    shop_id: int,
    current_user_id: CurrentUser,
    db: DBSession,
):
    """从 Shopify 拉取商品列表（不调 AI），供用户勾选后再优化"""
    from app.models.shop import Shop as ShopModel
    from app.utils.shopify import list_products

    shop = (await db.execute(
        select(ShopModel).where(ShopModel.id == shop_id, ShopModel.user_id == current_user_id, ShopModel.is_deleted == False)
    )).scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="店铺不存在")
    if not shop.access_token:
        raise HTTPException(status_code=400, detail="店铺未配置 Access Token")

    try:
        products = await list_products(shop.domain, shop.access_token, limit=250)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Shopify 请求失败: {e}")

    result = []
    for p in products:
        images = p.get("images") or []
        result.append({
            "shopify_product_id": p["id"],
            "title": p.get("title") or "",
            "image_url": images[0].get("src", "") if images else "",
            "status": p.get("status", "active"),
        })
    return Response(data=result)


# ── shopify_seo_optimize ──────────────────────────────────────────────────────

@router.post("/shopify-seo-optimize", response_model=Response[AgentTaskResponse])
async def trigger_shopify_seo_optimize(
    body: ShopifySeoOptimizeRequest,
    background_tasks: BackgroundTasks,
    current_user_id: CurrentUser,
    db: DBSession,
):
    """拉取 Shopify 商品 → AI 生成 SEO 预览（异步）"""
    task = await _create_task(db, current_user_id, "shopify_seo_optimize",
                              shop_id=body.shop_id,
                              input_data={"shop_id": body.shop_id, "product_ids": body.product_ids})
    await db.commit()

    from app.services.agent_tasks import run_shopify_seo_optimize
    background_tasks.add_task(run_shopify_seo_optimize, task.id, body.shop_id, current_user_id, body.product_ids)

    return Response(data=_task_resp(task), message="SEO 优化分析已启动，请稍后查看预览")


@router.post("/shopify-seo-apply", response_model=Response[ShopifySeoApplyResult])
async def apply_shopify_seo(
    body: ShopifySeoApplyRequest,
    current_user_id: CurrentUser,
    db: DBSession,
):
    """将用户确认的 SEO 方案写入 Shopify（同步）"""
    from app.models.shop import Shop
    from app.models.agent_task import AgentTask as AgentTaskModel
    import json as _json

    shop = (await db.execute(
        select(Shop).where(Shop.id == body.shop_id, Shop.user_id == current_user_id, Shop.is_deleted == False)
    )).scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="店铺不存在")
    if not shop.access_token:
        raise HTTPException(status_code=400, detail="店铺未配置 Access Token")

    task = await db.get(AgentTaskModel, body.task_id)
    if not task or task.user_id != current_user_id:
        raise HTTPException(status_code=404, detail="任务不存在")

    output = task.output_data or {}
    products = output.get("products", [])
    selected_set = set(body.selected_shopify_ids)
    to_apply = [p for p in products if p.get("shopify_product_id") in selected_set and "error" not in p]

    from app.utils.shopify import update_product_seo
    success, failed, errors = 0, 0, []
    for p in to_apply:
        try:
            image_alts = []
            if p.get("images") and p.get("new_alt_text"):
                image_alts = [{"id": p["images"][0]["id"], "alt": p["new_alt_text"]}]
            await update_product_seo(
                shop.domain, shop.access_token,
                p["shopify_product_id"],
                p["new_seo_title"], p["new_meta_desc"],
                image_alts or None,
            )
            success += 1
        except Exception as e:
            failed += 1
            errors.append(f"{p.get('title', p['shopify_product_id'])}: {e}")

    return Response(
        data=ShopifySeoApplyResult(total=len(to_apply), success=success, failed=failed, errors=errors),
        message=f"已成功更新 {success} 件商品 SEO",
    )


# ── 任务查询 ──────────────────────────────────────────────────────────────────

@router.get("/tasks", response_model=Response[list[AgentTaskResponse]])
async def list_tasks(
    current_user_id: CurrentUser, db: DBSession,
    shop_id: int | None = None,
    task_type: str | None = None,
):
    """获取当前用户 Agent 任务，支持按 shop_id / task_type 过滤（最近 50 条）"""
    q = select(AgentTask).where(
        AgentTask.user_id == current_user_id,
        AgentTask.is_deleted == False,
    )
    if shop_id is not None:
        q = q.where(AgentTask.shop_id == shop_id)
    if task_type is not None:
        q = q.where(AgentTask.task_type == task_type)
    result = await db.execute(q.order_by(AgentTask.created_at.desc()).limit(50))
    tasks = result.scalars().all()
    return Response(data=[_task_resp(t) for t in tasks])


@router.get("/tasks/{task_id}", response_model=Response[AgentTaskResponse])
async def get_task(task_id: int, current_user_id: CurrentUser, db: DBSession):
    """轮询单个任务进度"""
    task = await db.get(AgentTask, task_id)
    if not task or task.user_id != current_user_id:
        raise HTTPException(status_code=404, detail="任务不存在")
    return Response(data=_task_resp(task))
