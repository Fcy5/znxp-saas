from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from app.core.deps import CurrentUser, DBSession
from app.core.security import hash_password, verify_password
from app.models.user import User
from app.schemas.user import UserProfile
from app.schemas.common import Response

router = APIRouter(prefix="/users", tags=["Users"])


class UpdateProfileRequest(BaseModel):
    username: str | None = None
    email: str | None = None
    current_password: str | None = None
    new_password: str | None = None


@router.get("/me", response_model=Response[UserProfile])
async def get_profile(current_user_id: CurrentUser, db: DBSession):
    """获取当前用户真实信息"""
    user = await db.get(User, current_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return Response(data=UserProfile(
        id=user.id,
        email=user.email,
        username=user.username,
        avatar=user.avatar,
        subscription_tier=user.subscription_tier,
        is_active=user.is_active,
    ))


@router.put("/me", response_model=Response[UserProfile])
async def update_profile(body: UpdateProfileRequest, current_user_id: CurrentUser, db: DBSession):
    """更新用户名/邮箱/密码"""
    user = await db.get(User, current_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if body.username and body.username != user.username:
        existing = (await db.execute(
            select(User).where(User.username == body.username)
        )).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=400, detail="用户名已被使用")
        user.username = body.username

    if body.email and body.email != user.email:
        existing = (await db.execute(
            select(User).where(User.email == body.email)
        )).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=400, detail="邮箱已被使用")
        user.email = body.email

    if body.new_password:
        if not body.current_password:
            raise HTTPException(status_code=400, detail="请输入当前密码")
        if not verify_password(body.current_password, user.hashed_password):
            raise HTTPException(status_code=400, detail="当前密码错误")
        user.hashed_password = hash_password(body.new_password)

    await db.commit()
    return Response(data=UserProfile(
        id=user.id,
        email=user.email,
        username=user.username,
        avatar=user.avatar,
        subscription_tier=user.subscription_tier,
        is_active=user.is_active,
    ), message="更新成功")
