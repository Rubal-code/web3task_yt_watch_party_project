"""In-memory representation of a connected participant in a room."""

from app.ws.permissions import Role


class Participant:
    """A participant connected to a watch party room.

    Attributes:
        user_id: Unique identifier for the user.
        username: Display name.
        role: Role within the room (HOST, MODERATOR, PARTICIPANT).
        websocket: The active WebSocket connection for this participant.
    """

    def __init__(self, user_id: str, username: str, role: Role, websocket) -> None:
        self.user_id = user_id
        self.username = username
        self.role = role
        self.websocket = websocket

    def to_dict(self) -> dict:
        """Serialize participant info for broadcast messages."""
        return {
            "userId": self.user_id,
            "username": self.username,
            "role": self.role.value,
        }