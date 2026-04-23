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
    db: DBSession = None,  # noqa - FastAPI injects via Annotated[..., Depends]
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

    frontend = "https://znxp-sass.vqmjc.cc" if settings.app_env == "production" else "http://localhost:3000"

    if resp.status_code != 200:
        return RedirectResponse(url=f"{frontend}/gmc?error=oauth_failed")

    data = resp.json()
    await _save_tokens(
        db, user_id,
        data["access_token"],
        data.get("refresh_token", ""),
        data.get("expires_in", 3600),
    )
    return RedirectResponse(url=f"{frontend}/gmc?connected=1")


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


# ── Google Ads API helpers ────────────────────────────────────────────────────

ADS_BASE = "https://googleads.googleapis.com/v17"


async def _ads_search(access_token: str, customer_id: str, query: str) -> list[dict]:
    """执行 GAQL 查询，返回 results 列表"""
    headers = {
        "Authorization": f"Bearer {access_token}",
        "developer-token": settings.google_ads_developer_token,
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(trust_env=False, timeout=30) as client:
        resp = await client.post(
            f"{ADS_BASE}/customers/{customer_id}/googleAds:search",
            headers=headers,
            json={"query": query},
        )
    if resp.status_code == 401:
        raise HTTPException(status_code=401, detail="Google Ads 授权失败，请重新连接 Google 账号")
    if resp.status_code == 403:
        detail = resp.json().get("error", {}).get("message", resp.text[:200])
        raise HTTPException(status_code=403, detail=f"Google Ads API 权限不足: {detail}")
    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=400, detail=f"Google Ads API 错误: {resp.text[:300]}")
    return resp.json().get("results", [])


# ── 广告数据：购物广告搜索词报告 ─────────────────────────────────────────────

@router.get("/ads/search-terms")
async def get_search_terms(
    current_user_id: CurrentUser,
    db: DBSession,
    days: int = Query(30, ge=7, le=90),
):
    """获取购物广告搜索词报告（最近 N 天）"""
    access_token = await _get_valid_access_token(db, current_user_id)
    customer_id = settings.google_ads_customer_id

    query = f"""
        SELECT
            search_term_view.search_term,
            metrics.clicks,
            metrics.impressions,
            metrics.cost_micros,
            metrics.conversions,
            metrics.conversions_value
        FROM search_term_view
        WHERE segments.date DURING LAST_{days}_DAYS
          AND metrics.impressions > 0
        ORDER BY metrics.clicks DESC
        LIMIT 100
    """
    results = await _ads_search(access_token, customer_id, query)

    terms = []
    for r in results:
        stv = r.get("searchTermView", {})
        m = r.get("metrics", {})
        cost = int(m.get("costMicros", 0)) / 1_000_000
        conv_value = float(m.get("conversionsValue", 0))
        clicks = int(m.get("clicks", 0))
        roas = round(conv_value / cost, 2) if cost > 0 else 0
        terms.append({
            "search_term": stv.get("searchTerm", ""),
            "clicks": clicks,
            "impressions": int(m.get("impressions", 0)),
            "cost": round(cost, 2),
            "conversions": float(m.get("conversions", 0)),
            "roas": roas,
        })

    total_cost = sum(t["cost"] for t in terms)
    total_clicks = sum(t["clicks"] for t in terms)
    total_conv = sum(t["conversions"] for t in terms)
    total_roas = round(sum(t["roas"] for t in terms if t["roas"] > 0) / max(len([t for t in terms if t["roas"] > 0]), 1), 2)

    return Response(data={
        "terms": terms,
        "summary": {
            "total_clicks": total_clicks,
            "total_cost": round(total_cost, 2),
            "total_conversions": round(total_conv, 2),
            "avg_roas": total_roas,
        }
    })


# ── 广告数据：购物广告商品维度表现 ───────────────────────────────────────────

@router.get("/ads/product-performance")
async def get_product_performance(
    current_user_id: CurrentUser,
    db: DBSession,
    days: int = Query(30, ge=7, le=90),
):
    """获取购物广告各商品点击/花费/转化数据"""
    access_token = await _get_valid_access_token(db, current_user_id)
    customer_id = settings.google_ads_customer_id

    query = f"""
        SELECT
            segments.product_title,
            segments.product_item_id,
            metrics.clicks,
            metrics.impressions,
            metrics.cost_micros,
            metrics.conversions,
            metrics.conversions_value
        FROM shopping_performance_view
        WHERE segments.date DURING LAST_{days}_DAYS
          AND metrics.impressions > 0
        ORDER BY metrics.clicks DESC
        LIMIT 50
    """
    results = await _ads_search(access_token, customer_id, query)

    products = []
    for r in results:
        seg = r.get("segments", {})
        m = r.get("metrics", {})
        cost = int(m.get("costMicros", 0)) / 1_000_000
        conv_value = float(m.get("conversionsValue", 0))
        roas = round(conv_value / cost, 2) if cost > 0 else 0
        products.append({
            "title": seg.get("productTitle", ""),
            "item_id": seg.get("productItemId", ""),
            "clicks": int(m.get("clicks", 0)),
            "impressions": int(m.get("impressions", 0)),
            "cost": round(cost, 2),
            "conversions": float(m.get("conversions", 0)),
            "roas": roas,
        })

    return Response(data={"products": products})


# ── 广告数据：添加否定关键词 ──────────────────────────────────────────────────

class NegativeKeywordRequest(BaseModel):
    keywords: list[str]
    campaign_id: str | None = None


@router.post("/ads/negative-keywords")
async def add_negative_keywords(
    body: NegativeKeywordRequest,
    current_user_id: CurrentUser,
    db: DBSession,
):
    """在购物广告系列添加否定关键词（精确匹配）"""
    if not body.keywords:
        raise HTTPException(status_code=400, detail="关键词列表不能为空")

    access_token = await _get_valid_access_token(db, current_user_id)
    customer_id = settings.google_ads_customer_id

    # 先查所有购物广告系列
    if not body.campaign_id:
        campaigns = await _ads_search(access_token, customer_id, """
            SELECT campaign.id, campaign.name
            FROM campaign
            WHERE campaign.advertising_channel_type = 'SHOPPING'
              AND campaign.status = 'ENABLED'
            LIMIT 10
        """)
        if not campaigns:
            raise HTTPException(status_code=404, detail="未找到启用中的购物广告系列")
        campaign_id = str(campaigns[0]["campaign"]["id"])
        campaign_name = campaigns[0]["campaign"]["name"]
    else:
        campaign_id = body.campaign_id
        campaign_name = f"Campaign {campaign_id}"

    # 批量添加否定关键词
    operations = []
    for kw in body.keywords:
        operations.append({
            "create": {
                "campaign": f"customers/{customer_id}/campaigns/{campaign_id}",
                "matchType": "EXACT",
                "keywordText": kw.strip().lower(),
            }
        })

    headers = {
        "Authorization": f"Bearer {access_token}",
        "developer-token": settings.google_ads_developer_token,
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(trust_env=False, timeout=30) as client:
        resp = await client.post(
            f"{ADS_BASE}/customers/{customer_id}/campaignNegativeKeywords:mutate",
            headers=headers,
            json={"operations": operations},
        )

    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=400, detail=f"添加失败: {resp.text[:200]}")

    return Response(
        data={"added": len(body.keywords), "campaign": campaign_name},
        message=f"已向「{campaign_name}」添加 {len(body.keywords)} 个否定关键词"
    )
