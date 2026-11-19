"""Role-based permission matrix for Watch Party actions.

Defines which roles are allowed to perform which actions, and provides
a helper to check permissions before mutating room state.

Permission matrix:
    HOST:        play, pause, seek, change_video, assign_role, remove_participant, transfer_host, chat_message
    MODERATOR:   play, pause, seek, change_video, chat_message
    PARTICIPANT: chat_message
"""

from enum import Enum


class Role(str, Enum):
    """Participant role within a room."""

    HOST = "HOST"
    MODERATOR = "MODERATOR"
    PARTICIPANT = "PARTICIPANT"


# Mapping from role -> set of permitted actions
PERMISSION_MATRIX: dict[Role, set[str]] = {
    Role.HOST: {
        "play",
        "pause",
        "seek",
        "change_video",
        "assign_role",
        "remove_participant",
        "transfer_host",
        "chat_message",
    },
    Role.MODERATOR: {
        "play",
        "pause",
        "seek",
        "change_video",
        "chat_message",
    },
    Role.PARTICIPANT: {
        "chat_message",
    },
}


def has_permission(role: Role, action: str) -> bool:
    """Return True if the given role is allowed to perform the action."""
    return action in PERMISSION_MATRIX.get(role, set())


def require_permission(role: Role, action: str) -> None:
    """Raise PermissionError if the role is not allowed to perform the action."""
    if not has_permission(role, action):
        raise PermissionError(
            f"Role '{role.value}' is not permitted to perform action '{action}'"
        )