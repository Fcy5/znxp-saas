"""Shopify Admin API utilities (GraphQL + REST)."""
import httpx

API_VERSION = "2024-04"


def _headers(access_token: str) -> dict:
    return {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": access_token,
    }


async def graphql(shop_domain: str, access_token: str, query: str, variables: dict | None = None) -> dict:
    """Execute a Shopify Admin GraphQL request."""
    url = f"https://{shop_domain}/admin/api/{API_VERSION}/graphql.json"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            url,
            json={"query": query, "variables": variables or {}},
            headers=_headers(access_token),
        )
        resp.raise_for_status()
        return resp.json()


async def verify_token(shop_domain: str, access_token: str) -> bool:
    """Check if the access token is valid by fetching shop info."""
    try:
        url = f"https://{shop_domain}/admin/api/{API_VERSION}/shop.json"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers=_headers(access_token))
            return resp.status_code == 200
    except Exception:
        return False


async def create_product(
    shop_domain: str,
    access_token: str,
    title: str,
    description_html: str,
    price: float,
    image_url: str | None = None,
    extra_images: list[str] | None = None,
    product_type: str = "",
    tags: str = "",
    vendor: str = "",
    size_variants: list[dict] | None = None,  # [{"size": "M", "price": 29.99}, ...]
) -> dict:
    """
    Create a product on Shopify via REST API (supports options + variants natively).
    Returns the created Shopify product dict or raises on error.
    """
    # Build images list
    images = []
    if image_url:
        images.append({"src": image_url, "alt": title[:255]})
    for img in (extra_images or []):
        if img and img != image_url:
            images.append({"src": img, "alt": title[:255]})

    product_body: dict = {
        "title": title,
        "body_html": description_html or "",
        "vendor": vendor or "",
        "product_type": product_type or "",
        "tags": tags or "",
        "status": "active",
        "images": images,
    }

    if size_variants:
        product_body["options"] = [{"name": "Size"}]
        product_body["variants"] = [
            {
                "option1": v["size"],
                "price": str(v.get("price") or price),
                "inventory_management": None,
            }
            for v in size_variants
        ]
    else:
        product_body["variants"] = [{"price": str(price), "inventory_management": None}]

    url = f"https://{shop_domain}/admin/api/{API_VERSION}/products.json"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json={"product": product_body}, headers=_headers(access_token))
        resp.raise_for_status()
        data = resp.json()

    product = data.get("product")
    if not product:
        raise ValueError(f"Shopify returned no product: {data}")

    # Publish to online store (best-effort)
    product_gid = f"gid://shopify/Product/{product['id']}"
    await _publish_product(shop_domain, access_token, product_gid)

    # Return shape compatible with existing code
    product["onlineStoreUrl"] = f"https://{shop_domain}/products/{product.get('handle', '')}"
    return product


async def _update_variant_price(shop_domain: str, access_token: str, variant_id: str, price: float):
    url = f"https://{shop_domain}/admin/api/{API_VERSION}/variants/{variant_id}.json"
    async with httpx.AsyncClient(timeout=15) as client:
        await client.put(
            url,
            json={"variant": {"id": variant_id, "price": str(price)}},
            headers=_headers(access_token),
        )


async def list_products(shop_domain: str, access_token: str, limit: int = 250) -> list[dict]:
    """Fetch all products from Shopify via REST, return list of product dicts."""
    url = f"https://{shop_domain}/admin/api/{API_VERSION}/products.json"
    params = {"limit": min(limit, 250), "fields": "id,title,images,variants,status,product_type,tags,handle,published_at,created_at"}
    products = []
    async with httpx.AsyncClient(timeout=30) as client:
        while url:
            resp = await client.get(url, headers=_headers(access_token), params=params)
            resp.raise_for_status()
            data = resp.json()
            products.extend(data.get("products", []))
            # pagination via Link header
            link = resp.headers.get("Link", "")
            next_url = None
            for part in link.split(","):
                part = part.strip()
                if 'rel="next"' in part:
                    next_url = part.split(";")[0].strip().strip("<>")
            url = next_url
            params = {}  # page_info already in next_url
    return products


