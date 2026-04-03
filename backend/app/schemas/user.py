from pydantic import BaseModel, EmailStr, field_validator
import re


class UserRegisterRequest(BaseModel):
    email: EmailStr
    username: str
    password: str
    otp_code: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str


class SendOtpRequest(BaseModel):
    email: EmailStr


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    username: str
    email: str
    subscription_tier: str


class UserProfile(BaseModel):
    id: int
    email: str
    username: str
    avatar: str | None
    subscription_tier: str
    is_active: bool

    model_config = {"from_attributes": True}
