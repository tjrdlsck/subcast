"""Collect, compare, validate, and restore the machine-wide environment bundle."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
import uuid
from pathlib import Path
from typing import Any

from backend.monitor_repository import get_monitor_settings, update_monitor_settings, validate_monitor_settings
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi"}


def user_database_path(data_dir: Path) -> Path:
    configured = os.environ.get("SUBCAST_USER_DB_PATH") or os.environ.get("SUBCAST_DB_PATH")
    return Path(configured) if configured else data_dir / "subcast_user.db"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _load_json(path: Path, default: Any) -> Any:
    if not path.is_file():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"환경 설정 파일을 읽을 수 없습니다: {path.name}") from exc


def _read_praise_songs(db_path: Path) -> list[dict[str, Any]]:
    if not db_path.is_file():
        return []
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "praise_songs" not in tables:
            return []
        return [dict(row) for row in conn.execute(
            "SELECT id, title, lyrics, mood FROM praise_songs ORDER BY id"
        )]
    finally:
        conn.close()


def collect_settings(data_dir: Path, browser_settings: dict[str, Any] | None = None) -> dict[str, Any]:
    """Export only editable shared data; the packaged Bible database is intentionally excluded."""
    data_dir = Path(data_dir)
    user_db = user_database_path(data_dir)
    monitor_settings = get_monitor_settings(str(user_db), initialize=False) if user_db.exists() else None
    templates = _load_json(data_dir / "data" / "templates.json", [])
    tags = _load_json(data_dir / "data" / "mood_tags.json", None)
    import_mappings = _load_json(data_dir / "data" / "project_import_tag_mappings.json", {})
    if not isinstance(templates, list) or not isinstance(import_mappings, dict):
        raise ValueError("환경 설정 데이터 형식이 올바르지 않습니다.")
    songs = _read_praise_songs(user_db)
    return {
        "praiseSongs": songs,
        "templates": templates,
        "monitorSettings": monitor_settings,
        "moodTags": tags,
        "importTagMappings": import_mappings,
        "browserSettings": browser_settings or {},
    }


def collect_user_videos(data_dir: Path) -> list[dict[str, Any]]:
    """Return all videos uploaded into Subcast, including renamed legacy uploads."""
    directory = Path(data_dir) / "frontend" / "assets" / "backgrounds"
    metadata_path = directory / "meta.json"
    metadata = _load_json(metadata_path, {})
    if not isinstance(metadata, dict):
        raise ValueError("배경 영상 메타데이터 형식이 올바르지 않습니다.")
    videos = []
    if not directory.exists():
        return videos
    for path in sorted(directory.iterdir(), key=lambda item: item.name.casefold()):
        if not path.is_file() or path.suffix.lower() not in VIDEO_EXTENSIONS:
            continue
        if path.name.startswith((".trash_", ".chunk_", ".pending_delete_")):
            continue
        item_meta = metadata.get(path.name, {})
        # upload_ is the durable marker used by older versions; new versions persist this flag through renames.
        if not path.name.startswith("upload_") and item_meta.get("userUploaded") is not True:
            continue
        videos.append({
            "name": path.name,
            "title": item_meta.get("title") or path.name,
            "size": path.stat().st_size,
            "sha256": _sha256(path),
            "path": path,
            "meta": {key: value for key, value in item_meta.items() if key != "thumbnailUrl"},
        })
    return videos


def compare_video_manifests(local: list[dict[str, Any]], remote: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    local_by_name = {item["name"]: item for item in local}
    remote_by_name = {item["name"]: item for item in remote}
    added = [local_by_name[name] for name in local_by_name.keys() - remote_by_name.keys()]
    removed = [remote_by_name[name] for name in remote_by_name.keys() - local_by_name.keys()]
    updated = [local_by_name[name] for name in local_by_name.keys() & remote_by_name.keys()
               if local_by_name[name].get("sha256") != remote_by_name[name].get("sha256")]
    return {
        "added": sorted(added, key=lambda item: item["name"].casefold()),
        "updated": sorted(updated, key=lambda item: item["name"].casefold()),
        "removed": sorted(removed, key=lambda item: item["name"].casefold()),
    }


def validate_settings(settings: Any) -> dict[str, Any]:
    if not isinstance(settings, dict):
        raise ValueError("Drive 환경 설정 형식이 올바르지 않습니다.")
    if not isinstance(settings.get("praiseSongs", []), list):
        raise ValueError("Drive 찬양곡 데이터 형식이 올바르지 않습니다.")
    if not isinstance(settings.get("templates", []), list):
        raise ValueError("Drive 템플릿 데이터 형식이 올바르지 않습니다.")
    if not isinstance(settings.get("importTagMappings", {}), dict):
        raise ValueError("Drive 태그 연결 데이터 형식이 올바르지 않습니다.")
    songs = []
    for song in settings.get("praiseSongs", []):
        if not isinstance(song, dict) or not str(song.get("title", "")).strip() or not isinstance(song.get("lyrics", ""), str):
            raise ValueError("Drive 찬양곡 데이터에 올바르지 않은 항목이 있습니다.")
        songs.append({"id": song.get("id"), "title": song["title"], "lyrics": song["lyrics"], "mood": song.get("mood") or "기본/일반"})
    monitor = settings.get("monitorSettings")
    if monitor is not None:
        if not isinstance(monitor, dict):
            raise ValueError("Drive 현장 모니터 설정 형식이 올바르지 않습니다.")
        validate_monitor_settings(monitor)
    browser_settings = settings.get("browserSettings", {})
    if not isinstance(browser_settings, dict):
        raise ValueError("Drive 브라우저 설정 형식이 올바르지 않습니다.")
    if (browser_settings.get("monitorSettings") is not None and not isinstance(browser_settings.get("monitorSettings"), dict)) or (
        browser_settings.get("broadcastLayout") is not None and not isinstance(browser_settings.get("broadcastLayout"), dict)
    ):
        raise ValueError("Drive 브라우저 설정 형식이 올바르지 않습니다.")
    return {**settings, "praiseSongs": songs, "browserSettings": browser_settings}


def _atomic_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + f".{uuid.uuid4().hex}.tmp")
    try:
        temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def apply_settings(settings: dict[str, Any], data_dir: Path) -> None:
    """Replace shared JSON and database settings, preserving other user database tables."""
    settings = validate_settings(settings)
    data_dir = Path(data_dir)
    db_path = user_database_path(data_dir)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("CREATE TABLE IF NOT EXISTS praise_songs (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, lyrics TEXT NOT NULL, mood TEXT DEFAULT '기본/일반', updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
        columns = {row[1] for row in conn.execute("PRAGMA table_info(praise_songs)")}
        if "mood" not in columns:
            conn.execute("ALTER TABLE praise_songs ADD COLUMN mood TEXT DEFAULT '기본/일반'")
        conn.execute("DELETE FROM praise_songs")
        for song in settings["praiseSongs"]:
            if song.get("id") is None:
                conn.execute("INSERT INTO praise_songs (title, lyrics, mood) VALUES (?, ?, ?)", (song["title"], song["lyrics"], song["mood"]))
            else:
                conn.execute("INSERT INTO praise_songs (id, title, lyrics, mood) VALUES (?, ?, ?, ?)", (song["id"], song["title"], song["lyrics"], song["mood"]))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    if settings.get("monitorSettings") is not None:
        update_monitor_settings(settings["monitorSettings"], str(db_path))
    _atomic_json(data_dir / "data" / "templates.json", settings.get("templates", []))
    mood_tags_path = data_dir / "data" / "mood_tags.json"
    if settings.get("moodTags") is None:
        mood_tags_path.unlink(missing_ok=True)
    else:
        _atomic_json(mood_tags_path, settings["moodTags"])
    _atomic_json(data_dir / "data" / "project_import_tag_mappings.json", settings.get("importTagMappings", {}))


def managed_video_names(data_dir: Path) -> set[str]:
    return {item["name"] for item in collect_user_videos(data_dir)}


def prepare_and_apply_videos(settings: dict[str, Any], video_paths: dict[str, Path], data_dir: Path) -> None:
    """Mirror only uploaded video files; retain packaged and non-uploaded local backgrounds."""
    data_dir = Path(data_dir)
    directory = data_dir / "frontend" / "assets" / "backgrounds"
    existing_meta = _load_json(directory / "meta.json", {})
    if not isinstance(existing_meta, dict):
        raise ValueError("현재 배경 영상 메타데이터가 손상되었습니다.")
    incoming = settings.get("backgrounds", [])
    incoming_by_name = {item["name"]: item for item in incoming}
    current_managed = managed_video_names(data_dir)
    for item in incoming:
        name = item["name"]
        if Path(name).name != name or Path(name).suffix.lower() not in VIDEO_EXTENSIONS:
            raise ValueError("Drive 배경 영상 파일명이 올바르지 않습니다.")
        staged = video_paths.get(name)
        if not staged or not staged.is_file() or staged.stat().st_size != item.get("size") or _sha256(staged) != item.get("sha256"):
            raise ValueError(f"Drive 배경 영상의 크기 또는 체크섬이 일치하지 않습니다: {name}")
        target = directory / name
        if target.exists() and name not in current_managed and _sha256(target) != item.get("sha256"):
            raise ValueError(f"같은 이름의 다른 배경 영상이 이미 있습니다: {name}")

    directory.mkdir(parents=True, exist_ok=True)
    for name in current_managed - incoming_by_name.keys():
        (directory / name).unlink(missing_ok=True)
        (directory / f"thumb_{Path(name).stem}.jpg").unlink(missing_ok=True)
        existing_meta.pop(name, None)
    for name, item in incoming_by_name.items():
        target = directory / name
        if name not in current_managed or not target.exists():
            shutil.copy2(video_paths[name], target)
        new_meta = {key: value for key, value in (item.get("meta") or {}).items() if key != "thumbnailUrl"}
        new_meta.update({"title": item.get("title") or name, "userUploaded": True, "isDefault": False})
        thumbnail = directory / f"thumb_{Path(name).stem}.jpg"
        try:
            thumbnail.unlink(missing_ok=True)
        except OSError:
            pass
        existing_meta[name] = new_meta
    _atomic_json(directory / "meta.json", existing_meta)


def restore_environment(settings: dict[str, Any], video_paths: dict[str, Path], data_dir: Path, rollback_dir: Path) -> None:
    """Apply a complete environment bundle and roll back local state if any step fails."""
    settings = validate_settings(settings)
    data_dir = Path(data_dir)
    rollback_dir = Path(rollback_dir)
    rollback_dir.mkdir(parents=True, exist_ok=True)
    directory = data_dir / "frontend" / "assets" / "backgrounds"
    current_managed = managed_video_names(data_dir)
    incoming = settings.get("backgrounds", [])
    incoming_names = {item.get("name") for item in incoming}
    touched_names = current_managed | incoming_names

    # Validate paths, checksums, and name collisions before changing any local data.
    for item in incoming:
        name = item.get("name")
        if not isinstance(name, str) or Path(name).name != name or Path(name).suffix.lower() not in VIDEO_EXTENSIONS:
            raise ValueError("Drive 배경 영상 파일명이 올바르지 않습니다.")
        staged = video_paths.get(name)
        if not staged or not staged.is_file() or staged.stat().st_size != item.get("size") or _sha256(staged) != item.get("sha256"):
            raise ValueError(f"Drive 배경 영상의 크기 또는 체크섬이 일치하지 않습니다: {name}")
        target = directory / name
        if target.exists() and name not in current_managed and _sha256(target) != item.get("sha256"):
            raise ValueError(f"같은 이름의 다른 배경 영상이 이미 있습니다: {name}")

    db_path = user_database_path(data_dir)
    db_backup = rollback_dir / "user-database.sqlite"
    if db_path.is_file():
        source = sqlite3.connect(db_path)
        target = sqlite3.connect(db_backup)
        try:
            source.backup(target)
        finally:
            target.close()
            source.close()

    json_paths = [data_dir / "data" / "templates.json", data_dir / "data" / "mood_tags.json",
                  data_dir / "data" / "project_import_tag_mappings.json"]
    json_backup: dict[Path, bytes | None] = {
        path: path.read_bytes() if path.is_file() else None for path in json_paths
    }
    meta_path = directory / "meta.json"
    meta_backup = meta_path.read_bytes() if meta_path.is_file() else None
    files_backup = rollback_dir / "backgrounds"
    files_backup.mkdir(exist_ok=True)
    for name in touched_names:
        path = directory / name
        if path.is_file():
            shutil.copy2(path, files_backup / name)
        thumb = directory / f"thumb_{Path(name).stem}.jpg"
        if thumb.is_file():
            shutil.copy2(thumb, files_backup / thumb.name)

    try:
        prepare_and_apply_videos(settings, video_paths, data_dir)
        apply_settings(settings, data_dir)
    except Exception:
        # Restore the user DB in place so other database tables (and Bible data) remain intact.
        if db_backup.is_file():
            current = sqlite3.connect(db_path)
            previous = sqlite3.connect(db_backup)
            try:
                previous.backup(current)
            finally:
                previous.close()
                current.close()
        elif db_path.exists():
            db_path.unlink(missing_ok=True)
        for path, content in json_backup.items():
            if content is None:
                path.unlink(missing_ok=True)
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                temp = path.with_name(path.name + f".{uuid.uuid4().hex}.rollback")
                temp.write_bytes(content)
                os.replace(temp, path)
        if meta_backup is None:
            meta_path.unlink(missing_ok=True)
        else:
            meta_path.parent.mkdir(parents=True, exist_ok=True)
            temp = meta_path.with_name(meta_path.name + f".{uuid.uuid4().hex}.rollback")
            temp.write_bytes(meta_backup)
            os.replace(temp, meta_path)
        for name in touched_names:
            target = directory / name
            backup = files_backup / name
            if backup.is_file():
                shutil.copy2(backup, target)
            else:
                target.unlink(missing_ok=True)
            thumb = directory / f"thumb_{Path(name).stem}.jpg"
            thumb_backup = files_backup / thumb.name
            if thumb_backup.is_file():
                shutil.copy2(thumb_backup, thumb)
            else:
                thumb.unlink(missing_ok=True)
        raise
