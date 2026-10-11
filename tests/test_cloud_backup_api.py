from __future__ import annotations

from fastapi.testclient import TestClient
import pytest

from backend.main import app
from backend.routers import cloud_backup as cloud_backup_router
from backend.services.cloud_backup import read_snapshot
from backend.services import google_drive


class FakeDrive:
    records: list[dict] = []
    packages: dict[str, bytes] = {}
    fail_upload = False

    def __init__(self):
        pass

    @classmethod
    def reset(cls):
        cls.records = []
        cls.packages = {}
        cls.fail_upload = False

    def upload_asset(self, _content, sha256):
        return f"asset-{sha256}"

    def upload_snapshot(self, package, manifest):
        if type(self).fail_upload:
            raise RuntimeError("simulated Drive upload failure")
        file_id = f"snapshot-file-{len(type(self).records) + 1}"
        record = {
            **manifest,
            "fileId": file_id,
            "createdAt": manifest["createdAt"],
            "size": len(package),
        }
        type(self).records.append(record)
        type(self).packages[file_id] = package
        return {"id": file_id}

    def list_snapshots(self, cloud_project_id=None):
        return [record for record in type(self).records
                if not cloud_project_id or record["cloudProjectId"] == cloud_project_id]

    def download_snapshot(self, file_id):
        return type(self).packages[file_id]


@pytest.fixture
def cloud_api(tmp_path, monkeypatch):
    FakeDrive.reset()
    monkeypatch.setattr(cloud_backup_router, "APP_DATA_DIR", tmp_path)
    monkeypatch.setattr(cloud_backup_router, "GoogleDriveClient", FakeDrive)
    with TestClient(app) as client:
        project = client.post("/api/projects", json={"name": "Drive 검증 프로젝트"})
        assert project.status_code == 200, project.text
        yield client, project.json(), tmp_path


def test_backup_restore_and_concurrent_edits_create_separate_conflict_branches(cloud_api):
    client, original, data_dir = cloud_api
    first = client.post(f"/api/cloud/drive/projects/{original['id']}/snapshots", json={"deviceLabel": "PC A"})
    assert first.status_code == 200, first.text
    base_id = first.json()["snapshot"]["snapshotId"]

    second = client.post(f"/api/cloud/drive/projects/{original['id']}/snapshots", json={"deviceLabel": "PC A"})
    assert second.status_code == 200, second.text
    assert second.json()["snapshot"]["parentSnapshotId"] == base_id

    before_restore_ids = {item["id"] for item in client.get("/api/projects").json()}
    restored = client.post("/api/cloud/drive/restore", json={"fileId": first.json()["snapshot"]["fileId"]})
    assert restored.status_code == 200, restored.text
    restored_project = restored.json()["project"]
    assert restored_project["id"] != original["id"]
    assert restored_project["name"].startswith("Drive 검증 프로젝트")
    after_restore_ids = {item["id"] for item in client.get("/api/projects").json()}
    assert before_restore_ids.issubset(after_restore_ids)
    assert restored_project["id"] in after_restore_ids

    third = client.post(f"/api/cloud/drive/projects/{restored_project['id']}/snapshots", json={"deviceLabel": "PC B"})
    assert third.status_code == 200, third.text
    assert third.json()["snapshot"]["parentSnapshotId"] == base_id
    heads = third.json()["heads"]
    assert len(heads) == 2
    assert {head["parentSnapshotId"] for head in heads} == {base_id}
    assert all(head["hasConflict"] for head in heads)

    original_after = client.get(f"/api/projects/{original['id']}/export").json()
    restored_after = client.get(f"/api/projects/{restored_project['id']}/export").json()
    assert original_after["id"] == original["id"]
    assert restored_after["id"] == restored_project["id"]
    assert original_after["slides"] == restored_after["slides"]
    assert (data_dir / "cloud_backup" / "projects.json").is_file()


def test_failed_upload_does_not_advance_local_snapshot_state_and_can_retry(cloud_api):
    client, project, data_dir = cloud_api
    FakeDrive.fail_upload = True

    failed = client.post(f"/api/cloud/drive/projects/{project['id']}/snapshots", json={"deviceLabel": "검증 PC"})
    assert failed.status_code == 502
    assert "simulated Drive upload failure" in failed.json()["detail"]
    state_file = data_dir / "cloud_backup" / "projects.json"
    assert not state_file.exists()

    FakeDrive.fail_upload = False
    retried = client.post(f"/api/cloud/drive/projects/{project['id']}/snapshots", json={"deviceLabel": "검증 PC"})
    assert retried.status_code == 200, retried.text
    assert state_file.is_file()


def test_corrupt_download_is_rejected_without_importing_a_project(cloud_api):
    client, project, _data_dir = cloud_api
    FakeDrive.packages["corrupt-file"] = b"not a valid snapshot zip"
    before_ids = {item["id"] for item in client.get("/api/projects").json()}

    restored = client.post("/api/cloud/drive/restore", json={"fileId": "corrupt-file"})

    assert restored.status_code == 400
    assert "유효하지 않은 백업" in restored.json()["detail"]
    assert {item["id"] for item in client.get("/api/projects").json()} == before_ids


def test_status_requires_both_oauth_client_id_and_secret(monkeypatch, cloud_api):
    client, _project, _data_dir = cloud_api
    monkeypatch.setattr(google_drive, "client_id", lambda: "configured-client")
    monkeypatch.setattr(google_drive, "client_secret", lambda: "")
    monkeypatch.setattr(google_drive, "oauth_status", lambda: {"connected": False, "pending": False})

    status = client.get("/api/cloud/drive/status")

    assert status.status_code == 200
    assert status.json()["configured"] is False


def test_snapshot_parser_round_trips_uploaded_manifest(cloud_api):
    client, project, _data_dir = cloud_api
    response = client.post(f"/api/cloud/drive/projects/{project['id']}/snapshots", json={"deviceLabel": "시험 기기"})
    assert response.status_code == 200, response.text
    file_id = response.json()["snapshot"]["fileId"]

    manifest, payload, assets = read_snapshot(FakeDrive.packages[file_id])

    assert manifest["projectName"] == project["name"]
    assert manifest["deviceLabel"] == "시험 기기"
    assert payload["id"] == project["id"]
    assert assets == {}
