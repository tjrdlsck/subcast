import asyncio
import json
import os
import sqlite3
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI

from backend import database, monitor_repository
from backend.routers import monitor
from backend.services import tag_service
from backend.services.praise_service import praise_db


def test_monitor_partial_updates_preserve_omitted_values(tmp_path: Path) -> None:
    repo = monitor_repository.MonitorSettingsRepository(str(tmp_path / "monitor.db"))
    elements = [{"id": "clock", "type": "clock", "leftPct": 23, "options": {"seconds": False}}]
    saved = repo.update_settings({
        "layoutMode": "custom_canvas",
        "currentBox": {"fontFamily": "Custom Font", "lineHeight": 1.7, "strokeWidth": 3},
        "nextBox": {"textColor": "#123456", "opacity": 0.4},
        "customElements": elements,
    })

    updated = repo.update_settings({"currentBox": {"textColor": "#ABCDEF"}})

    assert updated["currentBox"] == {**saved["currentBox"], "textColor": "#ABCDEF"}
    assert updated["nextBox"] == saved["nextBox"]
    assert updated["layoutMode"] == saved["layoutMode"]
    assert updated["customElements"] == elements
    assert repo.get_settings() == updated
    assert repo.update_settings({"customElements": []})["customElements"] == []


def test_monitor_router_keeps_dictionary_request_contract(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db_path = str(tmp_path / "router.db")
    received = []

    def update(payload: dict) -> dict:
        received.append(payload)
        return monitor_repository.update_monitor_settings(payload, db_path)

    monkeypatch.setattr(monitor, "update_monitor_settings", update)
    monkeypatch.setattr(monitor, "get_monitor_settings", lambda: monitor_repository.get_monitor_settings(db_path))
    app = FastAPI()
    app.include_router(monitor.router)
    schema = app.openapi()["paths"]["/api/v1/monitor/settings"]["put"]["requestBody"]["content"]["application/json"]["schema"]
    assert schema["type"] == "object"
    assert "$ref" not in schema
    payload = {
        "currentBox": {"fontSize": "4.5vw", "textColor": "#AABBCC"},
        "customElements": [{"id": "custom", "type": "text", "extension": {"enabled": True}}],
        "futureField": {"value": 1},
    }

    async def exercise() -> None:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", trust_env=False) as client:
            response = await client.put("/api/v1/monitor/settings", json=payload)
            assert response.status_code == 200
            assert response.json()["status"] == "success"
            settings = (await client.get("/api/v1/monitor/settings")).json()["data"]
            assert settings["currentBox"]["fontSize"] == "4.5vw"
            assert settings["customElements"] == payload["customElements"]
            invalid = await client.put("/api/v1/monitor/settings", json={"currentBox": {"leftPct": -1}})
            assert invalid.status_code == 400
            assert invalid.json()["errorCode"] == "INVALID_BOUNDS"
            assert (await client.get("/api/v1/monitor/settings")).json()["data"] == settings

    async def bounded_exercise() -> None:
        async with asyncio.timeout(10):
            await exercise()

    asyncio.run(bounded_exercise())
    assert received[0] == payload


@pytest.mark.parametrize("legacy", [False, True], ids=["new", "legacy"])
def test_monitor_initialization_preserves_profiles_and_upgrades_schema(tmp_path: Path, legacy: bool) -> None:
    db_path = str(tmp_path / "monitor.db")
    if legacy:
        with sqlite3.connect(db_path) as conn:
            conn.execute("""
                CREATE TABLE monitor_settings (
                    setting_id TEXT PRIMARY KEY,
                    layout_mode TEXT DEFAULT 'custom_canvas',
                    current_left_pct REAL DEFAULT 5,
                    current_top_pct REAL DEFAULT 5,
                    current_width_pct REAL DEFAULT 90,
                    current_height_pct REAL DEFAULT 42,
                    current_font_size INTEGER DEFAULT 28,
                    current_text_color TEXT DEFAULT '#FFFFFF',
                    current_bg_color TEXT DEFAULT 'transparent',
                    current_is_transparent INTEGER DEFAULT 1,
                    next_left_pct REAL DEFAULT 5,
                    next_top_pct REAL DEFAULT 51,
                    next_width_pct REAL DEFAULT 90,
                    next_height_pct REAL DEFAULT 42,
                    next_font_size INTEGER DEFAULT 22,
                    next_text_color TEXT DEFAULT '#A0A0A0',
                    next_bg_color TEXT DEFAULT 'transparent',
                    next_is_transparent INTEGER DEFAULT 1,
                    updated_at TEXT DEFAULT '2000-01-01 00:00:00'
                )
            """)
            conn.execute("INSERT INTO monitor_settings (setting_id, layout_mode, current_font_size) VALUES ('default_profile', 'legacy_layout', 37)")

    database.init_monitor_db(db_path)
    repo = monitor_repository.MonitorSettingsRepository(db_path)
    before = repo.get_settings()
    assert before["layoutMode"] == ("legacy_layout" if legacy else "custom_canvas")
    assert before["currentBox"]["fontSize"] == (37 if legacy else 28)
    assert before["currentBox"]["lineHeight"] == 1.35
    assert before["nextBox"]["lineHeight"] == 1.35
    assert before["customElements"] == []
    saved = repo.update_settings({"currentBox": {"strokeWidth": 2}, "customElements": [{"id": "legacy"}]})
    database.init_monitor_db(db_path)
    assert monitor_repository.MonitorSettingsRepository(db_path).get_settings() == saved
    with sqlite3.connect(db_path) as conn:
        assert conn.execute("SELECT COUNT(*) FROM monitor_settings").fetchone()[0] == 1


def test_monitor_explicit_repository_paths_are_isolated(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    default_path = tmp_path / "unused-default.db"
    monkeypatch.setattr(monitor_repository, "DEFAULT_DB_PATH", str(default_path))
    first_path = str(tmp_path / "first.db")
    second_path = str(tmp_path / "second.db")
    first = monitor_repository.MonitorSettingsRepository(first_path)
    second = monitor_repository.MonitorSettingsRepository(second_path)
    second_before = second.get_settings()
    saved = first.update_settings({"currentBox": {"textColor": "#012345"}})

    assert monitor_repository.get_monitor_settings(first_path) == saved
    assert second.get_settings() == second_before
    assert monitor_repository.get_monitor_settings(second_path) == second_before
    assert not default_path.exists()


def _write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")


@pytest.fixture
def tag_files(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Path, Path]:
    backgrounds = tmp_path / "backgrounds.json"
    _write_json(backgrounds, {})
    monkeypatch.setattr(tag_service, "load_bg_meta", lambda: json.loads(backgrounds.read_text(encoding="utf-8")))
    return tag_service.PROJECTS_DIR, backgrounds


def test_get_tags_discovers_legacy_names_and_persists_them(tag_files: tuple[Path, Path]) -> None:
    projects, backgrounds = tag_files
    praise_db.save_song("Legacy song", "lyrics", mood="Song legacy")
    _write_json(backgrounds, {"one.mp4": {"moods": ["# Background legacy"]}})
    _write_json(projects / "one.json", {
        "slides": [{"stageBgMoodOverride": "Slide legacy"}],
        "settings": {"stageBgLibrary": [{"name": "two.mp4", "tag": "Library legacy"}]},
    })

    tags = tag_service.get_tags(include_usage=False)
    by_name = {tag["name"]: tag for tag in tags}
    for name in ["Song legacy", "Background legacy", "Slide legacy", "Library legacy"]:
        assert name in by_name
    assert all("usage" not in tag for tag in tags)
    assert tag_service.get_tags(include_usage=False) == tags
    persisted = json.loads(tag_service.TAG_FILE.read_text(encoding="utf-8"))["tags"]
    assert {tag["id"] for tag in persisted} == {tag["id"] for tag in tags}


def test_get_tags_counts_aliases_and_deduplicates_backgrounds_and_slides(tag_files: tuple[Path, Path]) -> None:
    projects, backgrounds = tag_files
    tag = tag_service.create_tag("Former")
    tag_service.rename_tag(tag["id"], "Current")
    praise_db.save_song("First", "lyrics", mood="Former")
    praise_db.save_song("Second", "lyrics", mood="Current")
    _write_json(backgrounds, {"shared.mp4": {"mood": "Former", "moods": ["Current", "Former"]}})
    project = {
        "slides": [
            {"mood": "Former", "tag": "Current", "moods": ["Former", "Current"], "stageBgMoodOverride": "Current"},
            {"moods": "# CURRENT"},
        ],
        "settings": {"stageBgLibrary": [
            {"name": "shared.mp4", "tag": "Current"},
            {"name": "other.mp4", "moods": ["Current", "Former"]},
            {"name": "other.mp4", "tag": "Former"},
        ]},
    }
    _write_json(projects / "one.json", project)
    _write_json(projects / "two.json", {"slides": [], "settings": project["settings"]})

    tags = tag_service.get_tags()
    current = next(item for item in tags if item["id"] == tag["id"])
    assert current["usage"] == {"songs": 2, "backgrounds": 2, "slides": 2}
    assert current["aliases"] == ["Former"]
    assert not any(item["name"] == "Former" for item in tags)


def test_get_tags_reflects_external_source_and_registry_changes(tag_files: tuple[Path, Path]) -> None:
    projects, backgrounds = tag_files
    tag = tag_service.create_tag("Original")
    before = next(item for item in tag_service.get_tags() if item["id"] == tag["id"])
    assert before["usage"] == {"songs": 0, "backgrounds": 0, "slides": 0}
    registry = json.loads(tag_service.TAG_FILE.read_text(encoding="utf-8"))
    entry = next(item for item in registry["tags"] if item["id"] == tag["id"])
    entry.update(name="External", aliases=["Original"])
    old_mtime = tag_service.TAG_FILE.stat().st_mtime_ns
    _write_json(tag_service.TAG_FILE, registry)
    os.utime(tag_service.TAG_FILE, ns=(old_mtime + 1_000_000_000, old_mtime + 1_000_000_000))
    praise_db.save_song("External song", "lyrics", mood="Original")
    _write_json(backgrounds, {"fresh.mp4": {"tag": "External"}})
    project_path = projects / "fresh.json"
    _write_json(project_path, {"slides": [{"tag": "Original"}]})

    refreshed = next(item for item in tag_service.get_tags() if item["id"] == tag["id"])
    assert refreshed["name"] == "External"
    assert refreshed["usage"] == {"songs": 1, "backgrounds": 1, "slides": 1}
    _write_json(backgrounds, {})
    _write_json(project_path, {"slides": []})
    assert next(item for item in tag_service.get_tags() if item["id"] == tag["id"])["usage"] == {"songs": 1, "backgrounds": 0, "slides": 0}


def test_get_tags_skips_corrupt_and_non_object_projects(tag_files: tuple[Path, Path]) -> None:
    projects, _ = tag_files
    (projects / "corrupt.json").write_text("{broken", encoding="utf-8")
    _write_json(projects / "array.json", ["not a project"])
    _write_json(projects / "null.json", None)
    _write_json(projects / "valid.json", {"slides": [None, "ignored", {"tag": "Valid legacy"}], "settings": None})

    tags = tag_service.get_tags()
    valid = next(item for item in tags if item["name"] == "Valid legacy")
    assert valid["usage"] == {"songs": 0, "backgrounds": 0, "slides": 1}


def test_prepared_monitor_requests_do_not_initialize_schema(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db_path = str(tmp_path / "prepared.db")
    database.init_monitor_db(db_path)
    monkeypatch.setattr(monitor_repository, "DEFAULT_DB_PATH", db_path)
    calls = []
    original_init = monitor_repository.init_monitor_db

    def track_init(path: str) -> None:
        calls.append(path)
        original_init(path)

    monkeypatch.setattr(monitor_repository, "init_monitor_db", track_init)
    app = FastAPI()
    app.include_router(monitor.router)

    async def exercise() -> None:
        async with asyncio.timeout(10):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", trust_env=False) as client:
                assert (await client.get("/api/v1/monitor/settings")).status_code == 200
                assert (await client.put("/api/v1/monitor/settings", json={"currentBox": {"textColor": "#112233"}})).status_code == 200
                response = await client.get("/api/v1/monitor/settings")
                assert response.json()["data"]["currentBox"]["textColor"] == "#112233"

    asyncio.run(exercise())
    assert calls == []
    helper_path = str(tmp_path / "helper.db")
    assert monitor_repository.get_monitor_settings(helper_path)["settingId"] == "default_profile"
    assert calls == [helper_path]


def test_get_tags_reads_each_source_once(tag_files: tuple[Path, Path], monkeypatch: pytest.MonkeyPatch) -> None:
    projects, backgrounds = tag_files
    praise_db.save_song("Snapshot song", "lyrics", mood="Snapshot")
    _write_json(backgrounds, {"one.mp4": {"mood": "Snapshot"}})
    project_path = projects / "one.json"
    _write_json(project_path, {"slides": [{"tag": "Snapshot"}]})
    calls = {"songs": 0, "backgrounds": 0, "projects": 0}
    original_connection = praise_db.get_connection
    original_backgrounds = tag_service.load_bg_meta
    original_read_text = Path.read_text

    def connection():
        conn = original_connection()
        def trace(sql: str) -> None:
            if "SELECT" in sql.upper() and "PRAISE_SONGS" in sql.upper():
                calls["songs"] += 1
        conn.set_trace_callback(trace)
        return conn

    def load_backgrounds() -> dict:
        calls["backgrounds"] += 1
        return original_backgrounds()

    def read_text(path: Path, *args, **kwargs) -> str:
        if path == project_path:
            calls["projects"] += 1
        return original_read_text(path, *args, **kwargs)

    monkeypatch.setattr(praise_db, "get_connection", connection)
    monkeypatch.setattr(tag_service, "load_bg_meta", load_backgrounds)
    monkeypatch.setattr(Path, "read_text", read_text)
    result = next(tag for tag in tag_service.get_tags() if tag["name"] == "Snapshot")
    assert result["usage"] == {"songs": 1, "backgrounds": 1, "slides": 1}
    assert calls == {"songs": 1, "backgrounds": 1, "projects": 1}
    calls.update(songs=0, backgrounds=0, projects=0)
    assert all("usage" not in tag for tag in tag_service.get_tags(include_usage=False))
    assert calls == {"songs": 1, "backgrounds": 1, "projects": 1}


@pytest.mark.parametrize("missing", ["profile", "table"])
def test_monitor_requests_repair_missing_default_profile(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, missing: str) -> None:
    db_path = str(tmp_path / "damaged.db")
    database.init_monitor_db(db_path)
    monkeypatch.setattr(monitor_repository, "DEFAULT_DB_PATH", db_path)
    with sqlite3.connect(db_path) as conn:
        conn.execute("DELETE FROM monitor_settings" if missing == "profile" else "DROP TABLE monitor_settings")
    calls = []
    original_init = monitor_repository.init_monitor_db

    def track_init(path: str) -> None:
        calls.append(path)
        original_init(path)

    monkeypatch.setattr(monitor_repository, "init_monitor_db", track_init)
    app = FastAPI()
    app.include_router(monitor.router)

    async def exercise() -> None:
        async with asyncio.timeout(10):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", trust_env=False) as client:
                response = await client.get("/api/v1/monitor/settings")
                assert response.status_code == 200
                assert response.json()["data"]["settingId"] == "default_profile"
                assert (await client.get("/api/v1/monitor/settings")).status_code == 200

    asyncio.run(exercise())
    assert calls == [db_path]
    assert monitor_repository.MonitorSettingsRepository(db_path, initialize=False).get_settings("unknown") is None
    assert calls == [db_path]
