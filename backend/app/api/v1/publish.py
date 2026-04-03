"""
改款上架 API — Modify product content and publish to Shopify.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from sqlalchemy import select
import math

from app.core.deps import CurrentUser, DBSession
from app.models.product import Product
from app.models.shop import Shop
from app.models.publish import PublishedProduct
from app.schemas.publish import PublishRequest, PublishedProductResponse
from app.schemas.common import Response, PagedResponse, PageInfo
from app.utils.shopify import create_product

router = APIRouter(prefix="/publish", tags=["Publish"])


@router.post("/", response_model=Response[PublishedProductResponse])
async def publish_product(body: PublishRequest, current_user_id: CurrentUser, db: DBSession):
    """
    改款上架：将选品大厅的商品发布到指定 Shopify 店铺。
    可选择性地覆盖标题、描述、价格（改款）。
    """
    # Fetch product
    prod_result = await db.execute(
        select(Product).where(Product.id == body.product_id, Product.is_deleted == False)
    )
    product = prod_result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="商品不存在")

    # Fetch shop (must belong to current user)
    shop_result = await db.execute(
        select(Shop).where(Shop.id == body.shop_id, Shop.user_id == current_user_id, Shop.is_deleted == False)
    )
    shop = shop_result.scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="店铺不存在或无权限")

    if not shop.access_token:
        raise HTTPException(status_code=400, detail="该店铺未配置 access token")

    # Resolve final content (override or use original)
    final_title = (body.title or product.title or "")[:255]
    final_description = body.description or product.description or ""
    final_price = body.price or product.price or 9.99
    final_tags = body.tags or ""
    final_product_type = body.product_type or product.category or ""
    size_variants = [{"size": v.size, "price": v.price} for v in body.variants] if body.variants else None

    # Create a record first (status=pending)
    record = PublishedProduct(
        user_id=current_user_id,
        shop_id=shop.id,
        product_id=product.id,
        published_title=final_title,
        published_description=final_description,
        published_price=final_price,
        status="pending",
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    # Push to Shopify
    try:
        shopify_product = await create_product(
            shop_domain=shop.domain,
            access_token=shop.access_token,
            title=final_title,
            description_html=final_description,
            price=final_price,
            image_url=product.main_image,
            extra_images=body.extra_images,
            product_type=final_product_type,
            tags=final_tags,
            vendor=product.brand or "",
            size_variants=size_variants,
        )
        record.shopify_product_id = str(shopify_product.get("id", ""))
        record.shopify_product_url = shopify_product.get("onlineStoreUrl") or f"https://{shop.domain}/products/{shopify_product.get('handle', '')}"
        record.status = "published"
        record.published_at = datetime.now(timezone.utc)
    except Exception as e:
        record.status = "failed"
        record.error_message = str(e)[:500]

    await db.commit()
    await db.refresh(record)

    if record.status == "failed":
        raise HTTPException(status_code=502, detail=f"Shopify 发布失败: {record.error_message}")

    return Response(data=PublishedProductResponse.model_validate(record), message="商品已成功上架")


@router.put("/{record_id}/price", response_model=Response[PublishedProductResponse])
async def update_publish_price(
    record_id: int,
    body: dict,
    current_user_id: CurrentUser,
    db: DBSession,
):
    """改价：同步更新 Shopify 上的商品价格"""
    new_price = body.get("price")
    if not new_price or float(new_price) <= 0:
        raise HTTPException(status_code=400, detail="价格无效")

    record = await db.get(PublishedProduct, record_id)
    if not record or record.user_id != current_user_id:
        raise HTTPException(status_code=404, detail="记录不存在")

    shop = await db.get(Shop, record.shop_id)
    if not shop or not shop.access_token:
        raise HTTPException(status_code=400, detail="店铺未配置 token")

    # 通过 REST API 更新所有 variant 价格
    if record.shopify_product_id:
        try:
            from app.utils.shopify import _headers
            import httpx
            API_VERSION = "2024-04"
            # 获取 variants
            url = f"https://{shop.domain}/admin/api/{API_VERSION}/products/{record.shopify_product_id}/variants.json"
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(url, headers=_headers(shop.access_token))
                if resp.status_code == 200:
                    variants = resp.json().get("variants", [])
                    for v in variants:
                        await client.put(
                            f"https://{shop.domain}/admin/api/{API_VERSION}/variants/{v['id']}.json",
                            json={"variant": {"id": v["id"], "price": str(new_price)}},
                            headers=_headers(shop.access_token),
                        )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Shopify 改价失败: {e}")

    record.published_price = float(new_price)
    await db.commit()
    await db.refresh(record)
    return Response(data=PublishedProductResponse.model_validate(record), message="价格已更新")


@router.delete("/{record_id}", response_model=Response[None])
async def unpublish_product(
    record_id: int,
    current_user_id: CurrentUser,
    db: DBSession,
):
    """下架：将 Shopify 商品状态改为 archived"""
    record = await db.get(PublishedProduct, record_id)
    if not record or record.user_id != current_user_id:
        raise HTTPException(status_code=404, detail="记录不存在")

    shop = await db.get(Shop, record.shop_id)
    if shop and shop.access_token and record.shopify_product_id:
        try:
            from app.utils.shopify import _headers
            import httpx
            API_VERSION = "2024-04"
            url = f"https://{shop.domain}/admin/api/{API_VERSION}/products/{record.shopify_product_id}.json"
            async with httpx.AsyncClient(timeout=15) as client:
                await client.put(
                    url,
                    json={"product": {"id": record.shopify_product_id, "status": "archived"}},
                    headers=_headers(shop.access_token),
                )
        except Exception:
            pass  # best-effort

    record.status = "archived"
    record.is_deleted = True
    await db.commit()
    return Response(message="已下架")


@router.get("/list", response_model=PagedResponse[PublishedProductResponse])
async def list_published(
    current_user_id: CurrentUser,
    db: DBSession,
    shop_id: int | None = None,
    page: int = 1,
    page_size: int = 20,
):
    """获取已上架商品列表"""
    q = select(PublishedProduct).where(
        PublishedProduct.user_id == current_user_id,
        PublishedProduct.is_deleted == False,
    ).order_by(PublishedProduct.created_at.desc())

    if shop_id:
        q = q.where(PublishedProduct.shop_id == shop_id)

    from sqlalchemy import func, select as sa_select
    total_result = await db.execute(sa_select(func.count()).select_from(q.subquery()))
    total = total_result.scalar() or 0

    result = await db.execute(q.offset((page - 1) * page_size).limit(page_size))
    records = result.scalars().all()

    return PagedResponse(
        data=[PublishedProductResponse.model_validate(r) for r in records],
        page_info=PageInfo(
            page=page, page_size=page_size, total=total,
            total_pages=math.ceil(total / page_size) if page_size else 1,
        ),
    )
