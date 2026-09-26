import json
import re
import unicodedata
import uuid
from pathlib import Path
from typing import Any

from backend.database import APP_DATA_DIR
from backend.services.background_service import load_bg_meta
from backend.services.praise_service import praise_db
from backend.storage import PROJECTS_DIR


TAG_FILE = Path(APP_DATA_DIR) / "data" / "mood_tags.json"
DEFAULT_TAG = {"id": "default", "name": "기본/일반", "aliases": [], "locked": True}
PRESET_TAGS = [
    "경배/찬양", "잔잔/묵상", "기도/회개", "결단/헌금", "웅장/선포", "절기/특별"
]
_TAG_CACHE: list[dict[str, Any]] | None = None
_TAG_CACHE_MTIME_NS: int | None = None


def _tag_key(name: str) -> str:
    return unicodedata.normalize("NFKC", name).strip().casefold()


def _save_tags(tags: list[dict[str, Any]]) -> None:
    global _TAG_CACHE, _TAG_CACHE_MTIME_NS
    TAG_FILE.parent.mkdir(parents=True, exist_ok=True)
    temp_file = TAG_FILE.with_suffix(".json.tmp")
    with temp_file.open("w", encoding="utf-8") as file:
        json.dump({"version": 1, "tags": tags}, file, ensure_ascii=False, indent=2)
        file.flush()
    temp_file.replace(TAG_FILE)
    _TAG_CACHE = tags
    _TAG_CACHE_MTIME_NS = TAG_FILE.stat().st_mtime_ns


def _read_tags() -> list[dict[str, Any]]:
    global _TAG_CACHE, _TAG_CACHE_MTIME_NS
    if TAG_FILE.exists():
        try:
            mtime_ns = TAG_FILE.stat().st_mtime_ns
            if _TAG_CACHE is not None and _TAG_CACHE_MTIME_NS == mtime_ns:
                return _TAG_CACHE
            raw = json.loads(TAG_FILE.read_text(encoding="utf-8"))
            if not isinstance(raw, dict) or not isinstance(raw.get("tags"), list):
                raise ValueError("invalid tag registry structure")
            tags = raw["tags"]
            normalized = []
            for item in tags:
                if isinstance(item, dict) and item.get("id") and item.get("name"):
                    normalized.append({
                        "id": str(item["id"]),
                        "name": str(item["name"]).strip(),
                        "aliases": [str(alias).strip() for alias in (item.get("aliases") or []) if str(alias).strip()],
                        "locked": item.get("id") == "default",
                    })
            if not any(tag["id"] == "default" for tag in normalized):
                normalized.insert(0, dict(DEFAULT_TAG))
            for tag in normalized:
                if tag["id"] == "default":
                    tag["name"] = DEFAULT_TAG["name"]
                    tag["locked"] = True
            _TAG_CACHE = normalized
            _TAG_CACHE_MTIME_NS = mtime_ns
            return normalized
        except (OSError, ValueError, TypeError) as exc:
            raise RuntimeError("공통 태그 파일을 읽을 수 없습니다. 원본 파일을 확인해 주세요.") from exc

    tags = [dict(DEFAULT_TAG)] + [
        {"id": f"preset-{index}", "name": name, "aliases": [], "locked": False}
        for index, name in enumerate(PRESET_TAGS, start=1)
    ]
    _save_tags(tags)
    return tags


