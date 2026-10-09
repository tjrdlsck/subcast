"""Seed and verify user data around a real Windows installer upgrade."""

import argparse
import asyncio
import hashlib
import json
import os
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def seed(root: Path, state_file: Path) -> None:
    root.mkdir(parents=True, exist_ok=True)
    os.environ["SUBCAST_DATA_DIR"] = str(root)
    from backend.database import init_monitor_db
    from backend.schemas import ProjectData
    from backend.services.praise_service import PraiseDatabaseHelper

    projects = root / "data" / "projects"
    projects.mkdir(parents=True, exist_ok=True)
    project_file = projects / "proj_upgrade.json"
    preserved_element = {
        "id": "legacy_lyric", "type": "text", "content": "업데이트 전 보존 가사",
        "x": 12, "y": 62, "width": 76, "height": 18,
        "style": {"fontSize": "42px", "fontColor": "#ffee00", "fontFamily": "FixtureFont"},
    }
    project_file.write_text(
        ProjectData(
            id="proj_upgrade", name="Upgrade fixture",
            settings={"targetWidth": 1920, "targetHeight": 1080, "currentLiveSlideId": "praise_a"},
            slides=[
                {"id": "praise_a", "name": "찬양 A", "slideType": "praise", "isPraise": True, "elements": [preserved_element]},
                {"id": "blank", "name": "빈 화면", "slideType": "blank", "elements": []},
                {"id": "bible", "name": "성경", "elements": [{**preserved_element, "id": "legacy_verse", "content": "업데이트 전 보존 말씀"}]},
            ],
            templates=[{"id": "legacy_template", "name": "이전 디자인", "elements": [preserved_element]}],
            customFonts=[{"family": "FixtureFont", "cssCode": ".fixture-font { font-family: FixtureFont; }"}],
        ).model_dump_json(indent=2),
        encoding="utf-8",
    )
    (root / "data" / "active_project_id.txt").write_text("proj_upgrade", encoding="utf-8")
    (root / "data" / "templates.json").write_text(
        json.dumps([{"id": "legacy_template", "name": "이전 디자인", "elements": [preserved_element]}], ensure_ascii=False),
        encoding="utf-8",
    )
    (root / "subcast_config.json").write_text(
        json.dumps({"host": "127.0.0.1", "port": 18543, "auto_start_server": True}), encoding="utf-8"
    )
    backgrounds = root / "frontend" / "assets" / "backgrounds"
    backgrounds.mkdir(parents=True, exist_ok=True)
    (backgrounds / "upgrade-fixture.mp4").write_bytes(b"preserve-background")
    fonts = root / "frontend" / "fonts"
    fonts.mkdir(parents=True, exist_ok=True)
    (fonts / "fixture-font.woff2").write_bytes(b"preserve-font")

    database = root / "subcast_user.db"
    init_monitor_db(str(database))
    PraiseDatabaseHelper(str(database)).save_song("Upgrade song", "Preserved lyrics")
    with sqlite3.connect(database) as db:
        db.execute("UPDATE monitor_settings SET current_font_size = 43 WHERE setting_id = 'default_profile'")

    paths = [root / "data" / "active_project_id.txt", root / "data" / "templates.json",
             root / "subcast_config.json", backgrounds / "upgrade-fixture.mp4", fonts / "fixture-font.woff2"]
    state_file.write_text(json.dumps({str(path.relative_to(root)): _digest(path) for path in paths}), encoding="utf-8")


def verify(root: Path, state_file: Path) -> None:
    os.environ["SUBCAST_DATA_DIR"] = str(root)
    from backend.services.migration_service import migrate_legacy_db_if_needed
    from backend.storage import load_project_data

    expected = json.loads(state_file.read_text(encoding="utf-8"))
    for relative, digest in expected.items():
        assert _digest(root / relative) == digest, f"Saved file changed during upgrade: {relative}"

    assert migrate_legacy_db_if_needed(str(root)), "User database migration failed"
    project = asyncio.run(load_project_data("proj_upgrade"))
    assert project.name == "Upgrade fixture"
    assert [slide.id for slide in project.slides] == ["praise_a", "blank", "bible"]
    assert project.slides[0].elements[0].content == "업데이트 전 보존 가사"
    assert project.slides[0].elements[0].style.fontFamily == "FixtureFont"
    assert project.templates[0].name == "이전 디자인"
    assert project.customFonts[0].family == "FixtureFont"
    with sqlite3.connect(root / "subcast_user.db") as db:
        assert db.execute("SELECT lyrics FROM praise_songs WHERE title='Upgrade song'").fetchone() == ("Preserved lyrics",)
        assert db.execute("SELECT current_font_size FROM monitor_settings WHERE setting_id='default_profile'").fetchone() == (43,)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["seed", "verify"])
    parser.add_argument("root", type=Path)
    parser.add_argument("state_file", type=Path)
    args = parser.parse_args()
    (seed if args.action == "seed" else verify)(args.root, args.state_file)
