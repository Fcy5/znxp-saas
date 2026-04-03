from pydantic import BaseModel


class ShopCreateRequest(BaseModel):
    name: str
    domain: str          # e.g. "my-store.myshopify.com"
    access_token: str    # Shopify Admin API access token
    platform: str = "shopify"


class ShopUpdateRequest(BaseModel):
    name: str | None = None
    access_token: str | None = None


class ShopResponse(BaseModel):
    id: int
    name: str
    domain: str
    platform: str
    access_token: str | None
    niche: str | None
    profile_summary: str | None

    model_config = {"from_attributes": True}


# Keep old alias for compatibility
ShopProfileResponse = ShopResponse
