import hashlib
import json
import zipfile
import io

import pytest
import httpx

from backend.services.cloud_backup import build_snapshot, find_branch_heads, iter_referenced_assets, read_snapshot, restore_assets
from backend.services import google_drive
from backend.services.google_drive import DEFAULT_CLIENT_ID, _property_value, client_id, client_secret


def test_snapshot_removes_thumbnails_and_round_trips_referenced_assets(tmp_path):
    background_dir = tmp_path / "frontend" / "assets" / "backgrounds"
    background_dir.mkdir(parents=True)
    (background_dir / "worship.mp4").write_bytes(b"test video bytes")
    project = {
        "id": "local-1", "name": "주일 예배", "settings": {},
        "slides": [{"id": "s1", "thumbnail": "data:image/jpeg;base64,large", "elements": [
            {"id": "e1", "style": {"src": "/static/backgrounds/worship.mp4"}}
        ]}],
        "templates": [{"id": "t1", "thumbnail": "data:image/jpeg;base64,large", "elements": []}],
    }

    package = build_snapshot(project, data_dir=tmp_path)
    manifest, restored_project, assets = read_snapshot(package)

    assert "thumbnail" not in restored_project["slides"][0]
    assert "thumbnail" not in restored_project["templates"][0]
    assert len(manifest["assets"]) == 1
    assert next(iter(assets.values())) == b"test video bytes"
    assert manifest["payloadSha256"]

    restore_assets(manifest, assets, data_dir=tmp_path / "new-pc")
    assert (tmp_path / "new-pc" / "frontend" / "assets" / "backgrounds" / "worship.mp4").read_bytes() == b"test video bytes"


def test_custom_font_asset_is_included_and_restored_to_persistent_font_directory(tmp_path):
    font_dir = tmp_path / "frontend" / "fonts"
    font_dir.mkdir(parents=True)
    (font_dir / "worship.woff2").write_bytes(b"font bytes")
    project = {"slides": [], "customFonts": [{"family": "Worship", "cssCode": "src: url('/static/fonts/worship.woff2')"}]}

    package = build_snapshot(project, data_dir=tmp_path)
    manifest, _, assets = read_snapshot(package)
    restored_dir = tmp_path / "new-pc"
    restore_assets(manifest, assets, data_dir=restored_dir)

    assert manifest["assets"][0]["kind"] == "fonts"
    assert (restored_dir / "frontend" / "fonts" / "worship.woff2").read_bytes() == b"font bytes"


def test_snapshot_rejects_missing_assets_and_corrupt_payload(tmp_path):
    missing_asset_project = {"slides": [{"elements": [{"style": {"src": "/static/fonts/missing.woff2"}}]}]}
    with pytest.raises(ValueError, match="찾을 수 없습니다"):
        build_snapshot(missing_asset_project, data_dir=tmp_path)

    package = build_snapshot({"slides": [], "name": "test"}, data_dir=tmp_path)
    manifest, project, _ = read_snapshot(package)
    project["name"] = "tampered"
    output = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(package), "r") as source, zipfile.ZipFile(output, "w") as target:
        for name in source.namelist():
            data = source.read(name)
            if name == "project.json":
                data = json.dumps(project, sort_keys=True, separators=(",", ":")).encode()
            target.writestr(name, data)
    with pytest.raises(ValueError, match="체크섬"):
        read_snapshot(output.getvalue())


def test_restore_never_overwrites_different_existing_asset(tmp_path):
    source_root = tmp_path / "source"
    source_assets = source_root / "frontend" / "assets" / "backgrounds"
    source_assets.mkdir(parents=True)
    (source_assets / "bg.mp4").write_bytes(b"original")
    package = build_snapshot({"slides": [{"background": "/static/backgrounds/bg.mp4"}]}, data_dir=source_root)
    manifest, _, assets = read_snapshot(package)
    target = tmp_path / "target" / "frontend" / "assets" / "backgrounds"
    target.mkdir(parents=True)
    (target / "bg.mp4").write_bytes(b"user file")

    with pytest.raises(ValueError, match="다른 자산"):
        restore_assets(manifest, assets, data_dir=tmp_path / "target")
    assert (target / "bg.mp4").read_bytes() == b"user file"


