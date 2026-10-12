from __future__ import annotations

import json
import os
import shutil
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException
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

_environment_operation_lock = threading.Lock()
_environment_operations: dict[str, dict] = {}
_active_environment_operation: str | None = None


def _start_environment_operation(operation_id: str, action: str) -> None:
    global _active_environment_operation
    with _environment_operation_lock:
        if _active_environment_operation:
            raise HTTPException(status_code=409, detail="환경 동기화 작업이 이미 진행 중입니다.")
        if operation_id in _environment_operations:
            raise HTTPException(status_code=409, detail="이미 사용한 환경 작업 ID입니다.")
        _environment_operations[operation_id] = {
            "operationId": operation_id, "action": action, "status": "running",
            "phase": "preparing", "percent": 1, "transferredBytes": 0,
            "totalBytes": 0, "completedItems": 0, "totalItems": 0,
            "currentFile": "", "message": "환경 작업을 준비하고 있습니다.",
        }
        _active_environment_operation = operation_id


def _update_environment_operation(operation_id: str, *, phase: str, message: str,
                                  percent: int | None = None, transferred_bytes: int | None = None,
                                  total_bytes: int | None = None, completed_items: int | None = None,
                                  total_items: int | None = None, current_file: str | None = None) -> None:
    with _environment_operation_lock:
        operation = _environment_operations.get(operation_id)
        if not operation or operation["status"] != "running":
            return
        operation["phase"] = phase
        operation["message"] = message
        if percent is not None:
            operation["percent"] = max(operation["percent"], min(99, percent))
        if transferred_bytes is not None:
            operation["transferredBytes"] = transferred_bytes
        if total_bytes is not None:
            operation["totalBytes"] = total_bytes
        if completed_items is not None:
            operation["completedItems"] = completed_items
        if total_items is not None:
            operation["totalItems"] = total_items
        if current_file is not None:
            operation["currentFile"] = current_file


def _finish_environment_operation(operation_id: str, *, error: str | None = None,
                                  error_status: int | None = None, result: dict | None = None) -> None:
    global _active_environment_operation
    with _environment_operation_lock:
        operation = _environment_operations.get(operation_id)
        if operation:
            operation.update({"status": "failed" if error else "completed",
                              "phase": "failed" if error else "complete",
                              "percent": operation["percent"] if error else 100,
                              "message": error or "환경 작업을 완료했습니다."})
            if error:
                operation["errorStatus"] = error_status
            else:
                operation["result"] = result or {}
        if _active_environment_operation == operation_id:
            _active_environment_operation = None
        completed = [key for key, value in _environment_operations.items() if value["status"] != "running"]
        for key in completed[:-10]:
            _environment_operations.pop(key, None)


def _read_environment_operation(operation_id: str) -> dict:
    with _environment_operation_lock:
        operation = _environment_operations.get(operation_id)
        if not operation:
            raise HTTPException(status_code=404, detail="환경 작업 상태를 찾을 수 없습니다.")
        return operation.copy()


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
    monitor_settings = settings_without_browser.get("monitorSettings")
    if isinstance(monitor_settings, dict):
        monitor_settings = {key: value for key, value in monitor_settings.items() if key != "updatedAt"}
        settings_without_browser["monitorSettings"] = monitor_settings
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
    operationId: str | None = None


class EnvironmentRestoreRequest(BaseModel):
    baseRevision: str
    operationId: str | None = None


