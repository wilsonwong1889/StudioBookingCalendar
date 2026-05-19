from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.room import Room
from app.schemas.review import RoomReviewFeedOut
from app.schemas.room import RoomCreate, RoomOut, RoomUpdate
from app.core.dependencies import get_admin_user, get_optional_current_user
from app.models.user import User
from app.roles import user_has_admin_access
from app.services.booking_service import create_audit_log, list_room_reviews

router = APIRouter(prefix="/api/rooms", tags=["Rooms"])

@router.get("", response_model=List[RoomOut])
def list_rooms(
    include_inactive: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user)
):
    query = db.query(Room)
    if include_inactive:
        if not current_user or not user_has_admin_access(current_user):
            raise HTTPException(status_code=403, detail="Admin access required")
        return query.order_by(Room.created_at.desc()).all()
    # Public view: show active rooms AND coming-soon rooms (visible but not bookable)
    return (
        query.filter((Room.active.is_(True)) | (Room.coming_soon.is_(True)))
        .order_by(Room.created_at.desc())
        .all()
    )

@router.get("/{room_id}", response_model=RoomOut)
def get_room(
    room_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user)
):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room or (not room.active and not (current_user and user_has_admin_access(current_user))):
        raise HTTPException(status_code=404, detail="Room not found")
    return room


@router.get("/{room_id}/reviews", response_model=RoomReviewFeedOut)
def get_room_review_feed(
    room_id: str,
    limit: int = Query(default=6, ge=1, le=12),
    db: Session = Depends(get_db),
):
    try:
        return list_room_reviews(db, room_id, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

@router.post("", response_model=RoomOut, status_code=201)
def create_room(
    payload: RoomCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    room = Room(**payload.model_dump())
    db.add(room)
    db.flush()
    create_audit_log(
        db,
        actor_id=admin.id,
        booking_id=None,
        action="room_created",
        details={"room_id": str(room.id), "name": room.name},
    )
    db.commit()
    db.refresh(room)
    return room


@router.delete("/{room_id}", status_code=204)
def archive_room(
    room_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    room.active = False
    create_audit_log(
        db,
        actor_id=admin.id,
        booking_id=None,
        action="room_archived",
        details={"room_id": room_id, "name": room.name},
    )
    db.commit()
    return Response(status_code=204)


@router.delete("/{room_id}/permanent", status_code=204)
def delete_room_permanently(
    room_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    create_audit_log(
        db,
        actor_id=admin.id,
        booking_id=None,
        action="room_permanently_deleted",
        details={"room_id": room_id, "name": room.name},
    )
    db.delete(room)
    db.commit()
    return Response(status_code=204)


@router.post("/{room_id}/restore", response_model=RoomOut)
def restore_room(
    room_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    room.active = True
    create_audit_log(
        db,
        actor_id=admin.id,
        booking_id=None,
        action="room_restored",
        details={"room_id": room_id, "name": room.name},
    )
    db.commit()
    db.refresh(room)
    return room

@router.put("/{room_id}", response_model=RoomOut)
def update_room(
    room_id: str,
    payload: RoomUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    update_data = payload.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(room, field, value)
    create_audit_log(
        db,
        actor_id=admin.id,
        booking_id=None,
        action="room_updated",
        details={"room_id": room_id, "updated_fields": sorted(update_data.keys())},
    )
    db.commit()
    db.refresh(room)
    return room