def test_branch_heads_detect_sibling_snapshots():
    snapshots = [
        {"snapshotId": "root", "parentSnapshotId": None, "createdAt": "1"},
        {"snapshotId": "a", "parentSnapshotId": "root", "createdAt": "2"},
        {"snapshotId": "b", "parentSnapshotId": "root", "createdAt": "3"},
        {"snapshotId": "a2", "parentSnapshotId": "a", "createdAt": "4"},
    ]

    heads = find_branch_heads(snapshots)
    assert [item["snapshotId"] for item in heads] == ["a2", "b"]
    assert next(item for item in heads if item["snapshotId"] == "b")["hasConflict"] is True
    assert next(item for item in heads if item["snapshotId"] == "a2")["hasConflict"] is True


def test_drive_metadata_property_values_fit_google_utf8_limit():
    value = _property_value("projectName", "예배 프로젝트 " * 100)
    assert len(("projectName" + value).encode("utf-8")) <= 124


def test_google_drive_client_id_uses_packaged_default_and_allows_override(monkeypatch):
    monkeypatch.delenv("SUBCAST_GOOGLE_CLIENT_ID", raising=False)
    assert client_id() == DEFAULT_CLIENT_ID

    monkeypatch.setenv("SUBCAST_GOOGLE_CLIENT_ID", "override.apps.googleusercontent.com")
    assert client_id() == "override.apps.googleusercontent.com"


