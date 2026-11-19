"""In-memory room state for a watch party.

Holds participants, playback state, and a per-room asyncio.Lock to
serialize concurrent WebSocket events. Live state is NOT persisted;
only room metadata lives in PostgreSQL.
"""

import asyncio
import uuid
from datetime import datetime, timezone

from app.ws.participant import Participant
from app.ws.permissions import Role


class Room:
    """In-memory state for a single watch party room.

    Attributes:
        room_id: UUID identifier for the room.
        code: Short join code.
        host_user_id: User ID of the room's host.
        participants: Mapping of user_id -> Participant.
        play_state: "playing" or "paused".
        current_time: Current playback timestamp in seconds.
        video_id: YouTube video ID currently queued.
        lock: asyncio.Lock to prevent race conditions on concurrent events.
    """

    def __init__(self, room_id: uuid.UUID, code: str, host_user_id: str) -> None:
        self.room_id = room_id
        self.code = code
        self.host_user_id = host_user_id
        self.participants: dict[str, Participant] = {}
        self.play_state: str = "paused"
        self.current_time: float = 0.0
        self.video_id: str | None = None
        self.lock = asyncio.Lock()
        self.created_at = datetime.now(timezone.utc)

    async def add_participant(
        self, user_id: str, username: str, role: Role, websocket
    ) -> Participant:
        """Add a participant to the room and return the Participant object."""
        async with self.lock:
            participant = Participant(user_id, username, role, websocket)
            self.participants[user_id] = participant
            return participant

    async def remove_participant(self, user_id: str, websocket=None) -> Participant | None:
        """Remove a participant by user_id.

        If a websocket is provided, only remove if the participant's active
        websocket matches. This ensures that an old socket closing (e.g. from
        React StrictMode or a fast reconnect) will never evict a newer active socket.
        """
        async with self.lock:
            existing = self.participants.get(user_id)
            if existing is None:
                return None
            if websocket is not None and existing.websocket is not websocket:
                # Newer connection has already taken over for this participant.
                return None
            return self.participants.pop(user_id, None)

    def get_participant(self, user_id: str) -> Participant | None:
        """Return the Participant for user_id, or None if not present."""
        return self.participants.get(user_id)

    def is_host(self, user_id: str) -> bool:
        """Return True if user_id is the room's host."""
        return user_id == self.host_user_id

    def get_participant_list(self) -> list[dict]:
        """Return serialized info for all participants."""
        return [p.to_dict() for p in self.participants.values()]

    def get_state(self) -> dict:
        """Return the current playback state for broadcast."""
        return {
            "playState": self.play_state,
            "currentTime": self.current_time,
            "videoId": self.video_id,
        }

    async def set_state(
        self, play_state: str | None = None, current_time: float | None = None, video_id: str | None = None
    ) -> None:
        """Update playback state fields that are provided."""
        if play_state is not None:
            self.play_state = play_state
        if current_time is not None:
            self.current_time = current_time
        if video_id is not None:
            self.video_id = video_id
