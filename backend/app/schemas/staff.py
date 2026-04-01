from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.staffing import normalize_string_list


class StaffOption(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    add_on_price_cents: int = Field(default=0, ge=0)
    photo_url: Optional[str] = None
    skills: List[str] = Field(default_factory=list)
    talents: List[str] = Field(default_factory=list)


class StaffProfileCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: Optional[str] = Field(default=None, max_length=500)
    skills: List[str] = Field(default_factory=list)
    talents: List[str] = Field(default_factory=list)
    photo_url: Optional[str] = None
    add_on_price_cents: int = Field(default=0, ge=0)
    active: bool = True

    @field_validator("skills", "talents", mode="before")
    @classmethod
    def normalize_lists(cls, value):
        return normalize_string_list(value)


class StaffProfileUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    description: Optional[str] = Field(default=None, max_length=500)
    skills: Optional[List[str]] = None
    talents: Optional[List[str]] = None
    photo_url: Optional[str] = None
    add_on_price_cents: Optional[int] = Field(default=None, ge=0)
    active: Optional[bool] = None

    @field_validator("skills", "talents", mode="before")
    @classmethod
    def normalize_optional_lists(cls, value):
        if value is None:
            return value
        return normalize_string_list(value)


class StaffProfileOut(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    skills: List[str] = Field(default_factory=list)
    talents: List[str] = Field(default_factory=list)
    photo_url: Optional[str] = None
    add_on_price_cents: int
    active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    @field_validator("skills", "talents", mode="before")
    @classmethod
    def normalize_output_lists(cls, value):
        return normalize_string_list(value)

    model_config = {"from_attributes": True}


class StaffPhotoUploadOut(BaseModel):
    photo_url: str
