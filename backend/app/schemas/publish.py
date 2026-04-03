from pydantic import BaseModel
from datetime import datetime


class SizeVariant(BaseModel):
    size: str          # e.g. "S", "M", "L", "XL"
    price: float       # price for this size


class PublishRequest(BaseModel):
    product_id: int
    shop_id: int
    # Optional overrides — if omitted, original values are used
    title: str | None = None
    description: str | None = None
    price: float | None = None
    tags: str | None = None
    product_type: str | None = None
    # Size variants — if provided, creates one Shopify variant per size
    variants: list[SizeVariant] | None = None
    # Extra image URLs (in addition to main_image)
    extra_images: list[str] | None = None


class PublishedProductResponse(BaseModel):
    id: int
    product_id: int
    shop_id: int
    shopify_product_id: str | None
    shopify_product_url: str | None
    published_title: str | None
    published_price: float | None
    status: str
    error_message: str | None
    published_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
