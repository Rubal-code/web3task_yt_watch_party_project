"""FastAPI application entry point.

Registers CORS middleware, REST routers, and the WebSocket endpoint.
Manages in-memory room state and connects WebSocket clients to the
MessageHandler for role-based event processing.

WebSocket disconnect handling:
  When a client disconnects (intentionally or due to network error), the
  finally block cleans up the socket and removes the participant only if
  their active socket matches, broadcasting user_left to remaining clients.
"""

import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import settings
from app.database import engine, Base, SessionLocal
from app.routers import rooms as rooms_router
from app.ws.connection_manager import ConnectionManager
from app.ws.message_handler import MessageHandler
from app.ws.room import Room
from app.ws.permissions import Role
from app.models import Room as RoomModel


# In-memory registry: room_id (str) -> Room
rooms: dict[str, Room] = {}
# Per-room message handlers: room_id (str) -> MessageHandler
handlers: dict[str, MessageHandler] = {}
# Shared connection manager
connection_manager = ConnectionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create DB tables on startup and clean up on shutdown."""
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="YouTube Watch Party Backend",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# REST routers
app.include_router(rooms_router.router)


@app.get("/health")
async def health():
    """Health check."""
    return {"status": "ok"}


def _get_or_create_room(room_id_str: str) -> Room | None:
    """Return an existing in-memory Room or load one from the database."""
    if room_id_str in rooms:
        return rooms[room_id_str]

    try:
        room_uuid = uuid.UUID(room_id_str)
    except ValueError:
        return None

    db = SessionLocal()
    try:
        db_room = db.query(RoomModel).filter(RoomModel.id == room_uuid).first()
    finally:
        db.close()

    if db_room is None:
        return None

    room = Room(room_uuid, db_room.code, db_room.host_user_id)
    rooms[room_id_str] = room
    handlers[room_id_str] = MessageHandler(room, connection_manager)
    return room


@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    """WebSocket endpoint for a watch party room.

    Client sends JSON envelopes: { "event": "<name>", "payload": {...} }

    Server-to-client events:
        user_joined, user_left, sync_state, role_assigned,
        participant_removed, chat_message, error

    Client-to-server events:
        join_room, leave_room, play, pause, seek, change_video,
        chat_message, assign_role, remove_participant, transfer_host

    On disconnect (intentional or network drop), the participant is
    cleaned up and user_left is broadcast to remaining users.
    """
    room = _get_or_create_room(room_id)
    if room is None:
        await websocket.close(code=4004, reason="Room not found")
        return

    handler = handlers[room_id]
    await connection_manager.connect(room_id, websocket)

    _joined_user_id: str | None = None

    try:
        while True:
            envelope = await websocket.receive_json()
            event = envelope.get("event")
            payload = envelope.get("payload", {})

            if event == "join_room":
                await handler.handle_join_room(websocket, payload)
                if payload.get("username"):
                    _joined_user_id = payload["username"]
            elif event == "leave_room":
                await handler.handle_leave_room(websocket, payload)
                _joined_user_id = None
            elif event == "play":
                await handler.handle_play(websocket, payload)
            elif event == "pause":
                await handler.handle_pause(websocket, payload)
            elif event == "seek":
                await handler.handle_seek(websocket, payload)
            elif event == "change_video":
                await handler.handle_change_video(websocket, payload)
            elif event == "chat_message":
                await handler.handle_chat_message(websocket, payload)
            elif event == "assign_role":
                await handler.handle_assign_role(websocket, payload)
            elif event == "remove_participant":
                await handler.handle_remove_participant(websocket, payload)
            elif event == "transfer_host":
                await handler.handle_transfer_host(websocket, payload)
            else:
                await handler._send_error(websocket, "UNKNOWN_EVENT", f"Unknown event: {event}")
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        print(f"[WS error in {room_id}]: {exc}")
    finally:
        connection_manager.disconnect(room_id, websocket)
        if _joined_user_id:
            # Pass websocket so we only remove this participant if it hasn't
            # already been replaced by a newly reconnected socket
            participant = await room.remove_participant(_joined_user_id, websocket=websocket)
            if participant:
                try:
                    await connection_manager.broadcast(
                        str(room.room_id),
                        {
                            "event": "user_left",
                            "payload": {
                                "username": participant.username,
                                "userId": _joined_user_id,
                                "participants": room.get_participant_list(),
                            },
                        },
                    )
                except Exception:
                    pass
