from pydantic import BaseModel
from typing import List


class TrendPoint(BaseModel):
    date: str          # "MM-DD"
    new_products: int  # platform-wide new products that day
    published: int     # user's published that day


class DashboardStats(BaseModel):
    today_recommended: int
    total_products_in_library: int
    published_today: int
    total_published: int = 0
    total_products_platform: int = 0
    agent_tasks_running: int
    agent_tasks_completed_today: int
    platform_counts: dict[str, int] = {}
    category_counts: dict[str, int] = {}


class AgentDailySummary(BaseModel):
    products_found: int
    images_processed: int
    videos_generated: int
    products_published: int
    date: str
