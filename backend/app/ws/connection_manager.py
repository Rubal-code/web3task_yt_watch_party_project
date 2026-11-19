"""WebSocket connection manager.

Tracks active WebSocket connections per room and provides helper methods
to send messages to individual clients or broadcast to all clients in a room.
"""

from fastapi import WebSocket


class ConnectionManager:
    """Manages active WebSocket connections grouped by room ID."""

    def __init__(self) -> None:
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, room_id: str, websocket: WebSocket) -> None:
        """Accept a WebSocket and register it under the given room."""
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)

    def disconnect(self, room_id: str, websocket: WebSocket) -> None:
        """Remove a WebSocket from the room's connection list."""
        if room_id in self.active_connections:
            self.active_connections[room_id] = [
                ws for ws in self.active_connections[room_id] if ws is not websocket
            ]
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]

    async def send_personal(self, websocket: WebSocket, message: dict) -> None:
        """Send a JSON message to a single WebSocket client."""
        try:
            await websocket.send_json(message)
        except Exception:
            pass

    async def broadcast(self, room_id: str, message: dict) -> None:
        """Send a JSON message to all connected clients in a room.

        Uses a snapshot of active connections and catches exceptions per-client
        so that one failing or disconnected socket does not prevent other clients
        from receiving the broadcast.
        """
        connections = list(self.active_connections.get(room_id, []))
        dead_connections: list[WebSocket] = []

        for connection in connections:
            try:
                await connection.send_json(message)
            except Exception:
                dead_connections.append(connection)

        for dead in dead_connections:
            self.disconnect(room_id, dead)