async def update_product_seo(
    shop_domain: str,
    access_token: str,
    product_id: int,
    seo_title: str,
    meta_description: str,
    image_alts: list[dict] | None = None,  # [{"id": 123, "alt": "..."}]
    structured_data: dict | None = None,   # Product Schema JSON-LD
) -> dict:
    """Update product SEO title, meta description, and image alt texts."""
    mutation = """
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id title seo { title description } }
        userErrors { field message }
      }
    }
    """
    product_gid = f"gid://shopify/Product/{product_id}"
    result = await graphql(shop_domain, access_token, mutation, {
        "input": {
            "id": product_gid,
            "seo": {"title": seo_title[:70], "description": meta_description[:155]},
        }
    })
    errors = result.get("data", {}).get("productUpdate", {}).get("userErrors", [])
    if errors:
        raise ValueError(f"Shopify SEO update error: {errors}")

    async with httpx.AsyncClient(timeout=15) as client:
        # Update image alt texts
        if image_alts:
            for img in image_alts:
                img_url = f"https://{shop_domain}/admin/api/{API_VERSION}/products/{product_id}/images/{img['id']}.json"
                await client.put(
                    img_url,
                    json={"image": {"id": img["id"], "alt": img["alt"][:255]}},
                    headers=_headers(access_token),
                )

        # Write Product Schema JSON-LD as metafield
        if structured_data:
            import json as _json
            mf_url = f"https://{shop_domain}/admin/api/{API_VERSION}/products/{product_id}/metafields.json"
            await client.post(
                mf_url,
                json={"metafield": {
                    "namespace": "custom",
                    "key": "structured_data",
                    "value": _json.dumps(structured_data, ensure_ascii=False),
                    "type": "json",
                }},
                headers=_headers(access_token),
            )

    return result


async def _publish_product(shop_domain: str, access_token: str, product_gid: str):
    """Publish product to online store channel."""
    mutation = """
    mutation publishProduct($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        userErrors { field message }
      }
    }
    """
    # Get online store publication ID first
    pub_query = """
    query {
      publications(first: 10) {
        nodes { id name }
      }
    }
    """
    try:
        pubs = await graphql(shop_domain, access_token, pub_query)
        pub_nodes = pubs.get("data", {}).get("publications", {}).get("nodes", [])
        online_store_id = next(
            (p["id"] for p in pub_nodes if "Online Store" in p.get("name", "")),
            None
        )
        if online_store_id:
            await graphql(shop_domain, access_token, mutation, {
                "id": product_gid,
                "input": [{"publicationId": online_store_id}],
            })
    except Exception:
        pass  # Publishing to channel is best-effort


async def update_product_status(
    shop_domain: str,
    access_token: str,
    product_id: int,
    status: str,  # "active" | "draft" | "archived"
) -> None:
    """上架 / 下架 / 归档单个商品"""
    url = f"https://{shop_domain}/admin/api/{API_VERSION}/products/{product_id}.json"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.put(
            url,
            json={"product": {"id": product_id, "status": status}},
            headers=_headers(access_token),
        )
        resp.raise_for_status()


async def get_product_variants(
    shop_domain: str,
    access_token: str,
    product_id: int,
) -> list[dict]:
    """获取商品的所有变体"""
    url = f"https://{shop_domain}/admin/api/{API_VERSION}/products/{product_id}/variants.json"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, headers=_headers(access_token))
        resp.raise_for_status()
        return resp.json().get("variants", [])


async def update_variant_prices(
    shop_domain: str,
    access_token: str,
    product_id: int,
    rule_type: str,   # "fixed" | "increase_pct" | "decrease_pct"
    rule_value: float,
) -> int:
    """按规则更新商品所有变体价格，返回更新数量"""
    variants = await get_product_variants(shop_domain, access_token, product_id)
    updated = 0
    async with httpx.AsyncClient(timeout=30) as client:
        for v in variants:
            current = float(v.get("price") or 0)
            if rule_type == "fixed":
                new_price = rule_value
            elif rule_type == "increase_pct":
                new_price = current * (1 + rule_value / 100)
            elif rule_type == "decrease_pct":
                new_price = current * (1 - rule_value / 100)
            else:
                continue
            new_price = max(round(new_price, 2), 0.01)
            url = f"https://{shop_domain}/admin/api/{API_VERSION}/variants/{v['id']}.json"
            resp = await client.put(
                url,
                json={"variant": {"id": v["id"], "price": f"{new_price:.2f}"}},
                headers=_headers(access_token),
            )
            if resp.status_code == 200:
                updated += 1
    return updated
