from __future__ import annotations

import json
import os
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend import storage
from backend.database import APP_DATA_DIR
from backend.services.cloud_backup import _hash_file, build_snapshot, find_branch_heads, iter_referenced_assets, read_snapshot, restore_assets
from backend.services.google_drive import GoogleDriveClient, clear_tokens, oauth_status, start_oauth
from backend.routers.system import CURRENT_VERSION
from backend.schemas import ProjectData
from backend.services.connection_manager import manager

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


class BackupRequest(BaseModel):
    deviceLabel: str = "이 PC"


class RestoreRequest(BaseModel):
    fileId: str


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
