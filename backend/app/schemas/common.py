from pydantic import BaseModel
from typing import Generic, TypeVar, Any

T = TypeVar("T")


class Response(BaseModel, Generic[T]):
    code: int = 200
    message: str = "success"
    data: T | None = None


class PageInfo(BaseModel):
    page: int
    page_size: int
    total: int
    total_pages: int


class PagedResponse(BaseModel, Generic[T]):
    code: int = 200
    message: str = "success"
    data: list[T] = []
    page_info: PageInfo | None = None