def canonical_tag_name(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        return "기본/일반"
    key = _tag_key(value.strip().lstrip("#").strip())
    for tag in _read_tags():
        if key == _tag_key(tag["name"]) or any(key == _tag_key(alias) for alias in tag["aliases"]):
            return tag["name"]
    return value.strip().lstrip("#").strip()


def tag_search_variants(query: str) -> list[str]:
    key = _tag_key(query.strip().lstrip("#").strip())
    for tag in _read_tags():
        if key == _tag_key(tag["name"]) or any(key == _tag_key(alias) for alias in tag["aliases"]):
            return list(dict.fromkeys([tag["name"], *tag["aliases"]]))
    return [query]


def _collect_legacy_names() -> set[str]:
    names: set[str] = set()
    conn = praise_db.get_connection()
    try:
        rows = conn.execute("SELECT DISTINCT mood FROM praise_songs WHERE mood IS NOT NULL").fetchall()
        names.update(str(row[0]).strip() for row in rows if str(row[0]).strip())
    finally:
        conn.close()

    for item in load_bg_meta().values():
        if isinstance(item, dict):
            names.update(_tag_values(item))

    if PROJECTS_DIR.exists():
        for project_file in PROJECTS_DIR.glob("*.json"):
            try:
                project = json.loads(project_file.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if not isinstance(project, dict):
                continue
            for slide in project.get("slides", []) or []:
                if isinstance(slide, dict):
                    names.update(_tag_values(slide))
            settings = project.get("settings", {})
            if isinstance(settings, dict):
                for item in settings.get("stageBgLibrary", []) or []:
                    if isinstance(item, dict):
                        names.update(_tag_values(item))
    return names


def _tag_values(item: dict[str, Any]) -> set[str]:
    values: set[str] = set()
    for value in (item.get("mood"), item.get("tag")):
        if isinstance(value, str) and value.strip():
            values.add(value.strip().lstrip("#").strip())
    moods = item.get("moods")
    if isinstance(moods, str):
        moods = [moods]
    if isinstance(moods, list):
        values.update(value.strip().lstrip("#").strip() for value in moods if isinstance(value, str) and value.strip())
    return values


def get_tags(include_usage: bool = True) -> list[dict[str, Any]]:
    tags = _read_tags()
    known = {_tag_key(tag["name"]) for tag in tags}
    known.update(_tag_key(alias) for tag in tags for alias in tag["aliases"])
    added = False
    for name in sorted(_collect_legacy_names(), key=str.casefold):
        key = _tag_key(name)
        if key not in known:
            tags.append({"id": str(uuid.uuid4()), "name": name, "aliases": [], "locked": False})
            known.add(key)
            added = True
    if added:
        _save_tags(tags)

    usage_by_id = _count_all_tag_usage(tags) if include_usage else {}
    results = []
    for tag in tags:
        result = dict(tag)
        if include_usage:
            result["usage"] = usage_by_id[tag["id"]]
        results.append(result)
    return results


def _validate_name(name: str, tags: list[dict[str, Any]], exclude_id: str | None = None) -> str:
    cleaned = unicodedata.normalize("NFKC", name).strip()
    if not cleaned:
        raise ValueError("태그 이름을 입력해 주세요.")
    if len(cleaned) > 30:
        raise ValueError("태그 이름은 30자 이내로 입력해 주세요.")
    if re.search(r"[\x00-\x1f\x7f]", cleaned):
        raise ValueError("태그 이름에 제어 문자를 사용할 수 없습니다.")
    key = _tag_key(cleaned)
    for tag in tags:
        names = [tag["name"], *tag["aliases"]]
        if tag["id"] != exclude_id and any(key == _tag_key(existing) for existing in names):
            raise ValueError("이미 사용 중이거나 이전 태그 이름과 같은 이름입니다.")
    return cleaned


def create_tag(name: str) -> dict[str, Any]:
    tags = _read_tags()
    cleaned = _validate_name(name, tags)
    tag = {"id": str(uuid.uuid4()), "name": cleaned, "aliases": [], "locked": False}
    tags.append(tag)
    _save_tags(tags)
    return {**tag, "usage": 0}


def rename_tag(tag_id: str, name: str) -> dict[str, Any]:
    tags = _read_tags()
    tag = next((item for item in tags if item["id"] == tag_id), None)
    if not tag:
        raise LookupError("태그를 찾을 수 없습니다.")
    if tag["locked"]:
        raise ValueError("기본 태그는 이름을 변경할 수 없습니다.")
    cleaned = _validate_name(name, tags, exclude_id=tag_id)
    if _tag_key(cleaned) != _tag_key(tag["name"]):
        if tag["name"] not in tag["aliases"]:
            tag["aliases"].append(tag["name"])
        tag["name"] = cleaned
    _save_tags(tags)
    return {key: value for key, value in tag.items() if key != "aliases"} | {"usage": count_tag_usage(tag, tags)}


def delete_tag(tag_id: str) -> dict[str, Any]:
    tags = _read_tags()
    tag = next((item for item in tags if item["id"] == tag_id), None)
    if not tag:
        raise LookupError("태그를 찾을 수 없습니다.")
    if tag["locked"]:
        raise ValueError("기본 태그는 삭제할 수 없습니다.")
    usage = count_tag_usage(tag, tags)
    default = next(item for item in tags if item["id"] == "default")
    default["aliases"] = list(dict.fromkeys([*default["aliases"], tag["name"], *tag["aliases"]]))
    tags = [item for item in tags if item["id"] != tag_id]
    _save_tags(tags)
    return {"deleted_id": tag_id, "usage": usage, "default_tag": default["name"]}


def count_tag_usage(target: dict[str, Any], tags: list[dict[str, Any]] | None = None) -> dict[str, int]:
    tags = tags or _read_tags()
    return _count_all_tag_usage(tags)[target["id"]]


def _count_all_tag_usage(tags: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    name_to_id = {}
    for tag in tags:
        for name in [tag["name"], *tag["aliases"]]:
            name_to_id[_tag_key(name)] = tag["id"]

    counts = {tag["id"]: {"songs": 0, "backgrounds": 0, "slides": 0} for tag in tags}
    background_names: dict[str, set[str]] = {tag["id"]: set() for tag in tags}

    def id_for(value: Any) -> str | None:
        if not isinstance(value, str) or not value.strip():
            return None
        return name_to_id.get(_tag_key(value.strip().lstrip("#").strip()))

    conn = praise_db.get_connection()
    try:
        for row in conn.execute("SELECT mood FROM praise_songs"):
            tag_id = id_for(row[0])
            if tag_id:
                counts[tag_id]["songs"] += 1
    finally:
        conn.close()

    for name, item in load_bg_meta().items():
        if isinstance(item, dict):
            for value in _tag_values(item):
                tag_id = id_for(value)
                if tag_id:
                    background_names[tag_id].add(name)

    if PROJECTS_DIR.exists():
        for project_file in PROJECTS_DIR.glob("*.json"):
            try:
                project = json.loads(project_file.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if not isinstance(project, dict):
                continue
            for slide in project.get("slides", []) or []:
                if isinstance(slide, dict):
                    slide_tags = {id_for(value) for value in _tag_values(slide)} - {None}
                    for tag_id in slide_tags:
                        counts[tag_id]["slides"] += 1
            settings = project.get("settings", {})
            if isinstance(settings, dict):
                for item in settings.get("stageBgLibrary", []) or []:
                    if isinstance(item, dict) and item.get("name"):
                        for value in _tag_values(item):
                            tag_id = id_for(value)
                            if tag_id:
                                background_names[tag_id].add(item["name"])

    for tag_id, names in background_names.items():
        counts[tag_id]["backgrounds"] = len(names)
    return counts


def canonicalize_item(item: dict[str, Any]) -> dict[str, Any]:
    result = dict(item)
    if result.get("mood"):
        result["mood"] = canonical_tag_name(result["mood"])
    if result.get("tag"):
        result["tag"] = canonical_tag_name(result["tag"])
    moods = result.get("moods")
    if isinstance(moods, str):
        result["moods"] = [canonical_tag_name(moods)]
    elif isinstance(moods, list):
        result["moods"] = [canonical_tag_name(value) for value in moods]
    return result


def canonicalize_project(project: dict[str, Any]) -> dict[str, Any]:
    result = dict(project)
    result["slides"] = [canonicalize_item(slide) for slide in result.get("slides", []) or [] if isinstance(slide, dict)]
    settings = result.get("settings")
    if isinstance(settings, dict):
        result["settings"] = dict(settings)
        result["settings"]["stageBgLibrary"] = [
            canonicalize_item(item)
            for item in settings.get("stageBgLibrary", []) or []
            if isinstance(item, dict)
        ]
    return result
