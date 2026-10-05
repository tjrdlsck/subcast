import json

import pytest
from fastapi.testclient import TestClient

import backend.storage as storage
from backend.main import app
from backend.schemas import ProjectData, Slide
from backend.services import websocket_handler
from backend.services.connection_manager import manager


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(manager, "project_data", ProjectData(
        id="save_result_test", slides=[Slide(id="slide_1", name="Before")]
    ))
    monkeypatch.setattr(manager, "sessions", {role: set() for role in ("editor", "presenter", "viewer")})
    monkeypatch.setattr(manager, "locked_slides", {})
    return TestClient(app)


def receive_json(ws):
    # Bound missing-result regressions instead of hanging the test runner.
    message = ws._send_queue.get(timeout=2)
    assert message["type"] == "websocket.send"
    return json.loads(message["text"])


@pytest.mark.parametrize("is_live", [False, True])
def test_save_result_follows_persistence_and_broadcast(client, monkeypatch, is_live):
    if is_live:
        manager.project_data.settings.currentLiveSlideId = "slide_1"
    saved = False
    original_save = websocket_handler.save_project_data
    original_broadcast = manager.broadcast

    async def save(data):
        nonlocal saved
        await original_save(data)
        saved = True

    async def broadcast(message, role=None):
        if message["type"] == "SLIDE_UPDATED":
            assert saved
            on_disk = json.loads((storage.PROJECTS_DIR / "save_result_test.json").read_text(encoding="utf-8"))
            assert on_disk["slides"][0]["name"] == "After"
        await original_broadcast(message, role)

    monkeypatch.setattr(websocket_handler, "save_project_data", save)
    monkeypatch.setattr(manager, "broadcast", broadcast)
    with client.websocket_connect("/ws?role=editor") as ws:
        receive_json(ws)
        ws.send_json({"type": "SAVE_SLIDE", "requestId": "save-1", "slide": {"id": "slide_1", "name": "After"}})
        update = receive_json(ws)
        assert update["type"] == "SLIDE_UPDATED"
        assert update["isLive"] is is_live
        assert receive_json(ws) == {"type": "SAVE_SLIDE_RESULT", "requestId": "save-1", "success": True}
        assert saved


@pytest.mark.parametrize("slide_id", ["slide_1", "new_slide"])
def test_persistence_failure_restores_slide_and_allows_retry(client, monkeypatch, slide_id):
    original_slide = manager.project_data.slides[0]
    original_save = websocket_handler.save_project_data

    async def fail_save(data):
        raise OSError("private disk path")

    monkeypatch.setattr(websocket_handler, "save_project_data", fail_save)
    with client.websocket_connect("/ws?role=editor") as ws:
        receive_json(ws)
        ws.send_json({"type": "SAVE_SLIDE", "requestId": "failed", "slide": {"id": slide_id, "name": "Failed"}})
        result = receive_json(ws)
        assert result["type"] == "SAVE_SLIDE_RESULT"
        assert result["requestId"] == "failed"
        assert result["success"] is False
        assert "private disk path" not in json.dumps(result)
        assert manager.project_data.slides == [original_slide]
        assert manager.project_data.slides[0] is original_slide

        monkeypatch.setattr(websocket_handler, "save_project_data", original_save)
        ws.send_json({"type": "SAVE_SLIDE", "requestId": "retry", "slide": {"id": slide_id, "name": "Retry"}})
        assert receive_json(ws)["type"] == "SLIDE_UPDATED"
        assert receive_json(ws) == {"type": "SAVE_SLIDE_RESULT", "requestId": "retry", "success": True}


@pytest.mark.parametrize("slide", [{"id": "slide_1"}, None, "invalid"])
def test_invalid_slide_returns_failure_and_allows_next_request(client, slide):
    with client.websocket_connect("/ws?role=editor") as ws:
        receive_json(ws)
        ws.send_json({"type": "SAVE_SLIDE", "requestId": "invalid", "slide": slide})
        result = receive_json(ws)
        assert result["type"] == "SAVE_SLIDE_RESULT"
        assert result["requestId"] == "invalid"
        assert result["success"] is False
        assert manager.project_data.slides[0].name == "Before"
        ws.send_json({"type": "SAVE_SLIDE", "requestId": "next", "slide": {"id": "slide_1", "name": "Valid"}})
        assert receive_json(ws)["type"] == "SLIDE_UPDATED"
        assert receive_json(ws)["success"] is True


def test_legacy_save_keeps_slide_broadcast(client):
    with client.websocket_connect("/ws?role=editor") as ws:
        receive_json(ws)
        ws.send_json({"type": "SAVE_SLIDE", "slide": {"id": "slide_1", "name": "Legacy"}})
        assert receive_json(ws)["type"] == "SLIDE_UPDATED"
        ws.send_json({"type": "SAVE_SLIDE", "requestId": "next", "slide": {"id": "slide_1", "name": "Next"}})
        assert receive_json(ws)["type"] == "SLIDE_UPDATED"
        assert receive_json(ws)["requestId"] == "next"


def test_missing_project_returns_failure(client, monkeypatch):
    monkeypatch.setattr(manager, "project_data", None)
    with client.websocket_connect("/ws?role=editor") as ws:
        receive_json(ws)
        ws.send_json({"type": "SAVE_SLIDE", "requestId": "missing", "slide": {"id": "slide_1", "name": "After"}})
        result = receive_json(ws)
        assert result["type"] == "SAVE_SLIDE_RESULT"
        assert result["requestId"] == "missing"
        assert result["success"] is False
