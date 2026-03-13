from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.room import Room
from app.schemas.room import RoomCreate, RoomOut, RoomUpdate
from app.core.dependencies import get_admin_user
from app.models.user import User

router = APIRouter(prefix="/api/rooms", tags=["Rooms"])

@router.get("", response_model=List[RoomOut])
def list_rooms(db: Session = Depends(get_db)):
    return db.query(Room).filter(Room.active == True).all()

@router.get("/{room_id}", response_model=RoomOut)
def get_room(room_id: str, db: Session = Depends(get_db)):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
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