def _settings_summary(settings: dict) -> dict:
    mood_tags = settings.get("moodTags")
    tags = mood_tags.get("tags", []) if isinstance(mood_tags, dict) else mood_tags
    browser_settings = settings.get("browserSettings")
    if not isinstance(browser_settings, dict):
        browser_settings = {}
    return {
        "praiseSongs": len(settings.get("praiseSongs", [])),
        "templates": len(settings.get("templates", [])),
        "moodTags": len(tags) if isinstance(tags, list) else 0,
        "importTagMappings": len(settings.get("importTagMappings", {})),
        "monitorSettings": settings.get("monitorSettings") is not None,
        "browserMonitorSettings": browser_settings.get("monitorSettings") is not None,
        "broadcastLayout": browser_settings.get("broadcastLayout") is not None,
    }


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
            "local": {"settingsSize": len(_json_bytes(settings)), "settingsSummary": _settings_summary(settings),
                      **_video_totals(videos), "backgrounds": _public_videos(videos)},
            "remote": {"revision": remote_revision, "settingsSize": len(_json_bytes(remote.get("settings", {}))) if remote else 0,
                       "settingsSummary": _settings_summary(remote.get("settings", {})) if remote else {},
                       **_video_totals(remote_videos), "backgrounds": _public_videos(remote_videos)},
            "changes": changes,
        }
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Drive 환경을 불러오지 못했습니다: {exc}") from exc


@router.get("/environment/operations/{operation_id}")
async def get_environment_operation(operation_id: str):
    return _read_environment_operation(operation_id)


def _run_environment_sync(request: EnvironmentSyncRequest, operation_id: str) -> dict:
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
        unique_uploads = {}
        for item in local_videos:
            if item["sha256"] not in previous_by_hash:
                unique_uploads.setdefault(item["sha256"], item)
        total_upload_bytes = sum(item["size"] for item in unique_uploads.values())
        completed_upload_bytes = 0
        completed_uploads = 0
        _update_environment_operation(operation_id, phase="uploading", message="변경된 배경을 Drive에 올리고 있습니다.",
                                      percent=5, total_bytes=total_upload_bytes, total_items=len(unique_uploads))
        hash_to_id: dict[str, str] = {}
        backgrounds = []
        for item in local_videos:
            digest = item["sha256"]
            old = previous_by_hash.get(digest)
            asset_id = hash_to_id.get(digest) or (old or {}).get("assetFileId")
            if not asset_id:
                def report_upload_progress(done: int) -> None:
                    transferred = completed_upload_bytes + done
                    percent = 5 + int(transferred / max(total_upload_bytes, 1) * 82)
                    _update_environment_operation(
                        operation_id, phase="uploading", message="변경된 배경을 Drive에 올리고 있습니다.",
                        percent=percent, transferred_bytes=transferred, total_bytes=total_upload_bytes,
                        completed_items=completed_uploads, total_items=len(unique_uploads), current_file=item["name"],
                    )

                uploaded = client.upload_environment_asset(item["path"], digest, progress_callback=report_upload_progress)
                asset_id = uploaded["id"]
                uploaded_ids.append(asset_id)
                completed_upload_bytes += item["size"]
                completed_uploads += 1
                _update_environment_operation(
                    operation_id, phase="uploading", message="변경된 배경을 Drive에 올리고 있습니다.",
                    percent=5 + int(completed_upload_bytes / max(total_upload_bytes, 1) * 82),
                    transferred_bytes=completed_upload_bytes, total_bytes=total_upload_bytes,
                    completed_items=completed_uploads, total_items=len(unique_uploads), current_file=item["name"],
                )
            hash_to_id[digest] = asset_id
            backgrounds.append({key: value for key, value in item.items() if key != "path"} | {"assetFileId": asset_id})

        _update_environment_operation(operation_id, phase="saving_settings", message="공통 설정과 동기화 목록을 저장하고 있습니다.",
                                      percent=89, transferred_bytes=total_upload_bytes,
                                      total_bytes=total_upload_bytes, completed_items=completed_uploads,
                                      total_items=len(unique_uploads), current_file="")
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
        assets_to_delete = sorted(pending_deletes - current_ids)
        _update_environment_operation(operation_id, phase="cleanup", message="Drive에서 삭제된 배경을 정리하고 있습니다.",
                                      percent=95, total_items=len(assets_to_delete), completed_items=0)
        for index, asset_id in enumerate(assets_to_delete, start=1):
            try:
                client.delete_environment_asset(asset_id)
            except Exception:
                cleanup_pending.append(asset_id)
            _update_environment_operation(operation_id, phase="cleanup", message="Drive에서 삭제된 배경을 정리하고 있습니다.",
                                          percent=95 + int(index / max(len(assets_to_delete), 1) * 4),
                                          completed_items=index, total_items=len(assets_to_delete))
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


