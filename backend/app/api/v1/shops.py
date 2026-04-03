from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from app.core.deps import CurrentUser, DBSession
from app.models.shop import Shop
from app.schemas.shop import ShopCreateRequest, ShopUpdateRequest, ShopResponse
from app.schemas.common import Response
from app.utils.shopify import verify_token

router = APIRouter(prefix="/shops", tags=["Shops"])


@router.get("/", response_model=Response[list[ShopResponse]])
async def list_shops(current_user_id: CurrentUser, db: DBSession):
    """获取用户绑定的所有店铺"""
    result = await db.execute(
        select(Shop).where(Shop.user_id == current_user_id, Shop.is_deleted == False)
    )
    shops = result.scalars().all()
    return Response(data=[ShopResponse.model_validate(s) for s in shops])


@router.post("/", response_model=Response[ShopResponse])
async def create_shop(body: ShopCreateRequest, current_user_id: CurrentUser, db: DBSession):
    """绑定新店铺"""
    # Check domain uniqueness for this user
    existing = await db.execute(
        select(Shop).where(Shop.user_id == current_user_id, Shop.domain == body.domain, Shop.is_deleted == False)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="该店铺域名已绑定")

    # Verify the token works
    ok = await verify_token(body.domain, body.access_token)
    if not ok:
        raise HTTPException(status_code=400, detail="Shopify access token 验证失败，请检查 domain 和 token")

    shop = Shop(
        user_id=current_user_id,
        name=body.name,
        domain=body.domain,
        platform=body.platform,
        access_token=body.access_token,
    )
    db.add(shop)
    await db.commit()
    await db.refresh(shop)
    return Response(data=ShopResponse.model_validate(shop), message="店铺绑定成功")


@router.put("/{shop_id}", response_model=Response[ShopResponse])
async def update_shop(shop_id: int, body: ShopUpdateRequest, current_user_id: CurrentUser, db: DBSession):
    """更新店铺信息"""
    result = await db.execute(
        select(Shop).where(Shop.id == shop_id, Shop.user_id == current_user_id, Shop.is_deleted == False)
    )
    shop = result.scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="店铺不存在")

    if body.name is not None:
        shop.name = body.name
    if body.access_token is not None:
        ok = await verify_token(shop.domain, body.access_token)
        if not ok:
            raise HTTPException(status_code=400, detail="Shopify access token 验证失败")
        shop.access_token = body.access_token

    await db.commit()
    await db.refresh(shop)
    return Response(data=ShopResponse.model_validate(shop), message="更新成功")


@router.delete("/{shop_id}", response_model=Response[None])
async def delete_shop(shop_id: int, current_user_id: CurrentUser, db: DBSession):
    """解绑店铺"""
    result = await db.execute(
        select(Shop).where(Shop.id == shop_id, Shop.user_id == current_user_id, Shop.is_deleted == False)
    )
    shop = result.scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="店铺不存在")

    shop.is_deleted = True
    await db.commit()
    return Response(message="店铺已解绑")


@router.post("/{shop_id}/verify", response_model=Response[None])
async def verify_shop(shop_id: int, current_user_id: CurrentUser, db: DBSession):
    """验证店铺 token 是否有效"""
    result = await db.execute(
        select(Shop).where(Shop.id == shop_id, Shop.user_id == current_user_id, Shop.is_deleted == False)
    )
    shop = result.scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="店铺不存在")

    ok = await verify_token(shop.domain, shop.access_token or "")
    if not ok:
        raise HTTPException(status_code=400, detail="Token 已失效，请重新绑定")
    return Response(message="Token 有效")
