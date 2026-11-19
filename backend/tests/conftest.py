"""Pytest configuration and fixtures for the Watch Party backend tests.

Overrides DATABASE_URL to use an in-memory SQLite database so tests can run
without a PostgreSQL server. Provides an async test client for both REST
and WebSocket endpoints.
"""

import os
import uuid
import asyncio
from typing import Generator

# Set test environment before importing the app
os.environ["DATABASE_URL"] = "sqlite:///./test_watchparty.db"
os.environ["FRONTEND_ORIGIN"] = "http://localhost:5173"

import pytest
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.database import Base, engine, SessionLocal
from app.models import Room


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    """Create all tables before tests and drop them after."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    # Clean up the SQLite file
    try:
        os.remove("test_watchparty.db")
    except OSError:
        pass


@pytest.fixture
def db_session() -> Generator:
    """Provide a transactional SQLAlchemy session for a test."""
    connection = engine.connect()
    transaction = connection.begin()
    session = SessionLocal(bind=connection)
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client() -> Generator:
    """Provide a FastAPI TestClient for REST API testing."""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def sample_room(db_session):
    """Create a sample room in the database and return it."""
    room = Room(code="ABCDEF", host_user_id="host-user-1")
    db_session.add(room)
    db_session.commit()
    db_session.refresh(room)
    return room