def test_google_drive_client_secret_loads_matching_installed_credentials(tmp_path, monkeypatch):
    credentials_path = tmp_path / "client.json"
    credentials_path.write_text(json.dumps({"installed": {
        "client_id": DEFAULT_CLIENT_ID,
        "client_secret": "local-test-secret",
    }}), encoding="utf-8")
    monkeypatch.setenv("SUBCAST_GOOGLE_OAUTH_CREDENTIALS", str(credentials_path))
    monkeypatch.delenv("SUBCAST_GOOGLE_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("SUBCAST_GOOGLE_CLIENT_ID", raising=False)

    assert client_secret() == "local-test-secret"


def test_google_drive_client_secret_rejects_credentials_for_different_client(tmp_path, monkeypatch):
    credentials_path = tmp_path / "client.json"
    credentials_path.write_text(json.dumps({"installed": {
        "client_id": "another-client.apps.googleusercontent.com",
        "client_secret": "wrong-test-secret",
    }}), encoding="utf-8")
    monkeypatch.setenv("SUBCAST_GOOGLE_OAUTH_CREDENTIALS", str(credentials_path))
    monkeypatch.delenv("SUBCAST_GOOGLE_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("SUBCAST_GOOGLE_CLIENT_ID", raising=False)

    assert client_secret() == ""


def test_oauth_authorization_code_exchange_sends_pkce_and_matching_client_secret(monkeypatch):
    request_data = {}
    monkeypatch.setattr(google_drive, "client_id", lambda: "test-client.apps.googleusercontent.com")
    monkeypatch.setattr(google_drive, "client_secret", lambda: "local-test-secret")

    def fake_post(url, *, data, timeout):
        request_data.update(data)
        assert url == "https://oauth2.googleapis.com/token"
        assert timeout == 20
        return httpx.Response(200, json={"access_token": "test-access", "refresh_token": "test-refresh"},
                              request=httpx.Request("POST", url))

    monkeypatch.setattr(google_drive.httpx, "post", fake_post)
    tokens = google_drive.exchange_authorization_code(
        "one-time-code", verifier="pkce-verifier", redirect_uri="http://127.0.0.1:1234/oauth2callback",
    )

    assert tokens["refresh_token"] == "test-refresh"
    assert request_data == {
        "client_id": "test-client.apps.googleusercontent.com", "client_secret": "local-test-secret",
        "code": "one-time-code", "code_verifier": "pkce-verifier",
        "redirect_uri": "http://127.0.0.1:1234/oauth2callback", "grant_type": "authorization_code",
    }


def test_drive_refresh_sends_client_secret_and_persists_new_access_token(monkeypatch):
    request_data = {}
    saved_tokens = []
    monkeypatch.setattr(google_drive, "client_id", lambda: "test-client.apps.googleusercontent.com")
    monkeypatch.setattr(google_drive, "client_secret", lambda: "local-test-secret")
    monkeypatch.setattr(google_drive, "save_tokens", lambda tokens: saved_tokens.append(tokens.copy()))

    def fake_post(url, *, data, timeout):
        request_data.update(data)
        return httpx.Response(200, json={"access_token": "renewed-access", "expires_in": 3600},
                              request=httpx.Request("POST", url))

    monkeypatch.setattr(google_drive.httpx, "post", fake_post)
    client = object.__new__(google_drive.GoogleDriveClient)
    client.tokens = {"refresh_token": "test-refresh", "expires_at": 0}

    assert client._access_token() == "renewed-access"
    assert request_data["client_secret"] == "local-test-secret"
    assert request_data["refresh_token"] == "test-refresh"
    assert saved_tokens[0]["access_token"] == "renewed-access"


def test_environment_manifest_uses_create_then_update_http_methods(monkeypatch):
    calls = []
    class Response:
        def json(self):
            return {"id": "manifest-1"}

    client = object.__new__(google_drive.GoogleDriveClient)
    monkeypatch.setattr(client, "_environment_folder_id", lambda: "folder-1")
    monkeypatch.setattr(client, "request", lambda method, url, **kwargs: calls.append((method, url)) or Response())

    client.upload_environment_manifest(b"{}")
    client.upload_environment_manifest(b"{}", "manifest-1")

    assert calls[0][0] == "POST"
    assert "/files?uploadType=multipart" in calls[0][1]
    assert calls[1][0] == "PATCH"
    assert "/files/manifest-1?uploadType=multipart" in calls[1][1]


def test_remote_assets_are_referenced_without_repeating_media_in_each_snapshot(tmp_path):
    content = b"background-video" * 100_000
    background_dir = tmp_path / "frontend" / "assets" / "backgrounds"
    background_dir.mkdir(parents=True)
    media_path = background_dir / "bg.mp4"
    media_path.write_bytes(content)
    project = {"slides": [{"background": "/static/backgrounds/bg.mp4"}]}
    digest = hashlib.sha256(content).hexdigest()
    asset_entries = list(iter_referenced_assets(project, data_dir=tmp_path))

    package = build_snapshot(project, data_dir=tmp_path, asset_drive_ids={digest: "drive-asset-1"}, include_asset_content=False)
    manifest, _, assets = read_snapshot(package)

    assert asset_entries[0][1] == media_path
    assert manifest["assets"][0]["driveFileId"] == "drive-asset-1"
    assert "path" not in manifest["assets"][0]
    assert assets == {}
    assert len(package) < 20_000

    restore_assets(manifest, {"drive-asset-1": media_path}, data_dir=tmp_path / "restored")
    assert (tmp_path / "restored" / "frontend" / "assets" / "backgrounds" / "bg.mp4").read_bytes() == content


def test_restore_rejects_traversal_asset_name(tmp_path):
    manifest = {"assets": [{"kind": "backgrounds", "name": "../outside.mp4", "path": "assets/" + "0" * 64,
                            "sha256": "0" * 64}]}
    with pytest.raises(ValueError, match="경로"):
        restore_assets(manifest, {}, data_dir=tmp_path)
    assert not (tmp_path.parent / "outside.mp4").exists()
