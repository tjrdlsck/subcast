from __future__ import annotations

import json
import os
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend import storage
from backend.database import APP_DATA_DIR
from backend.services.cloud_backup import _hash_file, build_snapshot, find_branch_heads, iter_referenced_assets, read_snapshot, restore_assets
from backend.services.google_drive import GoogleDriveClient, clear_tokens, oauth_status, start_oauth
from backend.routers.system import CURRENT_VERSION
from backend.schemas import ProjectData
from backend.services.connection_manager import manager
from backend.services import environment_sync

router = APIRouter(prefix="/api/cloud/drive", tags=["cloud-backup"])


def _state_path() -> Path:
    return Path(APP_DATA_DIR).resolve() / "cloud_backup" / "projects.json"


def _read_state() -> dict:
    path = _state_path()
    if not path.exists():
        return {}
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        raise HTTPException(status_code=500, detail="클라우드 백업의 로컬 연결 정보가 손상되었습니다.")
    if not isinstance(state, dict):
        raise HTTPException(status_code=500, detail="클라우드 백업의 로컬 연결 정보 형식이 올바르지 않습니다.")
    return state


def _write_state(state: dict) -> None:
    path = _state_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temp, path)


def _environment_state_path() -> Path:
    return Path(APP_DATA_DIR).resolve() / "cloud_backup" / "environment.json"


def _read_environment_state() -> dict:
    path = _environment_state_path()
    if not path.exists():
        return {}
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail="환경 동기화의 로컬 연결 정보가 손상되었습니다.") from exc
    if not isinstance(state, dict):
        raise HTTPException(status_code=500, detail="환경 동기화의 로컬 연결 정보 형식이 올바르지 않습니다.")
    return state


def _write_environment_state(state: dict) -> None:
    path = _environment_state_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temp, path)


def _json_bytes(payload: dict) -> bytes:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _settings_fingerprint(settings: dict) -> str:
    import hashlib
    settings_without_browser = {key: value for key, value in settings.items() if key != "browserSettings"}
    return hashlib.sha256(_json_bytes(settings_without_browser)).hexdigest()


