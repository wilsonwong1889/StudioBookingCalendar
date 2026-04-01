from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.staff import StaffProfileOut
from app.services.staff_service import list_staff_profiles


router = APIRouter(prefix="/api", tags=["Staff"])


@router.get("/staff", response_model=List[StaffProfileOut])
def public_list_staff_profiles(
    db: Session = Depends(get_db),
):
    return [profile for profile in list_staff_profiles(db) if profile.active]
