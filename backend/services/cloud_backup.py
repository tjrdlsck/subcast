"""Versioned, immutable project snapshots used by Google Drive backups."""

from __future__ import annotations

import hashlib
import io
import json
import os
import re
import shutil
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import unquote

FORMAT_VERSION = 1
_LOCAL_ASSET_RE = re.compile(r"/static/(backgrounds|fonts)/([^\"'?\s)]+)")


def _strip_thumbnails(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _strip_thumbnails(item) for key, item in value.items() if key != "thumbnail"}
    if isinstance(value, list):
        return [_strip_thumbnails(item) for item in value]
    return value


def _asset_root(kind: str, data_dir: Path) -> Path:
    return data_dir / "frontend" / "assets" / "backgrounds" if kind == "backgrounds" else data_dir / "frontend" / "fonts"


def _hash_file(path: Path, algorithm: str = "sha256") -> str:
    digest = hashlib.new(algorithm)
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def iter_referenced_assets(project: dict[str, Any], *, data_dir: str | Path) -> Iterator[tuple[dict[str, Any], Path]]:
    """Yield referenced local assets one at a time so Drive uploads need not buffer all media."""
    references: set[tuple[str, str]] = set()

    def scan(value: Any) -> None:
        if isinstance(value, str):
            for match in _LOCAL_ASSET_RE.finditer(value):
                kind, name = match.groups()
                name = unquote(name)
                if name in (".", "..") or "/" in name or "\\" in name:
                    raise ValueError("프로젝트에 안전하지 않은 자산 경로가 있습니다.")
                references.add((kind, name))
        elif isinstance(value, dict):
            for item in value.values():
                scan(item)
        elif isinstance(value, list):
            for item in value:
                scan(item)

    scan(project)
    root = Path(data_dir).resolve()
    for kind, name in sorted(references):
        if kind == "backgrounds" and name.startswith("thumb_"):
            continue
        path = (_asset_root(kind, root) / name).resolve()
        if kind == "fonts" and not path.is_file():
            legacy_paths = [Path.cwd() / "frontend" / "fonts" / name, Path(__file__).resolve().parents[2] / "frontend" / "fonts" / name]
            path = next((candidate.resolve() for candidate in legacy_paths if candidate.is_file()), path)
        allowed_roots = {_asset_root(kind, root).resolve()}
        if kind == "fonts":
            allowed_roots.update({(Path.cwd() / "frontend" / "fonts").resolve(), (Path(__file__).resolve().parents[2] / "frontend" / "fonts").resolve()})
        if path.parent not in allowed_roots or not path.is_file():
            raise ValueError(f"백업에 필요한 자산을 찾을 수 없습니다: {name}")
        digest = _hash_file(path)
        yield {"kind": kind, "name": name, "size": path.stat().st_size, "sha256": digest}, path


