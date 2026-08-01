import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import init_monitor_db

@pytest.fixture(autouse=True)
def setup_test_db(tmp_path, monkeypatch):
    db_file = str(tmp_path / "test_api_monitor.db")
    init_monitor_db(db_file)
    monkeypatch.setenv("SUBCAST_DB_PATH", db_file)
    # database module default db_path override
    import backend.database
    import backend.monitor_repository
    monkeypatch.setattr(backend.database, "DEFAULT_DB_PATH", db_file)
    monkeypatch.setattr(backend.monitor_repository, "DEFAULT_DB_PATH", db_file)
    yield

client = TestClient(app)

def test_get_monitor_settings_api():
    response = client.get("/api/v1/monitor/settings")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "data" in data
    settings = data["data"]
    assert settings["settingId"] == "default_profile"
    assert settings["layoutMode"] == "custom_canvas"
    assert "currentBox" in settings
    assert "nextBox" in settings
    assert settings["currentBox"]["leftPct"] == 5.0

def test_update_monitor_settings_api_success():
    payload = {
        "layoutMode": "split_horizontal",
        "currentBox": {
            "leftPct": 10.0,
            "topPct": 5.0,
            "widthPct": 80.0,
            "heightPct": 40.0,
            "fontSize": 32,
            "textColor": "#FFFF00",
            "bgColor": "rgba(0,0,0,0.5)",
            "isTransparentBg": False
        },
        "nextBox": {
            "leftPct": 10.0,
            "topPct": 50.0,
            "widthPct": 80.0,
            "heightPct": 40.0,
            "fontSize": 24,
            "textColor": "#CCCCCC",
            "bgColor": "transparent",
            "isTransparentBg": True
        }
    }
    response = client.put("/api/v1/monitor/settings", json=payload)
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["status"] == "success"
    assert res_data["message"] == "Monitor settings updated successfully"
    assert "updatedAt" in res_data

    # GET 확인
    get_res = client.get("/api/v1/monitor/settings")
    assert get_res.status_code == 200
    settings = get_res.json()["data"]
    assert settings["layoutMode"] == "split_horizontal"
    assert settings["currentBox"]["fontSize"] == 32

def test_update_monitor_settings_api_typography():
    payload = {
        "currentBox": {
            "fontSize": 36,
            "fontWeight": "900",
            "textColor": "#FF0000",
            "textAlign": "left"
        },
        "nextBox": {
            "fontSize": 24,
            "fontWeight": "normal",
            "textColor": "#00FF00",
            "textAlign": "right"
        }
    }
    response = client.put("/api/v1/monitor/settings", json=payload)
    assert response.status_code == 200
    get_res = client.get("/api/v1/monitor/settings")
    settings = get_res.json()["data"]
    assert settings["currentBox"]["fontWeight"] == "900"
    assert settings["currentBox"]["textAlign"] == "left"
    assert settings["nextBox"]["fontWeight"] == "normal"
    assert settings["nextBox"]["textAlign"] == "right"

def test_update_monitor_settings_api_invalid_bounds():
    payload = {
        "currentBox": {
            "leftPct": 60.0,
            "topPct": 5.0,
            "widthPct": 50.0,  # 60 + 50 = 110 > 100
            "heightPct": 40.0,
            "fontSize": 32
        }
    }
    response = client.put("/api/v1/monitor/settings", json=payload)
    assert response.status_code == 400
    res_data = response.json()
    assert res_data["status"] == "error"
    assert res_data["errorCode"] == "INVALID_BOUNDS"
    assert "leftPct + widthPct must not exceed 100%" in res_data["message"]

def test_update_monitor_settings_api_invalid_font_size():
    payload = {
        "currentBox": {
            "leftPct": 5.0,
            "topPct": 5.0,
            "widthPct": 50.0,
            "heightPct": 40.0,
            "fontSize": 300  # > 200
        }
    }
    response = client.put("/api/v1/monitor/settings", json=payload)
    assert response.status_code == 400
    res_data = response.json()
    assert res_data["status"] == "error"
    assert res_data["errorCode"] == "INVALID_BOUNDS"
    assert "fontSize must be between 10 and 200" in res_data["message"]
