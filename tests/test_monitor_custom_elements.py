import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.monitor_repository import get_monitor_settings, update_monitor_settings, MonitorSettingsRepository

client = TestClient(app)

def test_monitor_custom_elements_repository(tmp_path):
    db_file = str(tmp_path / "test_monitor_custom.db")
    repo = MonitorSettingsRepository(db_file)

    settings = repo.get_settings("default_profile")
    assert settings is not None
    assert "customElements" in settings
    assert settings["customElements"] == []

    payload = {
        "layoutMode": "custom_canvas",
        "currentBox": settings["currentBox"],
        "nextBox": settings["nextBox"],
        "customElements": [
            {
                "id": "elem_rect_1",
                "type": "rect",
                "x": 10.0,
                "y": 20.0,
                "width": 15.0,
                "height": 10.0,
                "style": {"fillColor": "#6366f1"}
            },
            {
                "id": "elem_img_1",
                "type": "image",
                "x": 30.0,
                "y": 40.0,
                "width": 20.0,
                "height": 20.0,
                "style": {"src": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="}
            }
        ]
    }

    updated = repo.update_settings(payload, "default_profile")
    assert len(updated["customElements"]) == 2
    assert updated["customElements"][0]["type"] == "rect"
    assert updated["customElements"][1]["type"] == "image"

def test_monitor_custom_elements_api():
    response = client.get("/api/v1/monitor/settings")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "customElements" in data["data"]

    payload = data["data"]
    payload["customElements"] = [
        {"id": "test_shape", "type": "circle", "x": 50, "y": 50, "width": 10, "height": 10}
    ]

    put_res = client.put("/api/v1/monitor/settings", json=payload)
    assert put_res.status_code == 200
    assert put_res.json()["status"] == "success"

    get_again = client.get("/api/v1/monitor/settings")
    assert get_again.status_code == 200
    assert len(get_again.json()["data"]["customElements"]) == 1
    assert get_again.json()["data"]["customElements"][0]["id"] == "test_shape"

    # Clean up test pollution
    payload["customElements"] = []
    client.put("/api/v1/monitor/settings", json=payload)

