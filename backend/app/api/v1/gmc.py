"""
Google Merchant Center API 集成
- OAuth2 授权流程
- 商品推送（Merchant API v1beta）
- GMC 状态同步
"""
import json
import urllib.parse
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import text

from app.core.config import settings
from app.core.deps import CurrentUser, DBSession
from app.schemas.common import Response

router = APIRouter(prefix="/gmc", tags=["Google Merchant Center"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
MERCHANT_BASE = "https://merchantapi.googleapis.com/merchant/v1beta"
SCOPES = "https://www.googleapis.com/auth/content"


# ── OAuth helpers ─────────────────────────────────────────────────────────────

def _redirect_uri() -> str:
    base = "https://znxp-sass.vqmjc.cc" if settings.app_env == "production" else "http://localhost:8000"
    return f"{base}/api/v1/gmc/oauth/callback"


async def _get_tokens(db, user_id: int) -> dict | None:
    row = (await db.execute(
        text("SELECT access_token, refresh_token, token_expiry, datasource_id FROM google_oauth_tokens WHERE user_id=:uid"),
        {"uid": user_id}
    )).mappings().one_or_none()
    return dict(row) if row else None


async def _save_tokens(db, user_id: int, access_token: str, refresh_token: str,
                       expires_in: int, datasource_id: str | None = None):
    expiry = datetime.now(timezone.utc) + timedelta(seconds=expires_in - 60)
    existing = (await db.execute(
        text("SELECT id FROM google_oauth_tokens WHERE user_id=:uid"), {"uid": user_id}
    )).one_or_none()

    if existing:
        await db.execute(text("""
            UPDATE google_oauth_tokens
            SET access_token=:at, refresh_token=:rt, token_expiry=:exp,
                datasource_id=COALESCE(:ds, datasource_id), updated_at=NOW()
            WHERE user_id=:uid
        """), {"at": access_token, "rt": refresh_token, "exp": expiry,
               "ds": datasource_id, "uid": user_id})
    else:
        await db.execute(text("""
            INSERT INTO google_oauth_tokens (user_id, access_token, refresh_token, token_expiry, datasource_id)
            VALUES (:uid, :at, :rt, :exp, :ds)
        """), {"uid": user_id, "at": access_token, "rt": refresh_token,
               "exp": expiry, "ds": datasource_id})
    await db.commit()


async def _get_valid_access_token(db, user_id: int) -> str:
    tokens = await _get_tokens(db, user_id)
    if not tokens or not tokens.get("refresh_token"):
        raise HTTPException(status_code=401, detail="未连接 Google 账号，请先授权")

    expiry = tokens["token_expiry"]
    if expiry and expiry.replace(tzinfo=timezone.utc) > datetime.now(timezone.utc):
        return tokens["access_token"]

    # refresh
    async with httpx.AsyncClient(trust_env=False) as client:
        resp = await client.post(GOOGLE_TOKEN_URL, data={
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "refresh_token": tokens["refresh_token"],
            "grant_type": "refresh_token",
        })
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Google token 刷新失败，请重新授权")

    data = resp.json()
    access_token = data["access_token"]
    expires_in = data.get("expires_in", 3600)

    existing = (await db.execute(
        text("SELECT datasource_id FROM google_oauth_tokens WHERE user_id=:uid"), {"uid": user_id}
    )).mappings().one_or_none()
    ds = existing["datasource_id"] if existing else None

    await _save_tokens(db, user_id, access_token, tokens["refresh_token"], expires_in, ds)
    return access_token


# ── OAuth endpoints ───────────────────────────────────────────────────────────

@router.get("/oauth/url")
async def get_oauth_url(current_user_id: CurrentUser):
    """返回 Google OAuth 授权 URL"""
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": _redirect_uri(),
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "state": str(current_user_id),
    }
    url = GOOGLE_AUTH_URL + "?" + urllib.parse.urlencode(params)
    return Response(data={"url": url})


@router.get("/oauth/callback")
async def oauth_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: DBSession = None,
):
    """Google OAuth 回调，交换 code 换 tokens"""
    user_id = int(state)

    async with httpx.AsyncClient(trust_env=False) as client:
        resp = await client.post(GOOGLE_TOKEN_URL, data={
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": _redirect_uri(),
            "grant_type": "authorization_code",
        })

    if resp.status_code != 200:
        return RedirectResponse(url="/gmc?error=oauth_failed")

    data = resp.json()
    await _save_tokens(
        db, user_id,
        data["access_token"],
        data.get("refresh_token", ""),
        data.get("expires_in", 3600),
    )
    return RedirectResponse(url="/gmc?connected=1")


