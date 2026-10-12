from __future__ import annotations

import json
import hashlib
import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

from backend.main import app
from backend.routers import cloud_backup as cloud_backup_router
from backend.services import environment_sync


class FakeEnvironmentDrive:
    manifest_id = "manifest-1"
    manifest: bytes | None = None
    assets: dict[str, bytes] = {}
    deletes: list[str] = []
    next_asset = 0
    uploads: int = 0
    downloads: int = 0

    @classmethod
    def reset(cls):
        cls.manifest = None
        cls.assets = {}
        cls.deletes = []
        cls.next_asset = 0
        cls.uploads = 0
        cls.downloads = 0

    def find_environment_manifest(self, _cached_file_id=None):
        if self.manifest is None:
            return None, None
        return {"id": self.manifest_id}, self.manifest

    def upload_environment_manifest(self, content, file_id=None):
        type(self).uploads += 1
        type(self).manifest_id = file_id or type(self).manifest_id
        type(self).manifest = content
        return {"id": type(self).manifest_id}

    def upload_environment_asset(self, path: Path, sha256: str, progress_callback=None):
        type(self).next_asset += 1
        asset_id = f"asset-{type(self).next_asset}"
        content = path.read_bytes()
        type(self).assets[asset_id] = content
        if progress_callback:
            progress_callback(len(content))
        return {"id": asset_id}

    def delete_environment_asset(self, file_id: str):
        type(self).deletes.append(file_id)
        type(self).assets.pop(file_id, None)

    def download_file_to_path(self, file_id: str, path: Path, progress_callback=None):
        type(self).downloads += 1
        path.parent.mkdir(parents=True, exist_ok=True)
        content = type(self).assets[file_id]
        path.write_bytes(content)
        if progress_callback:
            progress_callback(len(content))


def _create_user_video(data_dir: Path, name: str, content: bytes):
    directory = data_dir / "frontend" / "assets" / "backgrounds"
    directory.mkdir(parents=True, exist_ok=True)
    (directory / name).write_bytes(content)
    metadata_path = directory / "meta.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8")) if metadata_path.exists() else {}
    metadata[name] = {"title": name, "userUploaded": True}
    metadata_path.write_text(json.dumps(metadata), encoding="utf-8")


def _manifest():
    return json.loads(FakeEnvironmentDrive.manifest.decode("utf-8"))


def _completed_operation(client: TestClient, response):
    operation_id = response.json()["operationId"]
    operation_response = client.get(f"/api/cloud/drive/environment/operations/{operation_id}")
    assert operation_response.status_code == 200, operation_response.text
    operation = operation_response.json()
    return operation, operation.get("result", {})


def test_settings_fingerprint_ignores_monitor_updated_at_but_detects_setting_changes():
    settings = {
        "monitorSettings": {
            "updatedAt": "2026-10-12 12:00:00",
            "currentBox": {"textColor": "#ffffff"},
        },
        "praiseSongs": [],
    }
    restored = json.loads(json.dumps(settings))
    restored["monitorSettings"]["updatedAt"] = "2026-10-12 12:01:00"

    assert cloud_backup_router._settings_fingerprint(settings) == cloud_backup_router._settings_fingerprint(restored)

    restored["monitorSettings"]["currentBox"]["textColor"] = "#000000"
    assert cloud_backup_router._settings_fingerprint(settings) != cloud_backup_router._settings_fingerprint(restored)


