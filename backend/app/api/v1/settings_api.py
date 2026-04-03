from fastapi import APIRouter
from sqlalchemy import select
from pydantic import BaseModel
from app.core.deps import CurrentUser, DBSession
from app.core.config import settings as app_settings
from app.models.settings import SystemSetting
from app.schemas.common import Response

router = APIRouter(prefix="/settings", tags=["Settings"])

AI_KEYS = {
    "ai_api_key":  "AI API Key（中转 Token）",
    "ai_base_url": "AI 接口地址",
    "ai_model":    "默认模型",
}


async def _get(db, key: str) -> str | None:
    row = (await db.execute(select(SystemSetting).where(SystemSetting.key == key))).scalar_one_or_none()
    return row.value if row else None


async def _set(db, key: str, value: str):
    row = (await db.execute(select(SystemSetting).where(SystemSetting.key == key))).scalar_one_or_none()
    if row:
        row.value = value
    else:
        db.add(SystemSetting(key=key, value=value, description=AI_KEYS.get(key, key)))
    await db.commit()


class AISettingsResponse(BaseModel):
    ai_api_key: str      # 脱敏显示
    ai_base_url: str
    ai_model: str


class AISettingsUpdate(BaseModel):
    ai_api_key: str | None = None
    ai_base_url: str | None = None
    ai_model: str | None = None


@router.get("/ai", response_model=Response[AISettingsResponse])
async def get_ai_settings(current_user_id: CurrentUser, db: DBSession):
    """获取 AI 配置（key 脱敏）"""
    key = await _get(db, "ai_api_key") or app_settings.ai_api_key
    url = await _get(db, "ai_base_url") or app_settings.ai_base_url
    model = await _get(db, "ai_model") or app_settings.ai_model

    # 脱敏：只显示前8位 + ***
    masked = key[:8] + "***" + key[-4:] if len(key) > 12 else "***"
    return Response(data=AISettingsResponse(ai_api_key=masked, ai_base_url=url, ai_model=model))


@router.put("/ai", response_model=Response[None])
async def update_ai_settings(body: AISettingsUpdate, current_user_id: CurrentUser, db: DBSession):
    """更新 AI 配置，存入数据库，立即生效"""
    if body.ai_api_key and "***" not in body.ai_api_key:
        await _set(db, "ai_api_key", body.ai_api_key)
        app_settings.ai_api_key = body.ai_api_key
    if body.ai_base_url:
        await _set(db, "ai_base_url", body.ai_base_url)
        app_settings.ai_base_url = body.ai_base_url
    if body.ai_model:
        await _set(db, "ai_model", body.ai_model)
        app_settings.ai_model = body.ai_model
    return Response(message="AI 配置已更新")