@router.get("/status")
async def get_connection_status(current_user_id: CurrentUser, db: DBSession):
    """检查是否已连接 Google"""
    tokens = await _get_tokens(db, current_user_id)
    connected = bool(tokens and tokens.get("refresh_token"))
    datasource_ready = bool(tokens and tokens.get("datasource_id")) if connected else False
    return Response(data={
        "connected": connected,
        "datasource_ready": datasource_ready,
        "merchant_id": settings.google_merchant_id,
    })


# ── Data Source setup ─────────────────────────────────────────────────────────

@router.post("/setup-datasource")
async def setup_datasource(current_user_id: CurrentUser, db: DBSession):
    """在 GMC 创建 API 类型的 Primary Data Source（只需执行一次）"""
    access_token = await _get_valid_access_token(db, current_user_id)
    merchant_id = settings.google_merchant_id

    # 先查是否已有
    tokens = await _get_tokens(db, current_user_id)
    if tokens and tokens.get("datasource_id"):
        return Response(data={"datasource_id": tokens["datasource_id"]}, message="Data Source 已存在")

    async with httpx.AsyncClient(trust_env=False) as client:
        resp = await client.post(
            f"{MERCHANT_BASE}/accounts/{merchant_id}/dataSources",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json={
                "displayName": "ZNXP SaaS API Feed",
                "primaryProductDataSource": {
                    "contentLanguage": "en",
                    "feedLabel": "US",
                    "channel": "ONLINE_PRODUCTS",
                }
            }
        )

    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=400, detail=f"创建 Data Source 失败: {resp.text}")

    ds_data = resp.json()
    ds_name = ds_data.get("name", "")  # accounts/{id}/dataSources/{dsId}
    ds_id = ds_name.split("/")[-1] if ds_name else ""

    # 存储 datasource_id
    await db.execute(text("""
        UPDATE google_oauth_tokens SET datasource_id=:ds WHERE user_id=:uid
    """), {"ds": ds_name, "uid": current_user_id})
    await db.commit()

    return Response(data={"datasource_id": ds_name}, message="Data Source 创建成功")


# ── Product list with GMC status ──────────────────────────────────────────────

