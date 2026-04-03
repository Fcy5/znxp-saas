from pydantic import BaseModel
from typing import Any


class AgentTaskResponse(BaseModel):
    id: int
    task_type: str
    status: str
    progress: int
    output_data: dict | None
    error_message: str | None
    created_at: str

    model_config = {"from_attributes": True}


class StoreProfileRequest(BaseModel):
    shop_domain: str


class AutoDiscoveryRequest(BaseModel):
    shop_id: int
    count: int = 5   # 推荐数量


class CopywritingRequest(BaseModel):
    product_id: int
    language: str = "en"
    model: str | None = None  # None = 使用 .env 默认模型


class CopywritingResult(BaseModel):
    seo_title: str
    meta_description: str
    html_description: str
    alt_tags: list[str]


class ImageProcessRequest(BaseModel):
    product_id: int
    operations: list[str]   # ["remove_watermark", "change_background", "add_badge"]
    background_prompt: str | None = None


class ImageGenerateRequest(BaseModel):
    prompt: str
    model: str = "openai/gpt-image-1.5"
    size: str = "1024x1024"
    reference_image_url: str | None = None  # 原商品图，用于 image edit


class ImageGenerateResult(BaseModel):
    url: str  # 保存到本地的静态资源路径


class SocialCopyRequest(BaseModel):
    product_id: int
    model: str | None = None


class SocialCopyResult(BaseModel):
    tiktok: str
    facebook: str
    instagram: str


class VideoGenerationRequest(BaseModel):
    product_id: int
    variant_count: int = 5   # A/B测试变体数量
    voice_language: str = "en-US"


class PublishRequest(BaseModel):
    product_id: int
    shop_id: int
    custom_price: float | None = None
    profit_margin: float | None = None  # 用利润率自动定价