def _read_remote_environment(client: GoogleDriveClient, state: dict):
    file_info, content = client.find_environment_manifest(state.get("manifestFileId"))
    if not file_info or content is None:
        return None, None
    try:
        manifest = json.loads(content.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Drive 환경 파일을 읽을 수 없습니다.") from exc
    if not isinstance(manifest, dict) or manifest.get("formatVersion") != 1:
        raise ValueError("지원하지 않는 Drive 환경 파일입니다.")
    if not isinstance(manifest.get("backgrounds"), list) or not isinstance(manifest.get("settings"), dict):
        raise ValueError("Drive 환경 파일의 내용이 올바르지 않습니다.")
    names = set()
    for item in manifest["backgrounds"]:
        if not isinstance(item, dict):
            raise ValueError("Drive 배경 영상 목록 형식이 올바르지 않습니다.")
        name = item.get("name")
        if (not isinstance(name, str) or Path(name).name != name or Path(name).suffix.lower() not in environment_sync.VIDEO_EXTENSIONS
                or name in names or not isinstance(item.get("size"), int) or item["size"] < 0
                or not isinstance(item.get("sha256"), str) or len(item["sha256"]) != 64
                or not isinstance(item.get("assetFileId"), str) or not item["assetFileId"]):
            raise ValueError("Drive 배경 영상 목록에 올바르지 않은 항목이 있습니다.")
        names.add(name)
    return file_info, manifest


def _public_videos(videos: list[dict]) -> list[dict]:
    return [{key: item[key] for key in ("name", "title", "size", "sha256") if key in item} for item in videos]


def _video_totals(videos: list[dict]) -> dict:
    return {"backgroundCount": len(videos), "backgroundBytes": sum(int(item.get("size", 0)) for item in videos)}


class BackupRequest(BaseModel):
    deviceLabel: str = "이 PC"


class RestoreRequest(BaseModel):
    fileId: str


class EnvironmentSyncRequest(BaseModel):
    baseRevision: str | None = None
    browserSettings: dict = Field(default_factory=dict)


class EnvironmentRestoreRequest(BaseModel):
    baseRevision: str


def _environment_data_dir() -> Path:
    return Path(APP_DATA_DIR).resolve()


def _check_environment_revision(request_revision: str | None, local_state: dict, remote_manifest: dict | None) -> None:
    remote_revision = remote_manifest.get("revision") if remote_manifest else None
    local_revision = local_state.get("revision")
    if request_revision != remote_revision or (remote_revision is not None and local_revision != remote_revision):
        raise HTTPException(status_code=409, detail="Drive 환경이 다른 기기에서 변경되었습니다. 최신 환경을 먼저 복원해 주세요.")


@router.get("/environment")
async def get_environment():
    data_dir = _environment_data_dir()
    state = _read_environment_state()
    try:
        client = GoogleDriveClient()
        file_info, remote = _read_remote_environment(client, state)
        settings = environment_sync.collect_settings(data_dir)
        videos = environment_sync.collect_user_videos(data_dir)
        remote_videos = (remote or {}).get("backgrounds", [])
        changes = environment_sync.compare_video_manifests(videos, remote_videos)
        local_fingerprint = _settings_fingerprint(settings)
        remote_fingerprint = _settings_fingerprint((remote or {}).get("settings", {}))
        remote_revision = (remote or {}).get("revision")
        if file_info and file_info.get("id") != state.get("manifestFileId"):
            state["manifestFileId"] = file_info["id"]
            _write_environment_state(state)
        return {
            "exists": remote is not None,
            "revision": remote_revision,
            "needsRestore": bool(remote and state.get("revision") != remote_revision),
            "settingsChanged": bool(remote and local_fingerprint != remote_fingerprint),
            "local": {"settingsSize": len(_json_bytes(settings)), **_video_totals(videos), "backgrounds": _public_videos(videos)},
            "remote": {"revision": remote_revision, "settingsSize": len(_json_bytes(remote.get("settings", {}))) if remote else 0,
                       **_video_totals(remote_videos), "backgrounds": _public_videos(remote_videos)},
            "changes": changes,
        }
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Drive 환경을 불러오지 못했습니다: {exc}") from exc


@router.post("/environment/sync")
async def sync_environment(request: EnvironmentSyncRequest):
    data_dir = _environment_data_dir()
    state = _read_environment_state()
    uploaded_ids: list[str] = []
    manifest_committed = False
    try:
        client = GoogleDriveClient()
        file_info, remote = _read_remote_environment(client, state)
        _check_environment_revision(request.baseRevision, state, remote)
        settings = environment_sync.collect_settings(data_dir, request.browserSettings)
        settings = environment_sync.validate_settings(settings)
        local_videos = environment_sync.collect_user_videos(data_dir)
        previous_by_hash = {item.get("sha256"): item for item in (remote or {}).get("backgrounds", [])}
        hash_to_id: dict[str, str] = {}
        backgrounds = []
        for item in local_videos:
            digest = item["sha256"]
            old = previous_by_hash.get(digest)
            asset_id = hash_to_id.get(digest) or (old or {}).get("assetFileId")
            if not asset_id:
                uploaded = client.upload_environment_asset(item["path"], digest)
                asset_id = uploaded["id"]
                uploaded_ids.append(asset_id)
            hash_to_id[digest] = asset_id
            backgrounds.append({key: value for key, value in item.items() if key != "path"} | {"assetFileId": asset_id})

        previous_ids = {item.get("assetFileId") for item in (remote or {}).get("backgrounds", []) if item.get("assetFileId")}
        current_ids = {item["assetFileId"] for item in backgrounds}
        pending_deletes = (set((remote or {}).get("pendingDeleteAssetIds", [])) | (previous_ids - current_ids)) - current_ids
        manifest = {
            "formatVersion": 1, "revision": uuid.uuid4().hex, "parentRevision": (remote or {}).get("revision"),
            "updatedAt": datetime.now(timezone.utc).isoformat(), "settings": settings,
            "backgrounds": backgrounds, "pendingDeleteAssetIds": sorted(pending_deletes),
        }
        uploaded_manifest = client.upload_environment_manifest(_json_bytes(manifest), file_info.get("id") if file_info else None)
        manifest_committed = True
        state.update({"manifestFileId": uploaded_manifest["id"], "revision": manifest["revision"],
                      "settingsSha256": _settings_fingerprint(settings)})
        _write_environment_state(state)

        cleanup_pending = []
        for asset_id in sorted(pending_deletes - current_ids):
            try:
                client.delete_environment_asset(asset_id)
            except Exception:
                cleanup_pending.append(asset_id)
        if cleanup_pending != manifest["pendingDeleteAssetIds"]:
            manifest["pendingDeleteAssetIds"] = cleanup_pending
            try:
                client.upload_environment_manifest(_json_bytes(manifest), uploaded_manifest["id"])
            except Exception:
                cleanup_pending = sorted(pending_deletes - current_ids)
        changes = environment_sync.compare_video_manifests(local_videos, (remote or {}).get("backgrounds", []))
        return {"revision": manifest["revision"], "added": len(changes["added"]),
                "updated": len(changes["updated"]), "removed": len(changes["removed"]),
                "backgroundCount": len(backgrounds), "backgroundBytes": sum(item["size"] for item in backgrounds),
                "cleanupPending": len(cleanup_pending)}
    except HTTPException:
        raise
    except ValueError as exc:
        if not manifest_committed:
            for asset_id in uploaded_ids:
                try:
                    client.delete_environment_asset(asset_id)
                except Exception:
                    pass
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        if not manifest_committed:
            for asset_id in uploaded_ids:
                try:
                    client.delete_environment_asset(asset_id)
                except Exception:
                    pass
        raise HTTPException(status_code=502, detail=f"Drive 환경 저장에 실패했습니다: {exc}") from exc


@router.post("/environment/restore")
async def restore_environment(request: EnvironmentRestoreRequest):
    staging_dir = Path(APP_DATA_DIR).resolve() / "cloud_backup" / "tmp" / uuid.uuid4().hex
    rollback_dir = staging_dir / "rollback"
    download_dir = staging_dir / "download"
    try:
        client = GoogleDriveClient()
        state = _read_environment_state()
        file_info, manifest = _read_remote_environment(client, state)
        if not manifest or not file_info:
            raise HTTPException(status_code=404, detail="Drive에 저장된 환경이 없습니다.")
        if request.baseRevision != manifest.get("revision"):
            raise HTTPException(status_code=409, detail="Drive 환경이 변경되었습니다. 목록을 새로고침해 주세요.")
        settings = environment_sync.validate_settings(manifest.get("settings"))
        backgrounds = manifest.get("backgrounds", [])
        if not isinstance(backgrounds, list):
            raise ValueError("Drive 배경 영상 목록 형식이 올바르지 않습니다.")
        download_dir.mkdir(parents=True, exist_ok=True)
        video_paths: dict[str, Path] = {}
        for item in backgrounds:
            name = item.get("name") if isinstance(item, dict) else None
            asset_id = item.get("assetFileId") if isinstance(item, dict) else None
            if not isinstance(name, str) or Path(name).name != name or not isinstance(asset_id, str) or not asset_id:
                raise ValueError("Drive 배경 영상 목록에 올바르지 않은 파일이 있습니다.")
            staged = download_dir / name
            client.download_file_to_path(asset_id, staged)
            video_paths[name] = staged
        environment_sync.restore_environment(settings | {"backgrounds": backgrounds}, video_paths, _environment_data_dir(), rollback_dir)
        state.update({"manifestFileId": file_info["id"], "revision": manifest["revision"],
                      "settingsSha256": _settings_fingerprint(settings)})
        _write_environment_state(state)
        return {"revision": manifest["revision"], "settings": {key: value for key, value in settings.items() if key != "browserSettings"},
                "browserSettings": settings.get("browserSettings", {}), "backgroundCount": len(backgrounds),
                "backgroundBytes": sum(int(item.get("size", 0)) for item in backgrounds)}
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Drive 환경 복원에 실패했습니다: {exc}") from exc
    finally:
        shutil.rmtree(staging_dir, ignore_errors=True)


@router.get("/status")
async def get_status():
    from backend.services.google_drive import client_id, client_secret
    return {**oauth_status(), "configured": bool(client_id() and client_secret())}


@router.post("/connect")
async def connect_drive():
    try:
        return start_oauth()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.delete("/connect")
async def disconnect_drive():
    clear_tokens()
    return {"connected": False}


@router.post("/projects/{project_id}/snapshots")
async def create_snapshot(project_id: str, request: BackupRequest):
    try:
        async with storage._get_project_lock(project_id):
            if manager.project_data and manager.project_data.id == project_id:
                project = manager.project_data.model_copy(deep=True)
            else:
                project = await storage.load_project_data(project_id)
        states = _read_state()
        local = states.get(project_id, {})
        device_id = states.setdefault("_deviceId", str(uuid.uuid4()))
        cloud_project_id = local.get("cloudProjectId") or str(uuid.uuid4())
        branch_id = local.get("branchId") or str(uuid.uuid4())
        snapshot_id = str(uuid.uuid4())
        project_payload = project.model_dump()
        snapshot_args = dict(
            project=project_payload, data_dir=APP_DATA_DIR,
            cloud_project_id=cloud_project_id, branch_id=branch_id,
            parent_snapshot_id=local.get("snapshotId"), device_id=device_id,
            device_label=request.deviceLabel.strip() or "이 PC", app_version=CURRENT_VERSION,
            snapshot_id=snapshot_id,
        )
        client = GoogleDriveClient()
        uploaded_assets = {}
        for asset, content in iter_referenced_assets(project_payload, data_dir=APP_DATA_DIR):
            uploaded_assets[asset["sha256"]] = client.upload_asset(content, asset["sha256"])
        package = build_snapshot(**snapshot_args, asset_drive_ids=uploaded_assets, include_asset_content=False)
        manifest, _, _ = read_snapshot(package)
        uploaded = client.upload_snapshot(package, manifest)
        states[project_id] = {
            "cloudProjectId": manifest["cloudProjectId"], "branchId": manifest["branchId"],
            "snapshotId": manifest["snapshotId"], "deviceId": device_id,
        }
        _write_state(states)
        snapshots = client.list_snapshots(manifest["cloudProjectId"])
        heads = find_branch_heads(snapshots)
        return {"snapshot": {**manifest, "fileId": uploaded["id"], "size": len(package)}, "heads": heads}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Google Drive 백업에 실패했습니다: {exc}") from exc


@router.get("/projects/{project_id}/snapshots")
async def list_project_snapshots(project_id: str):
    states = _read_state()
    local = states.get(project_id)
    if not local:
        return {"snapshots": [], "heads": [], "cloudProjectId": None}
    try:
        snapshots = GoogleDriveClient().list_snapshots(local["cloudProjectId"])
        return {"cloudProjectId": local["cloudProjectId"], "snapshots": snapshots,
                "heads": find_branch_heads(snapshots)}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Drive 백업 목록을 불러오지 못했습니다: {exc}") from exc


@router.get("/snapshots")
async def list_all_snapshots():
    try:
        snapshots = GoogleDriveClient().list_snapshots()
        groups: dict[str, list[dict]] = {}
        for item in snapshots:
            groups.setdefault(item.get("cloudProjectId", ""), []).append(item)
        output = []
        for cloud_project_id, items in groups.items():
            heads = find_branch_heads(items)
            output.extend(dict(item, hasConflict=any(
                head["snapshotId"] == item.get("snapshotId") and head.get("hasConflict") for head in heads
            )) for item in items)
        return {"snapshots": output}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Drive 백업 목록을 불러오지 못했습니다: {exc}") from exc


@router.post("/restore")
async def restore_snapshot(request: RestoreRequest):
    try:
        client = GoogleDriveClient()
        package = client.download_snapshot(request.fileId)
        manifest, project, assets = read_snapshot(package)
        staging_dir = Path(APP_DATA_DIR) / "cloud_backup" / "tmp" / uuid.uuid4().hex
        staging_dir.mkdir(parents=True, exist_ok=True)
        for asset in manifest.get("assets", []):
            if asset.get("driveFileId"):
                staged_path = staging_dir / asset["sha256"]
                client.download_file_to_path(asset["driveFileId"], staged_path)
                if staged_path.stat().st_size != asset.get("size") or _hash_file(staged_path) != asset.get("sha256"):
                    raise ValueError(f"Drive 자산 체크섬이 일치하지 않습니다: {asset.get('name', '')}")
                assets[asset["driveFileId"]] = staged_path
        validated_project = ProjectData.model_validate(project)
        data_dir = Path(APP_DATA_DIR)
        restored_assets = restore_assets(manifest, assets, data_dir=data_dir)
        try:
            restored = await storage.import_project_data(validated_project.model_dump())
        except Exception:
            for path, digest in restored_assets:
                try:
                    if path.is_file() and _hash_file(path) == digest:
                        path.unlink(missing_ok=True)
                except OSError:
                    pass
            raise
        states = _read_state()
        states[restored.id] = {
            "cloudProjectId": manifest["cloudProjectId"], "branchId": str(uuid.uuid4()),
            "snapshotId": manifest["snapshotId"], "deviceId": states.get("_deviceId") or str(uuid.uuid4()),
        }
        states.setdefault("_deviceId", states[restored.id]["deviceId"])
        _write_state(states)
        return {"project": restored, "sourceSnapshotId": manifest["snapshotId"]}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"백업 복원에 실패했습니다: {exc}") from exc
    finally:
        if "staging_dir" in locals():
            shutil.rmtree(staging_dir, ignore_errors=True)
