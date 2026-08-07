import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.monitor_repository import validate_monitor_settings

client = TestClient(app)

def test_monitor_line_height_api():
    # 1. GET /api/v1/monitor/settings
    res = client.get("/api/v1/monitor/settings")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"

    # 2. PUT /api/v1/monitor/settings with custom lineHeight
    payload = {
        "layoutMode": "custom_canvas",
        "currentBox": {
            "leftPct": 5.0,
            "topPct": 5.0,
            "widthPct": 90.0,
            "heightPct": 42.0,
            "fontSize": 30,
            "lineHeight": 1.8
        },
        "nextBox": {
            "leftPct": 5.0,
            "topPct": 51.0,
            "widthPct": 90.0,
            "heightPct": 42.0,
            "fontSize": 24,
            "lineHeight": 1.2
        }
    }
    res_put = client.put("/api/v1/monitor/settings", json=payload)
    assert res_put.status_code == 200

    # 3. GET verify saved values
    res_get = client.get("/api/v1/monitor/settings")
    assert res_get.status_code == 200
    settings = res_get.json()["data"]
    assert settings["currentBox"]["lineHeight"] == 1.8
    assert settings["nextBox"]["lineHeight"] == 1.2

def test_monitor_line_height_validation():
    # Out of range test
    invalid_settings = {
        "currentBox": {
            "leftPct": 5.0,
            "topPct": 5.0,
            "widthPct": 90.0,
            "heightPct": 42.0,
            "fontSize": 30,
            "lineHeight": 5.5  # Invalid (> 4.0)
        }
    }
    with pytest.raises(ValueError):
        validate_monitor_settings(invalid_settings)