def test_environment_sync_uploads_settings_and_all_uploaded_videos(tmp_path, monkeypatch):
    FakeEnvironmentDrive.reset()
    monkeypatch.setattr(cloud_backup_router, "APP_DATA_DIR", tmp_path)
    monkeypatch.setattr(cloud_backup_router, "GoogleDriveClient", FakeEnvironmentDrive)
    _create_user_video(tmp_path, "upload_song.mp4", b"video-data")

    with TestClient(app) as client:
        before = client.get("/api/cloud/drive/environment")
        assert before.status_code == 200, before.text
        assert before.json()["exists"] is False
        saved = client.post("/api/cloud/drive/environment/sync", json={
            "baseRevision": None,
            "browserSettings": {"monitorSettings": {"textColor": "#abc123"}, "broadcastLayout": None},
        })
        operation, result = _completed_operation(client, saved)
        comparison = client.get("/api/cloud/drive/environment")

    assert saved.status_code == 202, saved.text
    assert saved.json()["status"] == "running"
    manifest = _manifest()
    assert result["backgroundCount"] == 1
    assert manifest["backgrounds"][0]["name"] == "upload_song.mp4"
    assert manifest["backgrounds"][0]["assetFileId"] in FakeEnvironmentDrive.assets
    assert manifest["settings"]["browserSettings"]["monitorSettings"]["textColor"] == "#abc123"
    assert "bible" not in json.dumps(manifest["settings"]).lower()
    assert operation["status"] == "completed"
    assert operation["percent"] == 100
    assert comparison.json()["remote"]["settingsSummary"]["browserMonitorSettings"] is True
    assert comparison.json()["local"]["settingsSummary"]["praiseSongs"] == 0


def test_environment_operation_id_cannot_be_reused(tmp_path, monkeypatch):
    FakeEnvironmentDrive.reset()
    monkeypatch.setattr(cloud_backup_router, "APP_DATA_DIR", tmp_path)
    monkeypatch.setattr(cloud_backup_router, "GoogleDriveClient", FakeEnvironmentDrive)

    with TestClient(app) as client:
        first = client.post("/api/cloud/drive/environment/sync", json={"baseRevision": None, "operationId": "fixed-operation"})
        duplicate = client.post("/api/cloud/drive/environment/sync", json={"baseRevision": None, "operationId": "fixed-operation"})

    assert first.status_code == 202, first.text
    assert duplicate.status_code == 409
    assert "이미 사용한" in duplicate.json()["detail"]


def test_remote_revision_blocks_stale_sync_and_restore_mirrors_removed_videos(tmp_path, monkeypatch):
    FakeEnvironmentDrive.reset()
    monkeypatch.setattr(cloud_backup_router, "APP_DATA_DIR", tmp_path)
    monkeypatch.setattr(cloud_backup_router, "GoogleDriveClient", FakeEnvironmentDrive)
    _create_user_video(tmp_path, "upload_old.mp4", b"old-video")

    with TestClient(app) as client:
        first = client.post("/api/cloud/drive/environment/sync", json={"baseRevision": None})
        assert first.status_code == 202, first.text
        _operation, first_result = _completed_operation(client, first)
        revision = first_result["revision"]
        assert _manifest()["backgrounds"][0]["assetFileId"] in FakeEnvironmentDrive.assets

        # Simulate another machine advancing the Drive manifest.
        remote = _manifest()
        remote["revision"] = "revision-from-other-pc"
        FakeEnvironmentDrive.manifest = json.dumps(remote).encode("utf-8")
        stale = client.post("/api/cloud/drive/environment/sync", json={"baseRevision": revision})
        assert stale.status_code == 202
        stale_operation, _ = _completed_operation(client, stale)
        assert stale_operation["status"] == "failed"
        assert stale_operation["errorStatus"] == 409

        # Reset the active revision to the published one and restore on a machine with a different local video.
        remote["revision"] = revision
        FakeEnvironmentDrive.manifest = json.dumps(remote).encode("utf-8")
        state_path = tmp_path / "cloud_backup" / "environment.json"
        state_path.write_text(json.dumps({"manifestFileId": "manifest-1"}), encoding="utf-8")
        (tmp_path / "frontend" / "assets" / "backgrounds" / "upload_old.mp4").unlink()
        _create_user_video(tmp_path, "upload_local_only.mp4", b"local-only")
        tags_path = tmp_path / "data" / "mood_tags.json"
        tags_path.parent.mkdir(parents=True, exist_ok=True)
        tags_path.write_text('{"version": 1, "tags": [{"id": "local", "name": "local"}]}', encoding="utf-8")
        restored = client.post("/api/cloud/drive/environment/restore", json={"baseRevision": revision})
        restored_operation, restore_result = _completed_operation(client, restored)

    assert restored.status_code == 202, restored.text
    assert restored_operation["status"] == "completed"
    backgrounds = tmp_path / "frontend" / "assets" / "backgrounds"
    assert (backgrounds / "upload_old.mp4").read_bytes() == b"old-video"
    assert not (backgrounds / "upload_local_only.mp4").exists()
    assert not tags_path.exists()
    assert restore_result["backgroundCount"] == 1


