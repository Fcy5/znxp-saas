from sqlalchemy import Column, Integer, String, Boolean, Text, Float, JSON, DateTime
from app.core.database import Base
import datetime


class Supplier(Base):
    __tablename__ = "supplier_table"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    supplier_name = Column(String(255), index=True)
    supplier_logo = Column(String(255), nullable=True)
    supplier_url = Column(String(255), nullable=True)
    supplier_phone = Column(String(255), nullable=True)
    supplier_email = Column(String(255), nullable=True)
    supplier_description = Column(String(255), nullable=True)
    is_delete = Column(Boolean, default=False)


class SupplierUser(Base):
    __tablename__ = "supplier_user_table"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    supplier_id = Column(Integer, nullable=False)
    user_id = Column(Integer, nullable=False)


class SupplierProduct(Base):
    __tablename__ = "supplier_product_table"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    supplier_id = Column(String(50), nullable=True)
    product_id = Column(String(255), nullable=True)
    title = Column(String(255), nullable=True)
    body_html = Column(Text, nullable=True)
    product_type = Column(String(255), nullable=True)
    tags = Column(String(255), nullable=True)
    channel = Column(String(255), nullable=True)
    price = Column(Float, nullable=True)
    variants = Column(JSON, nullable=True)
    options = Column(JSON, nullable=True)
    images = Column(JSON, nullable=True)
    image = Column(JSON, nullable=True)
    vendor = Column(String(255), nullable=True)
    published_scope = Column(String(255), nullable=True)
    handle = Column(String(255), nullable=True)
    product_url = Column(Text, nullable=True)
    create_time = Column(DateTime, nullable=True)
    updated_time = Column(DateTime, nullable=True)
    is_putawayis = Column(Integer, default=2)  # 0=下架 1=上架 2=待审核
    is_delete = Column(Boolean, default=False)
