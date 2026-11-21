import asyncio
import json
import queue

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.schemas import ProjectData, Slide
from backend.services import websocket_handler
from backend.services.connection_manager import ConnectionManager, manager


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(manager, "project_data", ProjectData(
        id="presence_test", slides=[Slide(id="slide_1", name="Before")]
    ))
    monkeypatch.setattr(manager, "sessions", {role: set() for role in ("editor", "presenter", "viewer")})
    monkeypatch.setattr(manager, "locked_slides", {})
    return TestClient(app)


def receive_json(ws):
    message = ws._send_queue.get(timeout=2)
    assert message["type"] == "websocket.send"
    return json.loads(message["text"])


@pytest.mark.anyio
async def test_initial_sync_failure_removes_registered_connection(monkeypatch):
    class FailingInitialSyncSocket:
        async def accept(self):
            pass

        async def send_text(self, payload):
            raise RuntimeError("simulated initial sync failure")

        async def receive_text(self):
            pytest.fail("a failed initial sync must stop before receiving")

    isolated_manager = ConnectionManager()
    monkeypatch.setattr(websocket_handler, "manager", isolated_manager)
    websocket = FailingInitialSyncSocket()

    await websocket_handler.handle_websocket_session(websocket, "editor")

    assert websocket not in isolated_manager.sessions["editor"]


@pytest.mark.anyio
async def test_cancelled_session_removes_connection_and_owned_lock(monkeypatch):
    class CancelledSocket:
        async def accept(self):
            pass

        async def send_text(self, payload):
            pass

        async def receive_text(self):
            isolated_manager.locked_slides["slide_1"] = str(id(self))
            raise asyncio.CancelledError()

    isolated_manager = ConnectionManager()
    monkeypatch.setattr(websocket_handler, "manager", isolated_manager)
    websocket = CancelledSocket()

    with pytest.raises(asyncio.CancelledError):
        await websocket_handler.handle_websocket_session(websocket, "editor")

    assert websocket not in isolated_manager.sessions["editor"]
    assert not isolated_manager.locked_slides


@pytest.mark.anyio
async def test_broadcast_send_failure_removes_connection_and_owned_lock():
    class FailingSocket:
        async def send_text(self, payload):
            raise RuntimeError("simulated send failure")

    isolated_manager = ConnectionManager()
    websocket = FailingSocket()
    isolated_manager.sessions["editor"].add(websocket)
    isolated_manager.locked_slides["slide_1"] = str(id(websocket))

    await isolated_manager.broadcast({"type": "SLIDE_UPDATED"})

    assert websocket not in isolated_manager.sessions["editor"]
    assert "slide_1" not in isolated_manager.locked_slides


def test_save_from_non_owner_is_rejected(client, monkeypatch):
    async def save_project_data(_project):
        pytest.fail("a non-owner save must not persist")

    monkeypatch.setattr(websocket_handler, "save_project_data", save_project_data)
    with client.websocket_connect("/ws?role=editor") as ws:
        receive_json(ws)
        ws.send_json({"type": "LOCK_SLIDE", "slideId": "slide_1", "requestId": "owner-lock"})
        granted = receive_json(ws)
        assert granted["type"] == "LOCK_GRANTED"
        assert granted["requestId"] == "owner-lock"

    manager.locked_slides["slide_1"] = "another-connection"
    with client.websocket_connect("/ws?role=editor") as ws:
        receive_json(ws)
        ws.send_json({
            "type": "SAVE_SLIDE",
            "requestId": "non-owner-save",
            "slide": {"id": "slide_1", "name": "Unauthorized"},
        })
        result = receive_json(ws)

    assert result["type"] == "SAVE_SLIDE_RESULT"
    assert result["requestId"] == "non-owner-save"
    assert result["success"] is False
    assert manager.project_data.slides[0].name == "Before"


def test_lock_grant_is_sent_only_to_requesting_connection(client):
    with client.websocket_connect("/ws?role=editor") as owner:
        receive_json(owner)
        with client.websocket_connect("/ws?role=editor") as contender:
            receive_json(contender)
            owner.send_json({"type": "LOCK_SLIDE", "slideId": "slide_1", "requestId": "first"})
            granted = receive_json(owner)
            assert granted["type"] == "LOCK_GRANTED"
            assert granted["requestId"] == "first"
            assert receive_json(owner)["type"] == "SLIDE_LOCKED"
            assert receive_json(contender)["type"] == "SLIDE_LOCKED"

            contender.send_json({"type": "LOCK_SLIDE", "slideId": "slide_1", "requestId": "second"})
            failed = receive_json(contender)
            assert failed["type"] == "LOCK_FAILED"
            assert failed["requestId"] == "second"

            with pytest.raises(queue.Empty):
                contender._send_queue.get(timeout=0.05)
