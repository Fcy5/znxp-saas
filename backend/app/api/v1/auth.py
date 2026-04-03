from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from app.core.deps import DBSession
from app.models.user import User
from app.schemas.user import UserRegisterRequest, UserLoginRequest, SendOtpRequest, TokenResponse
from app.schemas.common import Response
from app.core.security import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/send-otp", response_model=Response[None])
async def send_otp(body: SendOtpRequest):
    """发送邮箱验证码（暂时跳过，直接返回成功）"""
    return Response(message="OTP sent successfully")


@router.post("/register", response_model=Response[TokenResponse])
async def register(body: UserRegisterRequest, db: DBSession):
    """用户注册"""
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="该邮箱已注册")

    user = User(
        email=body.email,
        username=body.username,
        hashed_password=hash_password(body.password),
        is_active=True,
        subscription_tier="free",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id)
    return Response(data=TokenResponse(
        access_token=token,
        user_id=user.id,
        username=user.username,
        email=user.email,
        subscription_tier=user.subscription_tier,
    ))


@router.post("/login", response_model=Response[TokenResponse])
async def login(body: UserLoginRequest, db: DBSession):
    """用户登录"""
    result = await db.execute(select(User).where(User.email == body.email, User.is_deleted == False))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="邮箱或密码错误")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="账号已禁用")

    token = create_access_token(user.id)
    return Response(data=TokenResponse(
        access_token=token,
        user_id=user.id,
        username=user.username,
        email=user.email,
        subscription_tier=user.subscription_tier,
    ))