def test_sync_removes_drive_asset_when_user_deletes_local_video(tmp_path, monkeypatch):
    FakeEnvironmentDrive.reset()
    monkeypatch.setattr(cloud_backup_router, "APP_DATA_DIR", tmp_path)
    monkeypatch.setattr(cloud_backup_router, "GoogleDriveClient", FakeEnvironmentDrive)
    _create_user_video(tmp_path, "upload_remove.mp4", b"remove-me")

    with TestClient(app) as client:
        first = client.post("/api/cloud/drive/environment/sync", json={"baseRevision": None})
        assert first.status_code == 202, first.text
        _operation, first_result = _completed_operation(client, first)
        revision = first_result["revision"]
        asset_id = _manifest()["backgrounds"][0]["assetFileId"]
        background_dir = tmp_path / "frontend" / "assets" / "backgrounds"
        (background_dir / "upload_remove.mp4").unlink()

        second = client.post("/api/cloud/drive/environment/sync", json={"baseRevision": revision})
        second_operation, second_result = _completed_operation(client, second)

    assert second.status_code == 202, second.text
    assert second_operation["status"] == "completed"
    assert second_result["removed"] == 1
    assert _manifest()["backgrounds"] == []
    assert asset_id in FakeEnvironmentDrive.deletes
    assert asset_id not in FakeEnvironmentDrive.assets


def test_unchanged_sync_skips_drive_manifest_write(tmp_path, monkeypatch):
    FakeEnvironmentDrive.reset()
    monkeypatch.setattr(cloud_backup_router, "APP_DATA_DIR", tmp_path)
    monkeypatch.setattr(cloud_backup_router, "GoogleDriveClient", FakeEnvironmentDrive)
    _create_user_video(tmp_path, "upload_same.mp4", b"same-video")
    browser_settings = {"monitorSettings": {"textColor": "#ffffff"}}

    with TestClient(app) as client:
        first = client.post("/api/cloud/drive/environment/sync", json={
            "baseRevision": None, "browserSettings": browser_settings,
        })
        _operation, first_result = _completed_operation(client, first)
        manifest_uploads = FakeEnvironmentDrive.uploads
        second = client.post("/api/cloud/drive/environment/sync", json={
            "baseRevision": first_result["revision"], "browserSettings": browser_settings,
        })
        operation, result = _completed_operation(client, second)

    assert operation["status"] == "completed"
    assert result["unchanged"] is True
    assert result["revision"] == first_result["revision"]
    assert FakeEnvironmentDrive.uploads == manifest_uploads
    assert FakeEnvironmentDrive.next_asset == 1


def test_restore_skips_download_when_local_video_matches_drive(tmp_path, monkeypatch):
    FakeEnvironmentDrive.reset()
    monkeypatch.setattr(cloud_backup_router, "APP_DATA_DIR", tmp_path)
    monkeypatch.setattr(cloud_backup_router, "GoogleDriveClient", FakeEnvironmentDrive)
    content = b"same-video-content"
    _create_user_video(tmp_path, "upload_same.mp4", content)
    digest = hashlib.sha256(content).hexdigest()
    FakeEnvironmentDrive.assets["asset-same"] = content
    FakeEnvironmentDrive.manifest = json.dumps({
        "formatVersion": 1, "revision": "same-r1", "settings": {},
        "backgrounds": [{"name": "upload_same.mp4", "title": "upload_same.mp4", "size": len(content),
                          "sha256": digest, "assetFileId": "asset-same",
                          "meta": {"title": "upload_same.mp4", "userUploaded": True}}],
    }).encode("utf-8")

    with TestClient(app) as client:
        response = client.post("/api/cloud/drive/environment/restore", json={"baseRevision": "same-r1"})
        operation, result = _completed_operation(client, response)

    assert operation["status"] == "completed", operation.get("message")
    assert result["backgroundCount"] == 1
    assert FakeEnvironmentDrive.downloads == 0


