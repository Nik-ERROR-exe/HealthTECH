from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from app.models.models import UserRole


# ─── Request Schemas ───

class RegisterRequest(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    role: UserRole
    phone:            Optional[str] = None
    area_description: Optional[str] = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

    @field_validator("full_name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Full name cannot be empty")
        return v.strip()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ─── Response Schemas ───

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: UserRole
    user_id: str
    full_name: str
    unique_uid: Optional[str] = None


class RegisterResponse(BaseModel):
    message: str
    user_id: str


class UserMeResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: UserRole
    unique_uid: Optional[str] = None
    is_active: bool

    class Config:
        from_attributes = True