@router.get("/products")
async def list_gmc_products(
    current_user_id: CurrentUser,
    db: DBSession,
    shop_id: int = Query(...),
    q: str = Query(""),
    gmc_status: str = Query(""),
    page: int = Query(1),
    per_page: int = Query(20),
):
    """列出 Shopify 缓存商品，含 GMC 推送状态"""
    from app.models.shop import Shop as ShopModel
    from sqlalchemy import select

    shop = (await db.execute(
        select(ShopModel).where(ShopModel.id == shop_id,
                                ShopModel.user_id == current_user_id,
                                ShopModel.is_deleted == False)
    )).scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="店铺不存在")

    where_parts = ["shop_id = :shop_id"]
    params: dict = {"shop_id": shop_id}

    if q:
        where_parts.append("title LIKE :q")
        params["q"] = f"%{q}%"
    if gmc_status == "pushed":
        where_parts.append("gmc_product_id IS NOT NULL")
    elif gmc_status == "not_pushed":
        where_parts.append("gmc_product_id IS NULL")

    where_clause = " AND ".join(where_parts)
    offset = (page - 1) * per_page

    count_row = (await db.execute(
        text(f"SELECT COUNT(*) as cnt FROM shopify_products_cache WHERE {where_clause}"), params
    )).mappings().one()
    total = count_row["cnt"]

    rows = (await db.execute(
        text(f"""
            SELECT shopify_product_id, title, image_url, status,
                   product_type, tags, price, handle,
                   gmc_product_id, gmc_status,
                   published_at, shopify_created_at
            FROM shopify_products_cache
            WHERE {where_clause}
            ORDER BY published_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {**params, "limit": per_page, "offset": offset}
    )).mappings().all()

    products = []
    for r in rows:
        products.append({
            "shopify_product_id": r["shopify_product_id"],
            "title": r["title"],
            "image_url": r["image_url"] or "",
            "status": r["status"] or "active",
            "product_type": r["product_type"] or "",
            "tags": r["tags"] or "",
            "price": r["price"] or "",
            "handle": r["handle"] or "",
            "gmc_product_id": r["gmc_product_id"],
            "gmc_status": r["gmc_status"] or "not_pushed",
            "published_at": r["published_at"].isoformat() if r["published_at"] else None,
        })

    return Response(data={"products": products, "total": total, "shop_domain": shop.domain})


# ── Push products to GMC ──────────────────────────────────────────────────────

class PushRequest(BaseModel):
    shop_id: int
    shopify_product_ids: list[str]


@router.post("/push")
async def push_products(body: PushRequest, current_user_id: CurrentUser, db: DBSession):
    """批量推送 Shopify 商品到 GMC"""
    from app.models.shop import Shop as ShopModel
    from sqlalchemy import select

    shop = (await db.execute(
        select(ShopModel).where(ShopModel.id == body.shop_id,
                                ShopModel.user_id == current_user_id,
                                ShopModel.is_deleted == False)
    )).scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="店铺不存在")

    access_token = await _get_valid_access_token(db, current_user_id)
    tokens = await _get_tokens(db, current_user_id)
    if not tokens or not tokens.get("datasource_id"):
        raise HTTPException(status_code=400, detail="请先在设置中完成 Data Source 初始化")

    merchant_id = settings.google_merchant_id
    datasource_id = tokens["datasource_id"]
    shop_domain = shop.domain

    # 获取商品数据
    placeholders = ",".join([":pid" + str(i) for i in range(len(body.shopify_product_ids))])
    pid_params = {f"pid{i}": pid for i, pid in enumerate(body.shopify_product_ids)}
    rows = (await db.execute(
        text(f"""
            SELECT shopify_product_id, title, image_url, status, price, handle
            FROM shopify_products_cache
            WHERE shop_id=:shop_id AND shopify_product_id IN ({placeholders})
        """),
        {"shop_id": body.shop_id, **pid_params}
    )).mappings().all()

    success, failed = 0, 0
    errors = []

    async with httpx.AsyncClient(trust_env=False, timeout=30) as client:
        for r in rows:
            pid = str(r["shopify_product_id"])
            handle = r["handle"] or ""
            product_link = f"https://{shop_domain}/products/{handle}" if handle else f"https://{shop_domain}"
            image_url = r["image_url"] or ""

            # price 转 micros
            try:
                price_float = float(r["price"] or "0")
            except ValueError:
                price_float = 0.0
            price_micros = int(price_float * 1_000_000)

            availability = "IN_STOCK" if (r["status"] or "active") == "active" else "OUT_OF_STOCK"

            payload = {
                "offerId": pid,
                "contentLanguage": "en",
                "feedLabel": "US",
                "productAttributes": {
                    "title": r["title"] or "Product",
                    "link": product_link,
                    "imageLink": image_url,
                    "price": {"amountMicros": str(price_micros), "currencyCode": "USD"},
                    "availability": availability,
                    "condition": "NEW",
                }
            }

            resp = await client.post(
                f"{MERCHANT_BASE}/accounts/{merchant_id}/productInputs:insert",
                params={"dataSource": datasource_id},
                headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
                json=payload,
            )

            if resp.status_code in (200, 201):
                gmc_id = resp.json().get("name", "")
                await db.execute(text("""
                    UPDATE shopify_products_cache
                    SET gmc_product_id=:gid, gmc_status='pending'
                    WHERE shop_id=:shop_id AND shopify_product_id=:pid
                """), {"gid": gmc_id, "shop_id": body.shop_id, "pid": pid})
                success += 1
            else:
                errors.append(f"{r['title'][:30]}: {resp.text[:100]}")
                failed += 1

    await db.commit()
    msg = f"推送完成：{success} 成功，{failed} 失败"
    return Response(data={"success": success, "failed": failed, "errors": errors}, message=msg)


# ── Sync GMC status back ──────────────────────────────────────────────────────

@router.post("/sync-status")
async def sync_gmc_status(
    body: dict,
    current_user_id: CurrentUser,
    db: DBSession,
):
    """从 GMC 同步商品审核状态回本地缓存"""
    shop_id = body.get("shop_id")
    access_token = await _get_valid_access_token(db, current_user_id)
    merchant_id = settings.google_merchant_id

    rows = (await db.execute(
        text("SELECT shopify_product_id, gmc_product_id FROM shopify_products_cache WHERE shop_id=:sid AND gmc_product_id IS NOT NULL"),
        {"sid": shop_id}
    )).mappings().all()

    updated = 0
    async with httpx.AsyncClient(trust_env=False, timeout=30) as client:
        for r in rows:
            gmc_id = r["gmc_product_id"]
            if not gmc_id:
                continue
            # gmc_id is the full resource name like accounts/{id}/products/{pid}
            resp = await client.get(
                f"{MERCHANT_BASE}/{gmc_id}",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if resp.status_code == 200:
                data = resp.json()
                # check productStatus
                ps = data.get("productStatus", {})
                dest_statuses = ps.get("destinationStatuses", [])
                new_status = "pending"
                for ds in dest_statuses:
                    approved = ds.get("approvedCountries", [])
                    disapproved = ds.get("disapprovedCountries", [])
                    if approved:
                        new_status = "approved"
                        break
                    if disapproved:
                        new_status = "disapproved"

                await db.execute(text("""
                    UPDATE shopify_products_cache SET gmc_status=:s
                    WHERE shopify_product_id=:pid AND shop_id=:sid
                """), {"s": new_status, "pid": str(r["shopify_product_id"]), "sid": shop_id})
                updated += 1

    await db.commit()
    return Response(data={"updated": updated}, message=f"同步完成，更新 {updated} 条状态")