def test_restore_overwrites_same_name_when_drive_video_changed(tmp_path, monkeypatch):
    FakeEnvironmentDrive.reset()
    monkeypatch.setattr(cloud_backup_router, "APP_DATA_DIR", tmp_path)
    monkeypatch.setattr(cloud_backup_router, "GoogleDriveClient", FakeEnvironmentDrive)
    _create_user_video(tmp_path, "upload_same.mp4", b"old-content")
    new_content = b"new-drive-content"
    digest = hashlib.sha256(new_content).hexdigest()
    FakeEnvironmentDrive.assets["asset-new"] = new_content
    FakeEnvironmentDrive.manifest = json.dumps({
        "formatVersion": 1, "revision": "changed-r1", "settings": {},
        "backgrounds": [{"name": "upload_same.mp4", "title": "upload_same.mp4", "size": len(new_content),
                          "sha256": digest, "assetFileId": "asset-new",
                          "meta": {"title": "upload_same.mp4", "userUploaded": True}}],
    }).encode("utf-8")

    with TestClient(app) as client:
        response = client.post("/api/cloud/drive/environment/restore", json={"baseRevision": "changed-r1"})
        operation, _result = _completed_operation(client, response)

    assert operation["status"] == "completed"
    assert (tmp_path / "frontend" / "assets" / "backgrounds" / "upload_same.mp4").read_bytes() == new_content
    assert FakeEnvironmentDrive.downloads == 1


def test_environment_restore_rejects_invalid_video_checksum_without_touching_local_files(tmp_path, monkeypatch):
    FakeEnvironmentDrive.reset()
    monkeypatch.setattr(cloud_backup_router, "APP_DATA_DIR", tmp_path)
    monkeypatch.setattr(cloud_backup_router, "GoogleDriveClient", FakeEnvironmentDrive)
    FakeEnvironmentDrive.assets["asset-bad"] = b"tampered"
    manifest = {
        "formatVersion": 1, "revision": "r1", "settings": {"praiseSongs": [], "templates": [], "importTagMappings": {}},
        "backgrounds": [{"name": "upload_remote.mp4", "size": 12,
                          "sha256": hashlib.sha256(b"expected-data").hexdigest(), "assetFileId": "asset-bad"}],
    }
    FakeEnvironmentDrive.manifest = json.dumps(manifest).encode("utf-8")
    _create_user_video(tmp_path, "upload_keep.mp4", b"keep")

    with TestClient(app) as client:
        failed = client.post("/api/cloud/drive/environment/restore", json={"baseRevision": "r1"})
        operation, _ = _completed_operation(client, failed)

    assert failed.status_code == 202
    assert operation["status"] == "failed"
    assert operation["errorStatus"] == 400
    assert (tmp_path / "frontend" / "assets" / "backgrounds" / "upload_keep.mp4").read_bytes() == b"keep"
    assert not (tmp_path / "frontend" / "assets" / "backgrounds" / "upload_remote.mp4").exists()


