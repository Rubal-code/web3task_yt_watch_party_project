"""MessageHandler: parses WebSocket events, validates permissions, dispatches actions.

Handles all WebSocket events including:
- join_room: Adds participant and sends current room state to them
- leave_room: Removes participant and broadcasts departure
- play/pause: HOST/MODERATOR only; updates playback state with optional time sync
- seek: HOST/MODERATOR only; seeks to a specific time
- change_video: HOST/MODERATOR only; changes the current video
- chat_message: ALL roles; broadcasts chat to the room
- assign_role: HOST only; changes a participant's role
- remove_participant: HOST only; kicks a participant
- transfer_host: HOST only; transfers host role

Security note: username and role are ALWAYS taken from the authenticated
Participant object, never from client-supplied payload fields.
"""

import uuid as _uuid
from datetime import datetime, timezone
from fastapi import WebSocket

from app.ws.connection_manager import ConnectionManager
from app.ws.permissions import Role, require_permission
from app.ws.room import Room


class MessageHandler:
    def __init__(self, room: Room, connection_manager: ConnectionManager) -> None:
        self.room = room
        self.connection_manager = connection_manager

    # ------------------------------------------------------------------
    # Join / Leave
    # ------------------------------------------------------------------

    async def handle_join_room(self, websocket: WebSocket, payload: dict) -> None:
        room_id = payload.get("roomId")
        username = payload.get("username")
        host_token = payload.get("hostToken")
        if not room_id or not username:
            await self._send_error(websocket, "INVALID_PAYLOAD", "roomId and username are required")
            return

        # Determine host role:
        # Match host_token against room_id, host_user_id, or room code,
        # or verify if username matches host_user_id.
        is_host = bool(
            host_token and (
                host_token == str(self.room.room_id)
                or host_token == self.room.host_user_id
                or host_token == str(self.room.code)
            )
        ) or (
            username == self.room.host_user_id
            and (
                host_token == self.room.host_user_id
                or host_token == str(self.room.room_id)
                or not any(p.role == Role.HOST for p in self.room.participants.values())
            )
        )

        role = Role.HOST if is_host else Role.PARTICIPANT
        user_id = username
        await self.room.add_participant(user_id, username, role, websocket)

        # Broadcast user_joined to everyone (including the new user)
        await self.connection_manager.broadcast(
            str(self.room.room_id),
            {
                "event": "user_joined",
                "payload": {
                    "username": username,
                    "userId": user_id,
                    "role": role.value,
                    "participants": self.room.get_participant_list(),
                },
            },
        )

        # Send the current room state directly to the newly joined participant
        # so they immediately load the correct video and playback position
        await self.connection_manager.send_personal(
            websocket,
            {"event": "sync_state", "payload": self.room.get_state()},
        )

    async def handle_leave_room(self, websocket: WebSocket, payload: dict) -> None:
        user_id = payload.get("userId")
        if not user_id:
            await self._send_error(websocket, "INVALID_PAYLOAD", "userId is required")
            return
        participant = await self.room.remove_participant(user_id, websocket=websocket)
        if participant:
            await self.connection_manager.broadcast(
                str(self.room.room_id),
                {
                    "event": "user_left",
                    "payload": {
                        "username": participant.username,
                        "userId": user_id,
                        "participants": self.room.get_participant_list(),
                    },
                },
            )

    # ------------------------------------------------------------------
    # Playback control (HOST / MODERATOR only)
    # ------------------------------------------------------------------

    async def handle_play(self, websocket: WebSocket, payload: dict) -> None:
        """Accept play event with optional current time for time sync."""
        kwargs: dict = {"play_state": "playing"}
        time_value = payload.get("time")
        if time_value is not None:
            try:
                kwargs["current_time"] = float(time_value)
            except (TypeError, ValueError):
                pass
        await self._require_role_and_update(websocket, "play", **kwargs)

    async def handle_pause(self, websocket: WebSocket, payload: dict) -> None:
        """Accept pause event with optional current time for time sync."""
        kwargs: dict = {"play_state": "paused"}
        time_value = payload.get("time")
        if time_value is not None:
            try:
                kwargs["current_time"] = float(time_value)
            except (TypeError, ValueError):
                pass
        await self._require_role_and_update(websocket, "pause", **kwargs)

    async def handle_seek(self, websocket: WebSocket, payload: dict) -> None:
        time_value = payload.get("time")
        if time_value is None:
            await self._send_error(websocket, "INVALID_PAYLOAD", "time is required for seek")
            return
        participant = self._get_sender_participant(websocket)
        if participant is None:
            await self._send_error(websocket, "NOT_JOINED", "You must join the room first")
            return
        try:
            require_permission(participant.role, "seek")
        except PermissionError as exc:
            await self._send_error(websocket, "FORBIDDEN", str(exc))
            return
        async with self.room.lock:
            await self.room.set_state(current_time=float(time_value))
            await self.connection_manager.broadcast(
                str(self.room.room_id),
                {"event": "sync_state", "payload": self.room.get_state()},
            )

    async def handle_change_video(self, websocket: WebSocket, payload: dict) -> None:
        video_id = payload.get("videoId")
        if not video_id:
            await self._send_error(websocket, "INVALID_PAYLOAD", "videoId is required for change_video")
            return
        participant = self._get_sender_participant(websocket)
        if participant is None:
            await self._send_error(websocket, "NOT_JOINED", "You must join the room first")
            return
        try:
            require_permission(participant.role, "change_video")
        except PermissionError as exc:
            await self._send_error(websocket, "FORBIDDEN", str(exc))
            return
        async with self.room.lock:
            await self.room.set_state(video_id=video_id, current_time=0.0, play_state="paused")
            await self.connection_manager.broadcast(
                str(self.room.room_id),
                {"event": "sync_state", "payload": self.room.get_state()},
            )

    # ------------------------------------------------------------------
    # Chat (all roles)
    # ------------------------------------------------------------------

    async def handle_chat_message(self, websocket: WebSocket, payload: dict) -> None:
        """Broadcast a validated chat message to the entire room.

        Security: username and userId are taken from the authenticated
        Participant object, NOT from client payload fields. This prevents
        users from spoofing each other's identity in chat.
        """
        message = payload.get("message", "")
        if isinstance(message, str):
            message = message.strip()
        else:
            message = ""

        if not message:
            await self._send_error(websocket, "INVALID_PAYLOAD", "message cannot be empty")
            return

        if len(message) > 500:
            await self._send_error(
                websocket, "INVALID_PAYLOAD", "message too long (max 500 characters)"
            )
            return

        participant = self._get_sender_participant(websocket)
        if participant is None:
            await self._send_error(websocket, "NOT_JOINED", "You must join the room first")
            return

        try:
            require_permission(participant.role, "chat_message")
        except PermissionError as exc:
            await self._send_error(websocket, "FORBIDDEN", str(exc))
            return

        msg_id = str(_uuid.uuid4())
        timestamp = datetime.now(timezone.utc).isoformat()

        # Broadcast to ALL participants in this room (including sender)
        await self.connection_manager.broadcast(
            str(self.room.room_id),
            {
                "event": "chat_message",
                "payload": {
                    "messageId": msg_id,
                    "userId": participant.user_id,
                    "username": participant.username,
                    "message": message,
                    "timestamp": timestamp,
                },
            },
        )

    # ------------------------------------------------------------------
    # Host-only admin actions
    # ------------------------------------------------------------------

    async def handle_assign_role(self, websocket: WebSocket, payload: dict) -> None:
        target_user_id = payload.get("userId")
        new_role_str = payload.get("role")
        if not target_user_id or not new_role_str:
            await self._send_error(websocket, "INVALID_PAYLOAD", "userId and role are required")
            return
        try:
            new_role = Role(new_role_str)
        except ValueError:
            await self._send_error(websocket, "INVALID_PAYLOAD", f"Invalid role: {new_role_str}")
            return
        if new_role == Role.HOST:
            await self._send_error(websocket, "INVALID_PAYLOAD", "Use transfer_host to change the host")
            return
        sender = self._get_sender_participant(websocket)
        if sender is None:
            await self._send_error(websocket, "NOT_JOINED", "You must join the room first")
            return
        try:
            require_permission(sender.role, "assign_role")
        except PermissionError as exc:
            await self._send_error(websocket, "FORBIDDEN", str(exc))
            return
        target = self.room.get_participant(target_user_id)
        if target is None:
            await self._send_error(websocket, "NOT_FOUND", f"Participant {target_user_id} not found")
            return
        async with self.room.lock:
            target.role = new_role
            await self.connection_manager.broadcast(
                str(self.room.room_id),
                {
                    "event": "role_assigned",
                    "payload": {
                        "userId": target_user_id,
                        "username": target.username,
                        "role": new_role.value,
                        "participants": self.room.get_participant_list(),
                    },
                },
            )

    async def handle_remove_participant(self, websocket: WebSocket, payload: dict) -> None:
        target_user_id = payload.get("userId")
        if not target_user_id:
            await self._send_error(websocket, "INVALID_PAYLOAD", "userId is required")
            return
        sender = self._get_sender_participant(websocket)
        if sender is None:
            await self._send_error(websocket, "NOT_JOINED", "You must join the room first")
            return
        try:
            require_permission(sender.role, "remove_participant")
        except PermissionError as exc:
            await self._send_error(websocket, "FORBIDDEN", str(exc))
            return
        target = self.room.get_participant(target_user_id)
        if target is None:
            await self._send_error(websocket, "NOT_FOUND", f"Participant {target_user_id} not found")
            return
        async with self.room.lock:
            await self.room.remove_participant(target_user_id)
            await self.connection_manager.broadcast(
                str(self.room.room_id),
                {
                    "event": "participant_removed",
                    "payload": {
                        "userId": target_user_id,
                        "participants": self.room.get_participant_list(),
                    },
                },
            )

    async def handle_transfer_host(self, websocket: WebSocket, payload: dict) -> None:
        target_user_id = payload.get("userId")
        if not target_user_id:
            await self._send_error(websocket, "INVALID_PAYLOAD", "userId is required")
            return
        sender = self._get_sender_participant(websocket)
        if sender is None:
            await self._send_error(websocket, "NOT_JOINED", "You must join the room first")
            return
        try:
            require_permission(sender.role, "transfer_host")
        except PermissionError as exc:
            await self._send_error(websocket, "FORBIDDEN", str(exc))
            return
        target = self.room.get_participant(target_user_id)
        if target is None:
            await self._send_error(websocket, "NOT_FOUND", f"Participant {target_user_id} not found")
            return
        async with self.room.lock:
            old_host = self.room.get_participant(self.room.host_user_id)
            if old_host:
                old_host.role = Role.PARTICIPANT
            self.room.host_user_id = target_user_id
            target.role = Role.HOST
            await self.connection_manager.broadcast(
                str(self.room.room_id),
                {
                    "event": "role_assigned",
                    "payload": {
                        "userId": target_user_id,
                        "username": target.username,
                        "role": Role.HOST.value,
                        "participants": self.room.get_participant_list(),
                    },
                },
            )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _require_role_and_update(
        self, websocket: WebSocket, action: str, **state_updates
    ) -> None:
        participant = self._get_sender_participant(websocket)
        if participant is None:
            await self._send_error(websocket, "NOT_JOINED", "You must join the room first")
            return
        try:
            require_permission(participant.role, action)
        except PermissionError as exc:
            await self._send_error(websocket, "FORBIDDEN", str(exc))
            return
        async with self.room.lock:
            await self.room.set_state(**state_updates)
            await self.connection_manager.broadcast(
                str(self.room.room_id),
                {"event": "sync_state", "payload": self.room.get_state()},
            )

    def _get_sender_participant(self, websocket: WebSocket):
        for participant in self.room.participants.values():
            if participant.websocket is websocket:
                return participant
        return None

    async def _send_error(self, websocket: WebSocket, code: str, message: str) -> None:
        await self.connection_manager.send_personal(
            websocket,
            {"event": "error", "payload": {"code": code, "message": message}},
        )
