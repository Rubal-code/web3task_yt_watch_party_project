"""WebSocket permission tests for the Watch Party backend.

Covers join role assignment, permission rejection, and host-only actions.

NOTE: After join_room, two messages are now received:
  1. user_joined (broadcast to all in room)
  2. sync_state  (personal, sent only to the joining websocket)
Helper _join() handles this correctly.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def _create_room_via_rest(host_user_id: str) -> dict:
    resp = client.post("/api/rooms", json={"host_user_id": host_user_id})
    assert resp.status_code == 201
    data = resp.json()
    data["room_id"] = data["roomId"]  # backward-compat key for tests
    return data


def _connect_ws(room_id: str):
    return client.websocket_connect(f"/ws/{room_id}")


def _send(ws, event: str, payload: dict):
    ws.send_json({"event": event, "payload": payload})


def _receive(ws) -> dict:
    return ws.receive_json()


def _join(ws, room_id: str, username: str, host_token: str = "nope") -> dict:
    """Join the room and consume both the user_joined broadcast and the
    personal sync_state message. Returns the user_joined message."""
    _send(ws, "join_room", {"roomId": room_id, "username": username, "hostToken": host_token})
    user_joined_msg = _receive(ws)   # user_joined broadcast
    _receive(ws)                     # sync_state personal message
    return user_joined_msg


class TestJoinRoleAssignment:
    def test_room_creator_becomes_host(self):
        room = _create_room_via_rest("creator-user")
        room_id = str(room["room_id"])
        with _connect_ws(room_id) as ws:
            msg = _join(ws, room_id, "Alice", host_token=room_id)
            assert msg["event"] == "user_joined"
            assert msg["payload"]["role"] == "HOST"
            assert msg["payload"]["username"] == "Alice"

    def test_other_users_become_participants(self):
        room = _create_room_via_rest("creator-user")
        room_id = str(room["room_id"])
        with _connect_ws(room_id) as ws:
            msg = _join(ws, room_id, "Bob", host_token="wrong-token")
            assert msg["event"] == "user_joined"
            assert msg["payload"]["role"] == "PARTICIPANT"

    def test_participant_list_includes_joined_user(self):
        room = _create_room_via_rest("creator-user")
        room_id = str(room["room_id"])
        with _connect_ws(room_id) as ws:
            msg = _join(ws, room_id, "Alice", host_token=room_id)
            participants = msg["payload"]["participants"]
            assert len(participants) == 1
            assert participants[0]["username"] == "Alice"
            assert participants[0]["role"] == "HOST"


class TestPermissionRejection:
    def test_participant_cannot_play(self):
        room = _create_room_via_rest("creator-user")
        room_id = str(room["room_id"])
        with _connect_ws(room_id) as ws:
            _join(ws, room_id, "Bob", host_token="nope")
            _send(ws, "play", {})
            msg = _receive(ws)
            assert msg["event"] == "error"
            assert msg["payload"]["code"] == "FORBIDDEN"

    def test_participant_cannot_pause(self):
        room = _create_room_via_rest("creator-user")
        room_id = str(room["room_id"])
        with _connect_ws(room_id) as ws:
            _join(ws, room_id, "Bob", host_token="nope")
            _send(ws, "pause", {})
            msg = _receive(ws)
            assert msg["event"] == "error"
            assert msg["payload"]["code"] == "FORBIDDEN"

    def test_participant_cannot_seek(self):
        room = _create_room_via_rest("creator-user")
        room_id = str(room["room_id"])
        with _connect_ws(room_id) as ws:
            _join(ws, room_id, "Bob", host_token="nope")
            _send(ws, "seek", {"time": 10})
            msg = _receive(ws)
            assert msg["event"] == "error"
            assert msg["payload"]["code"] == "FORBIDDEN"

    def test_participant_cannot_change_video(self):
        room = _create_room_via_rest("creator-user")
        room_id = str(room["room_id"])
        with _connect_ws(room_id) as ws:
            _join(ws, room_id, "Bob", host_token="nope")
            _send(ws, "change_video", {"videoId": "dQw4w9WgXcQ"})
            msg = _receive(ws)
            assert msg["event"] == "error"
            assert msg["payload"]["code"] == "FORBIDDEN"

    def test_host_can_play_and_pause(self):
        room = _create_room_via_rest("creator-user")
        room_id = str(room["room_id"])
        with _connect_ws(room_id) as ws:
            _join(ws, room_id, "Alice", host_token=room_id)
            _send(ws, "play", {})
            msg = _receive(ws)
            assert msg["event"] == "sync_state"
            assert msg["payload"]["playState"] == "playing"
            _send(ws, "pause", {})
            msg = _receive(ws)
            assert msg["event"] == "sync_state"
            assert msg["payload"]["playState"] == "paused"

    def test_host_play_with_time_syncs_current_time(self):
        room = _create_room_via_rest("creator-user")
        room_id = str(room["room_id"])
        with _connect_ws(room_id) as ws:
            _join(ws, room_id, "Alice", host_token=room_id)
            _send(ws, "play", {"time": 42.5})
            msg = _receive(ws)
            assert msg["event"] == "sync_state"
            assert msg["payload"]["playState"] == "playing"
            assert msg["payload"]["currentTime"] == 42.5


class TestHostOnlyRoleAssignment:
    def test_host_can_assign_moderator(self):
        room = _create_room_via_rest("creator-user")
        room_id = str(room["room_id"])
        with _connect_ws(room_id) as host_ws:
            _join(host_ws, room_id, "Alice", host_token=room_id)
            with _connect_ws(room_id) as bob_ws:
                _send(bob_ws, "join_room", {
                    "roomId": room_id, "username": "Bob", "hostToken": "nope",
                })
                _receive(bob_ws)  # Bob's own user_joined
                _receive(bob_ws)  # Bob's sync_state
                _receive(host_ws)  # Alice receives Bob's user_joined broadcast
                _send(host_ws, "assign_role", {
                    "userId": "Bob", "role": "MODERATOR",
                })
                msg = _receive(host_ws)
                assert msg["event"] == "role_assigned"
                assert msg["payload"]["userId"] == "Bob"
                assert msg["payload"]["role"] == "MODERATOR"

    def test_participant_cannot_assign_role(self):
        room = _create_room_via_rest("creator-user")
        room_id = str(room["room_id"])
        with _connect_ws(room_id) as alice_ws:
            _join(alice_ws, room_id, "Alice", host_token=room_id)
            with _connect_ws(room_id) as bob_ws:
                _send(bob_ws, "join_room", {
                    "roomId": room_id, "username": "Bob", "hostToken": "nope",
                })
                _receive(bob_ws)  # user_joined
                _receive(bob_ws)  # sync_state
                _send(bob_ws, "assign_role", {
                    "userId": "Alice", "role": "MODERATOR",
                })
                msg = _receive(bob_ws)
                assert msg["event"] == "error"
                assert msg["payload"]["code"] == "FORBIDDEN"

    def test_assign_role_invalid_role_rejected(self):
        room = _create_room_via_rest("creator-user")
        room_id = str(room["room_id"])
        with _connect_ws(room_id) as ws:
            _join(ws, room_id, "Alice", host_token=room_id)
            _send(ws, "assign_role", {
                "userId": "Bob", "role": "INVALID_ROLE",
            })
            msg = _receive(ws)
            assert msg["event"] == "error"
            assert msg["payload"]["code"] == "INVALID_PAYLOAD"


class TestChatMessage:
    """Tests for the chat_message WebSocket event."""

    def test_participant_can_send_chat(self):
        room = _create_room_via_rest("creator-user")
        room_id = str(room["room_id"])
        with _connect_ws(room_id) as ws:
            _join(ws, room_id, "Bob", host_token="nope")
            _send(ws, "chat_message", {"message": "Hello everyone!"})
            msg = _receive(ws)
            assert msg["event"] == "chat_message"
            assert msg["payload"]["username"] == "Bob"
            assert msg["payload"]["userId"] == "Bob"
            assert msg["payload"]["message"] == "Hello everyone!"
            assert "messageId" in msg["payload"]
            assert "timestamp" in msg["payload"]

    def test_host_can_send_chat(self):
        room = _create_room_via_rest("creator-user")
        room_id = str(room["room_id"])
        with _connect_ws(room_id) as ws:
            _join(ws, room_id, "Alice", host_token=room_id)
            _send(ws, "chat_message", {"message": "Welcome!"})
            msg = _receive(ws)
            assert msg["event"] == "chat_message"
            assert msg["payload"]["username"] == "Alice"
            assert msg["payload"]["message"] == "Welcome!"

    def test_empty_message_rejected(self):
        room = _create_room_via_rest("creator-user")
        room_id = str(room["room_id"])
        with _connect_ws(room_id) as ws:
            _join(ws, room_id, "Bob", host_token="nope")
            _send(ws, "chat_message", {"message": ""})
            msg = _receive(ws)
            assert msg["event"] == "error"
            assert msg["payload"]["code"] == "INVALID_PAYLOAD"

    def test_whitespace_only_message_rejected(self):
        room = _create_room_via_rest("creator-user")
        room_id = str(room["room_id"])
        with _connect_ws(room_id) as ws:
            _join(ws, room_id, "Bob", host_token="nope")
            _send(ws, "chat_message", {"message": "   "})
            msg = _receive(ws)
            assert msg["event"] == "error"
            assert msg["payload"]["code"] == "INVALID_PAYLOAD"

    def test_too_long_message_rejected(self):
        room = _create_room_via_rest("creator-user")
        room_id = str(room["room_id"])
        with _connect_ws(room_id) as ws:
            _join(ws, room_id, "Bob", host_token="nope")
            _send(ws, "chat_message", {"message": "x" * 501})
            msg = _receive(ws)
            assert msg["event"] == "error"
            assert msg["payload"]["code"] == "INVALID_PAYLOAD"

    def test_max_length_message_accepted(self):
        room = _create_room_via_rest("creator-user")
        room_id = str(room["room_id"])
        with _connect_ws(room_id) as ws:
            _join(ws, room_id, "Bob", host_token="nope")
            _send(ws, "chat_message", {"message": "x" * 500})
            msg = _receive(ws)
            assert msg["event"] == "chat_message"
            assert len(msg["payload"]["message"]) == 500

    def test_chat_broadcast_to_all_in_room(self):
        """Chat from one user should be received by everyone in the room."""
        room = _create_room_via_rest("creator-user")
        room_id = str(room["room_id"])
        with _connect_ws(room_id) as host_ws:
            _join(host_ws, room_id, "Alice", host_token=room_id)
            with _connect_ws(room_id) as bob_ws:
                _send(bob_ws, "join_room", {
                    "roomId": room_id, "username": "Bob", "hostToken": "nope",
                })
                _receive(bob_ws)   # Bob's user_joined
                _receive(bob_ws)   # Bob's sync_state
                _receive(host_ws)  # Alice receives Bob's user_joined broadcast

                # Bob sends a chat message
                _send(bob_ws, "chat_message", {"message": "Hey Alice!"})

                # Both Bob and Alice should receive the broadcast
                bob_msg = _receive(bob_ws)
                alice_msg = _receive(host_ws)

                assert bob_msg["event"] == "chat_message"
                assert bob_msg["payload"]["message"] == "Hey Alice!"
                assert alice_msg["event"] == "chat_message"
                assert alice_msg["payload"]["message"] == "Hey Alice!"
                assert alice_msg["payload"]["username"] == "Bob"

    def test_chat_not_received_in_other_rooms(self):
        """Chat messages must not cross room boundaries."""
        room1 = _create_room_via_rest("host-1")
        room2 = _create_room_via_rest("host-2")
        room1_id = str(room1["room_id"])
        room2_id = str(room2["room_id"])

        with _connect_ws(room1_id) as ws1:
            _join(ws1, room1_id, "Alice", host_token=room1_id)
            with _connect_ws(room2_id) as ws2:
                _join(ws2, room2_id, "Bob", host_token=room2_id)

                # Alice sends a message in room1
                _send(ws1, "chat_message", {"message": "Room 1 message"})
                msg = _receive(ws1)
                assert msg["event"] == "chat_message"

                # Bob in room2 should NOT receive Alice's message.
                # Send a message from Bob to confirm ws2 is still working
                # and hasn't buffered Alice's message.
                _send(ws2, "chat_message", {"message": "Room 2 message"})
                msg2 = _receive(ws2)
                assert msg2["event"] == "chat_message"
                assert msg2["payload"]["message"] == "Room 2 message"

    def test_chat_username_comes_from_authenticated_participant(self):
        """The server must use the authenticated username, not any spoofed field."""
        room = _create_room_via_rest("creator-user")
        room_id = str(room["room_id"])
        with _connect_ws(room_id) as ws:
            _join(ws, room_id, "LegitUser", host_token="nope")
            # Try to spoof the username in the payload (backend should ignore it)
            _send(ws, "chat_message", {
                "message": "Hello",
                "username": "FakeAdmin",  # This field should be ignored by backend
            })
            msg = _receive(ws)
            assert msg["event"] == "chat_message"
            # Username must come from the authenticated participant, not the payload
            assert msg["payload"]["username"] == "LegitUser"
