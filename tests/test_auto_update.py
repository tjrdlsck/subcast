import pytest
from types import SimpleNamespace
from fastapi.testclient import TestClient

from backend.main import app
from backend.routers import system

client = TestClient(app)


def release(version="99.0.0"):
    base = f"https://github.com/tjrdlsck/subcast/releases/download/v{version}"
    installer = f"Subcast_Setup_v{version}.exe"
    return {
        "tag_name": f"v{version}",
        "name": f"Subcast v{version}",
        "assets": [
            {"name": installer, "browser_download_url": f"{base}/{installer}"},
            {"name": installer + ".sha256", "browser_download_url": f"{base}/{installer}.sha256"},
        ],
    }


def test_get_system_version():
    response = client.get("/api/system/version")
    assert response.status_code == 200
    assert response.json()["version"] == system.CURRENT_VERSION


def test_parse_version_rejects_malformed_values():
    assert system._parse_ver("v1.3.17") == (1, 3, 17)
    for malformed in ("1.3.17-beta", "1..2", "https://host/file.exe", ""):
        with pytest.raises(ValueError):
            system._parse_ver(malformed)


def test_release_must_provide_exact_installer_and_checksum():
    data = release()
    version, installer, checksum = system._release_assets(data)
    assert version == "99.0.0"
    assert installer.endswith("Subcast_Setup_v99.0.0.exe")
    assert checksum.endswith("Subcast_Setup_v99.0.0.exe.sha256")

    data["assets"] = [{"name": "malicious.exe", "browser_download_url": "https://example.com/malicious.exe"}]
    with pytest.raises(ValueError):
        system._release_assets(data)


def test_check_update_reports_network_failure(monkeypatch):
    async def fail():
        raise OSError("offline")

    monkeypatch.setattr(system, "_latest_release", fail)
    response = client.get("/api/system/check-update")
    assert response.status_code == 502


def test_auto_update_cannot_accept_caller_supplied_url():
    response = client.post("/api/system/auto-update?download_url=https://example.com/payload.exe")
    assert response.status_code == 400


def test_auto_update_refuses_when_there_is_no_new_version(monkeypatch):
    async def latest():
        return release(system.CURRENT_VERSION)

    monkeypatch.setattr(system, "_latest_release", latest)
    monkeypatch.setattr(system.ipaddress, "ip_address", lambda _host: SimpleNamespace(is_loopback=True))
    response = client.post("/api/system/auto-update")
    assert response.status_code == 409


def test_installer_launch_failure_keeps_app_and_allows_retry(monkeypatch, tmp_path):
    async def latest():
        return release("99.0.0")

    async def downloaded(_url, _checksum):
        update_dir = tmp_path / "update"
        update_dir.mkdir()
        return str(update_dir / "installer.exe"), str(update_dir)

    async def flushed():
        return None

    def launch_fails(_path):
        raise OSError("UAC cancelled")

    monkeypatch.setattr(system, "_latest_release", latest)
    monkeypatch.setattr(system, "_download_verified_installer", downloaded)
    monkeypatch.setattr(system, "_flush_project_state", flushed)
    monkeypatch.setattr(system, "_launch_elevated", launch_fails)
    monkeypatch.setattr(system.ipaddress, "ip_address", lambda _host: SimpleNamespace(is_loopback=True))
    system._UPDATE_IN_PROGRESS = False

    response = client.post("/api/system/auto-update")

    assert response.status_code == 500
    assert system._UPDATE_IN_PROGRESS is False
    assert not (tmp_path / "update").exists()
