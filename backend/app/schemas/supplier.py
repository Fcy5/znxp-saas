from typing import Optional, List
from pydantic import BaseModel


class SupplierCard(BaseModel):
    id: int
    supplier_name: str
    supplier_logo: Optional[str] = None
    supplier_url: Optional[str] = None
    supplier_phone: Optional[str] = None
    supplier_email: Optional[str] = None
    supplier_description: Optional[str] = None

    model_config = {"from_attributes": True}


class SupplierCreateRequest(BaseModel):
    supplier_name: str
    supplier_url: Optional[str] = None
    supplier_logo: Optional[str] = None
    supplier_phone: Optional[str] = None
    supplier_email: Optional[str] = None
    supplier_description: Optional[str] = None


class SupplierUpdateRequest(BaseModel):
    supplier_name: Optional[str] = None
    supplier_url: Optional[str] = None
    supplier_logo: Optional[str] = None
    supplier_phone: Optional[str] = None
    supplier_email: Optional[str] = None
    supplier_description: Optional[str] = None


class SupplierProductCard(BaseModel):
    id: int
    supplier_id: Optional[str] = None
    product_id: Optional[str] = None
    title: Optional[str] = None
    product_type: Optional[str] = None
    price: Optional[float] = None
    channel: Optional[str] = None
    image: Optional[dict] = None
    images: Optional[list] = None
    is_putawayis: int = 2
    product_url: Optional[str] = None
    tags: Optional[str] = None

    model_config = {"from_attributes": True}


class SupplierProductCreateRequest(BaseModel):
    supplier_id: int
    title: str
    product_type: Optional[str] = None
    body_html: Optional[str] = None
    tags: Optional[str] = None
    price: Optional[float] = None
    product_url: Optional[str] = None
    images: Optional[List[dict]] = None
    image: Optional[dict] = None
    variants: Optional[List[dict]] = None
    options: Optional[List[dict]] = None


class SupplierProductUpdateRequest(BaseModel):
    title: Optional[str] = None
    product_type: Optional[str] = None
    body_html: Optional[str] = None
    tags: Optional[str] = None
    price: Optional[float] = None
    product_url: Optional[str] = None
    is_putawayis: Optional[int] = None
