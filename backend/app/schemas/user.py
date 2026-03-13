from pydantic import BaseModel, EmailStr
from uuid import UUID
from typing import Optional
from datetime import datetime

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    phone: Optional[str] = None

class UserOut(BaseModel):
    id: UUID
    email: str
    full_name: Optional[str]
    phone: Optional[str]
    opt_in_email: bool
    opt_in_sms: bool
    is_admin: bool
    created_at: datetime

    model_config = {"from_attributes": True}

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    opt_in_email: Optional[bool] = None
    opt_in_sms: Optional[bool] = None
    billing_address: Optional[dict] = None

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
