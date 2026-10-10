import asyncio
import sqlite3
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

from backend import storage
from backend.services.migration_service import migrate_legacy_db_if_needed
from backend.services.update_backup import create_update_backup


def _set_storage_paths(monkeypatch: pytest.MonkeyPatch, root: Path) -> None:
    data = root / "data"
    monkeypatch.setattr(storage, "DATA_DIR", data)
    monkeypatch.setattr(storage, "PROJECTS_DIR", data / "projects")
    monkeypatch.setattr(storage, "ACTIVE_PROJECT_FILE", data / "active_project_id.txt")
    monkeypatch.setattr(storage, "OLD_DATA_FILE_PATH", data / "project_data.json")
    monkeypatch.setattr(storage, "TEMPLATES_FILE_PATH", data / "templates.json")


def test_corrupt_project_is_preserved(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    _set_storage_paths(monkeypatch, tmp_path)
    project = storage.PROJECTS_DIR / "proj_default.json"
    project.parent.mkdir(parents=True, exist_ok=True)
    project.write_text("{broken", encoding="utf-8")
    with pytest.raises(ValueError, match="Cannot read saved project"):
        asyncio.run(storage.load_project_data("proj_default"))
    assert project.read_text(encoding="utf-8") == "{broken"


def test_missing_active_project_does_not_create_default(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    _set_storage_paths(monkeypatch, tmp_path)
    storage.DATA_DIR.mkdir(exist_ok=True)
    storage.ACTIVE_PROJECT_FILE.write_text("proj_default", encoding="utf-8")
    with pytest.raises(FileNotFoundError, match="Saved project is missing"):
        asyncio.run(storage.load_project_data())
    assert not (storage.PROJECTS_DIR / "proj_default.json").exists()


def test_concurrent_template_saves_use_independent_atomic_files() -> None:
    from backend.schemas import SlideTemplate

    async def save_concurrently() -> None:
        templates = [
            [SlideTemplate(id=f"tpl_{index}", name=f"템플릿 {index}", elements=[])]
            for index in range(20)
        ]
        await asyncio.gather(*(storage.save_global_templates(item) for item in templates))

    asyncio.run(save_concurrently())

    saved = asyncio.run(storage.load_global_templates())
    assert len(saved) == 1
    assert saved[0].id.startswith("tpl_")
    assert not list(storage.DATA_DIR.glob("templates.*.tmp"))


def test_update_backup_contains_consistent_db_and_files(tmp_path: Path) -> None:
    appdata = tmp_path / "Subcast"
    appdata.mkdir()
    (appdata / "data").mkdir()
    (appdata / "data" / "project_data.json").write_text('{"slides": []}', encoding="utf-8")
    database = appdata / "subcast_user.db"
    with sqlite3.connect(database) as db:
        db.execute("CREATE TABLE settings (value TEXT)")
        db.execute("INSERT INTO settings VALUES ('saved')")

    backup = create_update_backup(str(appdata))
    assert backup.parent == tmp_path / "SubcastBackups"
    with zipfile.ZipFile(backup) as archive:
        assert archive.read("data/project_data.json") == b'{"slides": []}'
        restored = tmp_path / "restored.db"
        restored.write_bytes(archive.read("subcast_user.db"))
    with sqlite3.connect(restored) as db:
        assert db.execute("SELECT value FROM settings").fetchone() == ("saved",)


def test_failed_legacy_migration_can_retry_without_partial_db(tmp_path: Path) -> None:
    appdata = tmp_path / "Subcast"
    appdata.mkdir()
    legacy = appdata / "GAE_Bible.db"
    with sqlite3.connect(legacy) as db:
        db.execute("CREATE TABLE praise_songs (title TEXT)")
        db.execute("INSERT INTO praise_songs VALUES ('saved')")

    assert not migrate_legacy_db_if_needed(str(appdata))
    assert not (appdata / "subcast_user.db").exists()
    with sqlite3.connect(legacy) as db:
        assert db.execute("SELECT title FROM praise_songs").fetchone() == ("saved",)


def test_release_upgrade_fixture_round_trip(tmp_path: Path) -> None:
    script = Path(__file__).with_name("release_upgrade_fixture.py")
    root = tmp_path / "Subcast"
    state = tmp_path / "fixture-state.json"
    subprocess.run([sys.executable, str(script), "seed", str(root), str(state)], check=True)
    subprocess.run([sys.executable, str(script), "verify", str(root), str(state)], check=True)
