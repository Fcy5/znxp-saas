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
