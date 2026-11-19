"""REST endpoints for room management.

- POST /api/rooms        : create a new room
- GET  /api/rooms/{code} : get room metadata by join code
- GET  /health           : health check
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db, Base, engine
from app.models import Room
from app.schemas import RoomCreate, RoomResponse, HealthResponse

router = APIRouter(prefix="/api", tags=["rooms"])


@router.on_event("startup")
def init_db():
    """Create database tables on startup."""
    Base.metadata.create_all(bind=engine)


@router.post("/rooms", response_model=RoomResponse, status_code=201)
def create_room(room_in: RoomCreate, db: Session = Depends(get_db)):
    """Create a new watch party room.

    Generates a unique 6-character join code and persists room metadata.
    Returns the room ID, code, and host user ID.
    """
    code = uuid.uuid4().hex[:6].upper()
    # Ensure code is unique
    while db.query(Room).filter(Room.code == code).first():
        code = uuid.uuid4().hex[:6].upper()

    db_room = Room(code=code, host_user_id=room_in.host_user_id)
    db.add(db_room)
    db.commit()
    db.refresh(db_room)
    return db_room


@router.get("/rooms/{code}", response_model=RoomResponse)
def get_room(code: str, db: Session = Depends(get_db)):
    """Get room metadata by join code.

    Returns room ID, code, host user ID, and creation timestamp.
    """
    db_room = db.query(Room).filter(Room.code == code).first()
    if not db_room:
        raise HTTPException(status_code=404, detail="Room not found")
    return db_room


@router.get("/health", response_model=HealthResponse, tags=["health"])
def health():
    """Health check endpoint for Render."""
    return HealthResponse(status="ok")