def build_snapshot(
    project: dict[str, Any],
    *,
    data_dir: str | Path,
    cloud_project_id: str | None = None,
    branch_id: str | None = None,
    parent_snapshot_id: str | None = None,
    device_id: str | None = None,
    device_label: str = "이 PC",
    app_version: str = "unknown",
    snapshot_id: str | None = None,
    asset_drive_ids: dict[str, str] | None = None,
    include_asset_content: bool = True,
) -> bytes:
    """Build a ZIP snapshot and include only locally referenced background/font files."""
    if not isinstance(project, dict) or not isinstance(project.get("slides"), list):
        raise ValueError("프로젝트 데이터 형식이 올바르지 않습니다.")

    root = Path(data_dir).resolve()
    payload = _strip_thumbnails(project)
    assets: list[dict[str, Any]] = []
    asset_paths: dict[str, Path] = {}
    for entry, path in iter_referenced_assets(payload, data_dir=root):
        digest = entry["sha256"]
        drive_file_id = (asset_drive_ids or {}).get(digest)
        archive_path = f"assets/{digest}" if include_asset_content else None
        if include_asset_content:
            asset_paths[archive_path] = path
        elif not drive_file_id:
            raise ValueError(f"Drive 자산 ID를 확인할 수 없습니다: {entry['name']}")
        entry = dict(entry)
        if archive_path:
            entry["path"] = archive_path
        if drive_file_id:
            entry["driveFileId"] = drive_file_id
        assets.append(entry)

    payload_bytes = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    snapshot_id = snapshot_id or str(uuid.uuid4())
    manifest = {
        "formatVersion": FORMAT_VERSION,
        "schemaVersion": 1,
        "cloudProjectId": cloud_project_id or str(uuid.uuid4()),
        "branchId": branch_id or str(uuid.uuid4()),
        "snapshotId": snapshot_id,
        "parentSnapshotId": parent_snapshot_id,
        "projectName": str(project.get("name") or "프로젝트")[:120],
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "appVersion": app_version,
        "deviceId": device_id or str(uuid.uuid4()),
        "deviceLabel": device_label[:80],
        "payloadSha256": hashlib.sha256(payload_bytes).hexdigest(),
        "assets": assets,
    }

    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, sort_keys=True))
        archive.writestr("project.json", payload_bytes)
        for archive_path, path in asset_paths.items():
            archive.write(path, arcname=archive_path)
    return output.getvalue()


def read_snapshot(content: bytes) -> tuple[dict[str, Any], dict[str, Any], dict[str, bytes]]:
    """Validate a snapshot completely before returning project data or assets."""
    try:
        with zipfile.ZipFile(io.BytesIO(content), "r") as archive:
            names = archive.namelist()
            if len(names) != len(set(names)) or any(name.startswith("/") or ".." in Path(name).parts for name in names):
                raise ValueError("백업 파일 경로가 올바르지 않습니다.")
            manifest = json.loads(archive.read("manifest.json"))
            payload_bytes = archive.read("project.json")
            payload = json.loads(payload_bytes)
            if not isinstance(manifest, dict) or not isinstance(manifest.get("assets", []), list):
                raise ValueError("백업 manifest 형식이 올바르지 않습니다.")
            if manifest.get("formatVersion") != FORMAT_VERSION:
                raise ValueError("지원하지 않는 백업 형식입니다.")
            if hashlib.sha256(payload_bytes).hexdigest() != manifest.get("payloadSha256"):
                raise ValueError("프로젝트 데이터 체크섬이 일치하지 않습니다.")
            assets: dict[str, bytes] = {}
            for asset in manifest.get("assets", []):
                if not isinstance(asset, dict) or asset.get("kind") not in {"backgrounds", "fonts"}:
                    raise ValueError("백업 자산 종류가 올바르지 않습니다.")
                asset_name = asset.get("name", "")
                if not isinstance(asset_name, str) or Path(asset_name).name != asset_name or "/" in asset_name or "\\" in asset_name:
                    raise ValueError("백업 자산 파일명이 올바르지 않습니다.")
                path = asset.get("path", "")
                digest = asset.get("sha256", "")
                if not isinstance(path, str):
                    raise ValueError("백업 자산 경로 정보가 올바르지 않습니다.")
                if path:
                    if path != f"assets/{digest}" or path not in names:
                        raise ValueError("백업 자산 정보가 올바르지 않습니다.")
                    data = archive.read(path)
                    if len(data) != asset.get("size") or hashlib.sha256(data).hexdigest() != digest:
                        raise ValueError(f"백업 자산 체크섬이 일치하지 않습니다: {asset.get('name', '')}")
                    assets[path] = data
                elif not isinstance(asset.get("driveFileId"), str) or not asset.get("driveFileId"):
                    raise ValueError("백업 자산 파일 정보를 찾을 수 없습니다.")
                if not re.fullmatch(r"[0-9a-f]{64}", digest):
                    raise ValueError("백업 자산 체크섬 정보가 올바르지 않습니다.")
            if not isinstance(payload, dict) or not isinstance(payload.get("slides"), list):
                raise ValueError("백업 프로젝트 데이터 형식이 올바르지 않습니다.")
            return manifest, payload, assets
    except (zipfile.BadZipFile, KeyError, json.JSONDecodeError) as exc:
        raise ValueError("손상되었거나 유효하지 않은 백업 파일입니다.") from exc


