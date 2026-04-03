from sqlalchemy import String, Integer, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import BaseModel


class Role(BaseModel):
    __tablename__ = "roles"
    name: Mapped[str] = mapped_column(String(100), unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class UserRole(BaseModel):
    __tablename__ = "user_roles"
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    role_id: Mapped[int] = mapped_column(Integer, ForeignKey("roles.id"), index=True)


class Permission(BaseModel):
    __tablename__ = "permissions"
    name: Mapped[str] = mapped_column(String(100))
    endpoint: Mapped[str] = mapped_column(String(255))
    method: Mapped[str] = mapped_column(String(20))


class RolePermission(BaseModel):
    __tablename__ = "role_permissions"
    role_id: Mapped[int] = mapped_column(Integer, ForeignKey("roles.id"), index=True)
    permission_id: Mapped[int] = mapped_column(Integer, ForeignKey("permissions.id"), index=True)
