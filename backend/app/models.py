"""SQLAlchemy ORM models for the Watch Party backend.

Only room metadata is persisted in PostgreSQL. Live participant and
playback state lives in memory (see app.ws.room and app.ws.participant).
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import DateTime, String
from sqlalchemy.types import Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Room(Base):
    """A watch party room.

    Attributes:
        id: Primary key UUID.
        code: Short unique join code (e.g. 6 alphanumeric chars).
        host_user_id: User ID of the room creator/host.
        created_at: Timestamp when the room was created.
    """

    __tablename__ = "rooms"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True, nullable=False)
    host_user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)