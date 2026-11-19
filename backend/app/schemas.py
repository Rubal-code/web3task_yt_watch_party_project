"""Pydantic schemas for REST requests and responses.

Defines the request/response contracts for the rooms API endpoints.
JSON keys use camelCase (roomId, hostToken) per the API spec.
"""

from pydantic import BaseModel, Field, ConfigDict
from uuid import UUID
from datetime import datetime


class RoomCreate(BaseModel):
    """Request body for creating a new room."""

    host_user_id: str = Field(..., min_length=1, description="User ID of the room host")


class RoomResponse(BaseModel):
    """Response returned after creating or fetching a room.

    SQLAlchemy attribute `id` is serialized as JSON key `roomId`;
    `host_user_id` is serialized as `hostToken`.
    """

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID = Field(alias="roomId")
    code: str
    host_user_id: str = Field(alias="hostToken")
    created_at: datetime


class HealthResponse(BaseModel):
    """Health check response."""

    status: str = "ok"