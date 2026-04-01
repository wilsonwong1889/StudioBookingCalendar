from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.room import Room
from app.schemas.room import RoomCreate, RoomOut, RoomUpdate
from app.core.dependencies import get_admin_user, get_optional_current_user
from app.models.user import User

router = APIRouter(prefix="/api/rooms", tags=["Rooms"])

@router.get("", response_model=List[RoomOut])
def list_rooms(
    include_inactive: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user)
):
    query = db.query(Room)
    if include_inactive:
        if not current_user or not current_user.is_admin:
            raise HTTPException(status_code=403, detail="Admin access required")
        return query.order_by(Room.created_at.desc()).all()
    return query.filter(Room.active.is_(True)).order_by(Room.created_at.desc()).all()

@router.get("/{room_id}", response_model=RoomOut)
def get_room(
    room_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user)
):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room or (not room.active and not (current_user and current_user.is_admin)):
        raise HTTPException(status_code=404, detail="Room not found")
    return room

@router.post("", response_model=RoomOut, status_code=201)
def create_room(
    payload: RoomCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    room = Room(**payload.model_dump())
    db.add(room)
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
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(room, field, value)
    db.commit()
    db.refresh(room)
    return room
