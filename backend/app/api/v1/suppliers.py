from fastapi import APIRouter, Query, HTTPException
from sqlalchemy import select, func
from app.core.deps import CurrentUser, DBSession
from app.models.supplier import Supplier, SupplierProduct
from app.schemas.supplier import (
    SupplierCard, SupplierCreateRequest, SupplierUpdateRequest,
    SupplierProductCard, SupplierProductCreateRequest, SupplierProductUpdateRequest,
)
from app.schemas.common import Response, PagedResponse, PageInfo

router = APIRouter(prefix="/suppliers", tags=["Suppliers"])


# ──────────────────── 供应商 CRUD ────────────────────

@router.get("/", response_model=PagedResponse[SupplierCard])
async def list_suppliers(
    current_user_id: CurrentUser,
    db: DBSession,
    keyword: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """获取供应商列表"""
    q = select(Supplier).where(Supplier.is_delete == False)
    if keyword:
        q = q.where(Supplier.supplier_name.ilike(f"%{keyword}%"))

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    rows = (await db.execute(q.offset((page - 1) * page_size).limit(page_size))).scalars().all()

    return PagedResponse(
        data=[SupplierCard.model_validate(r) for r in rows],
        page_info=PageInfo(page=page, page_size=page_size, total=total, total_pages=(total + page_size - 1) // page_size),
    )


@router.post("/", response_model=Response[SupplierCard])
async def create_supplier(body: SupplierCreateRequest, current_user_id: CurrentUser, db: DBSession):
    """创建供应商"""
    supplier = Supplier(**body.model_dump())
    db.add(supplier)
    await db.commit()
    await db.refresh(supplier)
    return Response(data=SupplierCard.model_validate(supplier), message="创建成功")


@router.put("/{supplier_id}", response_model=Response[SupplierCard])
async def update_supplier(supplier_id: int, body: SupplierUpdateRequest, current_user_id: CurrentUser, db: DBSession):
    """更新供应商"""
    supplier = (await db.execute(
        select(Supplier).where(Supplier.id == supplier_id, Supplier.is_delete == False)
    )).scalar_one_or_none()
    if not supplier:
        raise HTTPException(status_code=404, detail="供应商不存在")

    for k, v in body.model_dump(exclude_none=True).items():
        setattr(supplier, k, v)
    await db.commit()
    await db.refresh(supplier)
    return Response(data=SupplierCard.model_validate(supplier), message="更新成功")


@router.delete("/{supplier_id}", response_model=Response[None])
async def delete_supplier(supplier_id: int, current_user_id: CurrentUser, db: DBSession):
    """删除供应商（逻辑删除）"""
    supplier = (await db.execute(
        select(Supplier).where(Supplier.id == supplier_id, Supplier.is_delete == False)
    )).scalar_one_or_none()
    if not supplier:
        raise HTTPException(status_code=404, detail="供应商不存在")

    supplier.is_delete = True
    await db.commit()
    return Response(message="删除成功")


# ──────────────────── 供应商产品 ────────────────────

@router.get("/products/list", response_model=PagedResponse[SupplierProductCard])
async def list_supplier_products(
    current_user_id: CurrentUser,
    db: DBSession,
    supplier_id: int = Query(None),
    title: str = Query(None),
    product_type: str = Query(None),
    is_putawayis: int = Query(None, description="0=下架 1=上架 2=待审核"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """供应商产品列表"""
    q = select(SupplierProduct).where(SupplierProduct.is_delete == False)
    if supplier_id:
        q = q.where(SupplierProduct.supplier_id == str(supplier_id))
    if title:
        q = q.where(SupplierProduct.title.ilike(f"%{title}%"))
    if product_type:
        q = q.where(SupplierProduct.product_type == product_type)
    if is_putawayis is not None:
        q = q.where(SupplierProduct.is_putawayis == is_putawayis)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    rows = (await db.execute(q.order_by(SupplierProduct.id.desc()).offset((page - 1) * page_size).limit(page_size))).scalars().all()

    return PagedResponse(
        data=[SupplierProductCard.model_validate(r) for r in rows],
        page_info=PageInfo(page=page, page_size=page_size, total=total, total_pages=(total + page_size - 1) // page_size),
    )


@router.post("/products/", response_model=Response[SupplierProductCard])
async def create_supplier_product(body: SupplierProductCreateRequest, current_user_id: CurrentUser, db: DBSession):
    """创建供应商产品"""
    product = SupplierProduct(**body.model_dump(), channel=str(body.supplier_id))
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return Response(data=SupplierProductCard.model_validate(product), message="创建成功")


@router.put("/products/{product_id}", response_model=Response[SupplierProductCard])
async def update_supplier_product(product_id: int, body: SupplierProductUpdateRequest, current_user_id: CurrentUser, db: DBSession):
    """更新供应商产品"""
    product = (await db.execute(
        select(SupplierProduct).where(SupplierProduct.id == product_id, SupplierProduct.is_delete == False)
    )).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="产品不存在")

    for k, v in body.model_dump(exclude_none=True).items():
        setattr(product, k, v)
    await db.commit()
    await db.refresh(product)
    return Response(data=SupplierProductCard.model_validate(product), message="更新成功")


@router.delete("/products/{product_id}", response_model=Response[None])
async def delete_supplier_product(product_id: int, current_user_id: CurrentUser, db: DBSession):
    """删除供应商产品"""
    product = (await db.execute(
        select(SupplierProduct).where(SupplierProduct.id == product_id, SupplierProduct.is_delete == False)
    )).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="产品不存在")

    product.is_delete = True
    await db.commit()
    return Response(message="删除成功")


@router.put("/products/{product_id}/shelf", response_model=Response[None])
async def toggle_shelf(
    product_id: int,
    current_user_id: CurrentUser,
    db: DBSession,
    status: int = Query(..., description="0=下架 1=上架"),
):
    """上架/下架供应商产品"""
    if status not in (0, 1):
        raise HTTPException(status_code=400, detail="status 只能是 0 或 1")

    product = (await db.execute(
        select(SupplierProduct).where(SupplierProduct.id == product_id, SupplierProduct.is_delete == False)
    )).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="产品不存在")

    product.is_putawayis = status
    await db.commit()
    return Response(message="上架成功" if status == 1 else "下架成功")
