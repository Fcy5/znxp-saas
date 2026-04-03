from sqlalchemy import String, Integer, ForeignKey, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import BaseModel


class AgentTask(BaseModel):
    __tablename__ = "agent_tasks"

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    product_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("products.id"), nullable=True)
    shop_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("shops.id"), nullable=True)

    # Task type: store_profile / auto_discovery / copywriting / image_processing / video_generation / publish
    task_type: Mapped[str] = mapped_column(String(100), index=True)
    # Status: pending / running / success / failed / cancelled
    status: Mapped[str] = mapped_column(String(50), default="pending", index=True)

    input_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    output_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)   # 0-100
