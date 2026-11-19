"""Tests for the REST room management endpoints."""

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


class TestCreateRoom:
    """Tests for POST /api/rooms."""

    def test_create_room_returns_room_id_code_and_host(self):
        """Creating a room should return roomId, code, and hostToken."""
        response = client.post(
            "/api/rooms",
            json={"host_user_id": "user-123"},
        )
        assert response.status_code == 201
        data = response.json()
        assert "roomId" in data
        assert "code" in data
        assert data["hostToken"] == "user-123"
        assert len(data["code"]) == 6

    def test_create_room_generates_unique_code(self):
        """Two rooms should have different join codes."""
        r1 = client.post("/api/rooms", json={"host_user_id": "user-1"}).json()
        r2 = client.post("/api/rooms", json={"host_user_id": "user-2"}).json()
        assert r1["code"] != r2["code"]

    def test_create_room_requires_host_user_id(self):
        """Missing host_user_id should return 422."""
        response = client.post("/api/rooms", json={})
        assert response.status_code == 422


class TestGetRoom:
    """Tests for GET /api/rooms/{code}."""

    def test_get_existing_room(self):
        """Fetching an existing room by code returns its metadata."""
        create = client.post("/api/rooms", json={"host_user_id": "user-123"})
        code = create.json()["code"]

        response = client.get(f"/api/rooms/{code}")
        assert response.status_code == 200
        data = response.json()
        assert data["code"] == code
        assert data["hostToken"] == "user-123"

    def test_get_nonexistent_room_returns_404(self):
        """Fetching a room with an invalid code returns 404."""
        response = client.get("/api/rooms/NOPE")
        assert response.status_code == 404


class TestHealth:
    """Tests for GET /health."""

    def test_health_returns_ok(self):
        """Health check should return status ok."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"