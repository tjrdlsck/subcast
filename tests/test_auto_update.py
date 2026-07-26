import pytest
from fastapi.testclient import TestClient
from backend.main import app, CURRENT_VERSION

client = TestClient(app)

def test_get_system_version():
    response = client.get("/api/system/version")
    assert response.status_code == 200
    data = response.json()
    assert "version" in data
    assert data["version"] == CURRENT_VERSION

def test_check_update_endpoint():
    response = client.get("/api/system/check-update")
    assert response.status_code == 200
    data = response.json()
    assert "has_update" in data
    assert "current_version" in data