def test_restore_replaces_common_settings_and_preserves_bible_and_other_user_tables(tmp_path, monkeypatch):
    FakeEnvironmentDrive.reset()
    monkeypatch.setattr(cloud_backup_router, "APP_DATA_DIR", tmp_path)
    monkeypatch.setattr(cloud_backup_router, "GoogleDriveClient", FakeEnvironmentDrive)
    user_db = tmp_path / "subcast_user.db"
    connection = sqlite3.connect(user_db)
    connection.execute("CREATE TABLE local_extension (value TEXT)")
    connection.execute("INSERT INTO local_extension VALUES ('keep-me')")
    connection.execute("CREATE TABLE praise_songs (id INTEGER PRIMARY KEY, title TEXT, lyrics TEXT, mood TEXT)")
    connection.execute("INSERT INTO praise_songs VALUES (1, 'Old', 'old lyrics', 'Quiet')")
    connection.commit()
    connection.close()
    bible_db = tmp_path / "bible.db"
    bible_db.write_bytes(b"packaged-bible-database")
    manifest = {
        "formatVersion": 1, "revision": "settings-r1",
        "settings": {
            "praiseSongs": [{"id": 7, "title": "New", "lyrics": "new lyrics", "mood": "Worship"}],
            "templates": [{"id": "template-1", "name": "Service"}], "importTagMappings": {"Praise": "Worship"},
            "moodTags": {"version": 1, "tags": [{"id": "default", "name": "기본/일반"}]},
        },
        "backgrounds": [],
    }
    FakeEnvironmentDrive.manifest = json.dumps(manifest).encode("utf-8")

    with TestClient(app) as client:
        restored = client.post("/api/cloud/drive/environment/restore", json={"baseRevision": "settings-r1"})
        operation, result = _completed_operation(client, restored)

    assert restored.status_code == 202, restored.text
    assert operation["status"] == "completed"
    connection = sqlite3.connect(user_db)
    songs = connection.execute("SELECT id, title, lyrics, mood FROM praise_songs").fetchall()
    extension = connection.execute("SELECT value FROM local_extension").fetchone()
    connection.close()
    assert songs == [(7, "New", "new lyrics", "Worship")]
    assert extension == ("keep-me",)
    assert bible_db.read_bytes() == b"packaged-bible-database"
    assert json.loads((tmp_path / "data" / "templates.json").read_text(encoding="utf-8")) == manifest["settings"]["templates"]
    assert json.loads((tmp_path / "data" / "project_import_tag_mappings.json").read_text(encoding="utf-8")) == {"Praise": "Worship"}
    assert result["browserSettings"] == {}


def test_failed_restore_rolls_back_videos_and_settings(tmp_path, monkeypatch):
    FakeEnvironmentDrive.reset()
    monkeypatch.setattr(cloud_backup_router, "APP_DATA_DIR", tmp_path)
    monkeypatch.setattr(cloud_backup_router, "GoogleDriveClient", FakeEnvironmentDrive)
    _create_user_video(tmp_path, "upload_local.mp4", b"local-video")
    templates_path = tmp_path / "data" / "templates.json"
    templates_path.parent.mkdir(parents=True, exist_ok=True)
    templates_path.write_text('[{"name":"local-template"}]', encoding="utf-8")
    FakeEnvironmentDrive.assets["asset-new"] = b"drive-video"
    manifest = {
        "formatVersion": 1, "revision": "rollback-r1",
        "settings": {"praiseSongs": [], "templates": [{"name": "drive-template"}], "importTagMappings": {}},
        "backgrounds": [{"name": "upload_drive.mp4", "size": 11,
                          "sha256": hashlib.sha256(b"drive-video").hexdigest(), "assetFileId": "asset-new"}],
    }
    FakeEnvironmentDrive.manifest = json.dumps(manifest).encode("utf-8")
    monkeypatch.setattr(environment_sync, "apply_settings", lambda *_args: (_ for _ in ()).throw(RuntimeError("simulated settings failure")))

    with TestClient(app) as client:
        failed = client.post("/api/cloud/drive/environment/restore", json={"baseRevision": "rollback-r1"})
        operation, _ = _completed_operation(client, failed)

    backgrounds = tmp_path / "frontend" / "assets" / "backgrounds"
    assert failed.status_code == 202
    assert operation["status"] == "failed"
    assert operation["errorStatus"] == 502
    assert (backgrounds / "upload_local.mp4").read_bytes() == b"local-video"
    assert not (backgrounds / "upload_drive.mp4").exists()
    assert json.loads(templates_path.read_text(encoding="utf-8")) == [{"name": "local-template"}]
