"""Tag mapping helpers for importing projects onto a machine's local media library."""

import json
import unicodedata
from pathlib import Path
from typing import Any

from backend.database import APP_DATA_DIR
from backend.services.tag_service import canonical_tag_name


MAPPING_FILE = Path(APP_DATA_DIR) / "data" / "project_import_tag_mappings.json"


def _key(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip().lstrip("#").strip().casefold()


def extract_project_tags(raw: Any) -> list[str]:
    """Collect distinct source tags used by one project or an export list."""
    projects = raw if isinstance(raw, list) else [raw]
    found: dict[str, str] = {}

    def add_item(item: Any) -> None:
        if not isinstance(item, dict):
            return
        values: list[Any] = [item.get("mood"), item.get("tag"), item.get("stageBgMoodOverride")]
        moods = item.get("moods")
        values.extend(moods if isinstance(moods, list) else [moods])
        for value in values:
            if isinstance(value, str) and value.strip():
                cleaned = value.strip().lstrip("#").strip()
                found.setdefault(_key(cleaned), cleaned)

    for project in projects:
        if not isinstance(project, dict):
            continue
        for slide in project.get("slides", []) or []:
            add_item(slide)

    return sorted(found.values(), key=str.casefold)


def load_import_tag_mappings() -> dict[str, str]:
    if not MAPPING_FILE.exists():
        return {}
    try:
        raw = json.loads(MAPPING_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(raw, dict):
        return {}
    return {
        str(source): str(target)
        for source, target in raw.items()
        if isinstance(source, str) and source.strip() and isinstance(target, str) and target.strip()
    }


def save_import_tag_mappings(mappings: dict[str, str]) -> None:
    MAPPING_FILE.parent.mkdir(parents=True, exist_ok=True)
    clean = {
        source.strip().lstrip("#").strip(): canonical_tag_name(target)
        for source, target in mappings.items()
        if isinstance(source, str) and source.strip() and isinstance(target, str) and target.strip()
    }
    temp_path = MAPPING_FILE.with_suffix(".json.tmp")
    temp_path.write_text(json.dumps(clean, ensure_ascii=False, indent=2), encoding="utf-8")
    temp_path.replace(MAPPING_FILE)


def apply_import_tag_mappings(raw: dict[str, Any], mappings: dict[str, str]) -> dict[str, Any]:
    """Map imported slide tags and drop source-machine media references."""
    result = dict(raw)
    mapping_by_key = {_key(source): canonical_tag_name(target) for source, target in mappings.items()}

    def mapped(value: Any) -> Any:
        if not isinstance(value, str) or not value.strip():
            return value
        return mapping_by_key.get(_key(value), canonical_tag_name(value))

    slides = []
    for slide in result.get("slides", []) or []:
        if not isinstance(slide, dict):
            slides.append(slide)
            continue
        updated = dict(slide)
        for field in ("mood", "tag", "stageBgMoodOverride"):
            if field in updated:
                updated[field] = mapped(updated[field])
        moods = updated.get("moods")
        if isinstance(moods, list):
            updated["moods"] = [mapped(tag) for tag in moods]
        elif isinstance(moods, str):
            updated["moods"] = [mapped(moods)]
        # A direct video id and a saved output URL belong to the source machine.
        updated["overrideBgId"] = None
        slides.append(updated)
    result["slides"] = slides

    settings = result.get("settings")
    if isinstance(settings, dict):
        settings = dict(settings)
        settings["stageBgLibrary"] = None
        settings["stageBackground"] = None
        result["settings"] = settings
    return result