def restore_assets(manifest: dict[str, Any], assets: dict[str, bytes | Path], *, data_dir: str | Path) -> list[tuple[Path, str]]:
    """Restore verified local assets atomically without replacing different files."""
    root = Path(data_dir).resolve()
    created: list[tuple[Path, str]] = []
    try:
        for item in manifest.get("assets", []):
            if item.get("kind") not in {"backgrounds", "fonts"} or Path(item.get("name", "")).name != item.get("name"):
                raise ValueError("복원할 자산 경로가 올바르지 않습니다.")
            destination = _asset_root(item["kind"], root) / item["name"]
            if destination.exists():
                if _hash_file(destination) != item["sha256"]:
                    raise ValueError(f"같은 이름의 다른 자산이 있어 복원할 수 없습니다: {item['name']}")
                continue
            destination.parent.mkdir(parents=True, exist_ok=True)
            asset_key = item.get("path") if item.get("path") in assets else item.get("driveFileId")
            asset_content = assets.get(asset_key)
            if asset_content is None:
                raise ValueError(f"복원 자산 체크섬이 일치하지 않습니다: {item['name']}")
            if isinstance(asset_content, Path):
                if asset_content.stat().st_size != item.get("size") or _hash_file(asset_content) != item.get("sha256"):
                    raise ValueError(f"복원 자산 체크섬이 일치하지 않습니다: {item['name']}")
            elif len(asset_content) != item.get("size") or hashlib.sha256(asset_content).hexdigest() != item.get("sha256"):
                raise ValueError(f"복원 자산 체크섬이 일치하지 않습니다: {item['name']}")

            temp = destination.with_name(f".{destination.name}.{uuid.uuid4().hex}.tmp")
            try:
                with temp.open("xb") as output:
                    if isinstance(asset_content, Path):
                        with asset_content.open("rb") as source:
                            shutil.copyfileobj(source, output, length=1024 * 1024)
                    else:
                        output.write(asset_content)
                    output.flush()
                    os.fsync(output.fileno())
                try:
                    os.rename(temp, destination)
                    created.append((destination, item["sha256"]))
                except FileExistsError:
                    if _hash_file(destination) != item["sha256"]:
                        raise ValueError(f"같은 이름의 다른 자산이 있어 복원할 수 없습니다: {item['name']}")
            finally:
                temp.unlink(missing_ok=True)
        return created
    except Exception:
        for path, digest in created:
            if path.is_file() and _hash_file(path) == digest:
                path.unlink(missing_ok=True)
        raise


def find_branch_heads(snapshots: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return snapshots without children and mark concurrent children of one parent."""
    parent_counts: dict[str | None, int] = {}
    parents = {item.get("snapshotId"): item.get("parentSnapshotId") for item in snapshots}
    for parent in parents.values():
        if parent is not None:
            parent_counts[parent] = parent_counts.get(parent, 0) + 1
    parents_with_children = {item.get("parentSnapshotId") for item in snapshots if item.get("parentSnapshotId")}
    heads = []
    for item in snapshots:
        if item.get("snapshotId") in parents_with_children:
            continue
        ancestor = item.get("snapshotId")
        has_conflict = False
        visited: set[str] = set()
        while ancestor in parents:
            if ancestor in visited:
                has_conflict = True
                break
            visited.add(ancestor)
            parent = parents[ancestor]
            if parent_counts.get(parent, 0) > 1:
                has_conflict = True
                break
            ancestor = parent
        heads.append(dict(item, hasConflict=has_conflict))
    return sorted(heads, key=lambda item: item.get("createdAt", ""), reverse=True)