def _execute_environment_operation(action: str, request: EnvironmentSyncRequest | EnvironmentRestoreRequest,
                                   operation_id: str) -> None:
    operation = _run_environment_sync if action == "sync" else _run_environment_restore
    try:
        result = operation(request, operation_id)
    except HTTPException as exc:
        _finish_environment_operation(operation_id, error=str(exc.detail), error_status=exc.status_code)
    except Exception:
        message = "Drive 환경 저장에 실패했습니다." if action == "sync" else "Drive 환경 복원에 실패했습니다."
        _finish_environment_operation(operation_id, error=message, error_status=500)
    else:
        _finish_environment_operation(operation_id, result=result)


@router.post("/environment/sync", status_code=202)
async def sync_environment(request: EnvironmentSyncRequest, background_tasks: BackgroundTasks):
    operation_id = request.operationId or uuid.uuid4().hex
    _start_environment_operation(operation_id, "sync")
    background_tasks.add_task(_execute_environment_operation, "sync", request, operation_id)
    return {"operationId": operation_id, "status": "running"}


def _run_environment_restore(request: EnvironmentRestoreRequest, operation_id: str) -> dict:
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
        total_download_bytes = sum(int(item.get("size", 0)) for item in backgrounds)
        downloaded_bytes = 0
        completed_downloads = 0
        _update_environment_operation(operation_id, phase="downloading", message="Drive에서 배경을 내려받고 있습니다.",
                                      percent=5, total_bytes=total_download_bytes, total_items=len(backgrounds))
        download_dir.mkdir(parents=True, exist_ok=True)
        video_paths: dict[str, Path] = {}
        for item in backgrounds:
            name = item.get("name") if isinstance(item, dict) else None
            asset_id = item.get("assetFileId") if isinstance(item, dict) else None
            if not isinstance(name, str) or Path(name).name != name or not isinstance(asset_id, str) or not asset_id:
                raise ValueError("Drive 배경 영상 목록에 올바르지 않은 파일이 있습니다.")
            staged = download_dir / name
            file_size = int(item.get("size", 0))

            def report_download_progress(done: int) -> None:
                transferred = downloaded_bytes + done
                percent = 5 + int(transferred / max(total_download_bytes, 1) * 83)
                _update_environment_operation(
                    operation_id, phase="downloading", message="Drive에서 배경을 내려받고 있습니다.",
                    percent=percent, transferred_bytes=transferred, total_bytes=total_download_bytes,
                    completed_items=completed_downloads, total_items=len(backgrounds), current_file=name,
                )

            client.download_file_to_path(asset_id, staged, progress_callback=report_download_progress)
            downloaded_bytes += file_size
            completed_downloads += 1
            _update_environment_operation(
                operation_id, phase="downloading", message="Drive에서 배경을 내려받고 있습니다.",
                percent=5 + int(downloaded_bytes / max(total_download_bytes, 1) * 83),
                transferred_bytes=downloaded_bytes, total_bytes=total_download_bytes,
                completed_items=completed_downloads, total_items=len(backgrounds), current_file=name,
            )
            video_paths[name] = staged
        _update_environment_operation(operation_id, phase="applying_settings", message="배경과 공통 설정을 이 PC에 적용하고 있습니다.",
                                      percent=94, transferred_bytes=downloaded_bytes,
                                      total_bytes=total_download_bytes, completed_items=completed_downloads,
                                      total_items=len(backgrounds), current_file="")
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


@router.post("/environment/restore", status_code=202)
async def restore_environment(request: EnvironmentRestoreRequest, background_tasks: BackgroundTasks):
    operation_id = request.operationId or uuid.uuid4().hex
    _start_environment_operation(operation_id, "restore")
    background_tasks.add_task(_execute_environment_operation, "restore", request, operation_id)
    return {"operationId": operation_id, "status": "running"}


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
