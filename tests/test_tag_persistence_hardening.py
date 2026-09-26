import json
import uuid

from fastapi.testclient import TestClient

from backend.main import app, praise_db
from backend.services import websocket_handler


client = TestClient(app)


def test_praise_tag_survives_export_and_import():
    suffix = uuid.uuid4().hex[:10]
    title = f"Tag round trip {suffix}"
    imported_title = f"Tag imported {suffix}"

    saved = client.post("/api/praise/save", json={
        "title": title,
        "lyrics": "Test lyrics",
        "moods": ["기도/회개"],
    })
    assert saved.status_code == 200
    song_id = saved.json()["id"]

    exported = client.get(f"/api/praise/export?ids={song_id}")
    assert exported.status_code == 200
    exported_song = json.loads(exported.content)[0]
    assert exported_song["mood"] == "기도/회개"

    imported_file = {
        "file": (
            "songs.json",
            json.dumps([{
                "title": imported_title,
                "lyrics": "Imported lyrics",
                "mood": exported_song["mood"],
            }]),
            "application/json",
        )
    }
    imported = client.post("/api/praise/import", files=imported_file)
    assert imported.status_code == 200
    assert imported.json()["imported_count"] == 1

    results = client.get("/api/praise/search", params={"query": imported_title})
    imported_song = next(song for song in results.json() if song["title"] == imported_title)
    assert imported_song["mood"] == "기도/회개"
    praise_db.delete_songs(song_ids=[song_id, imported_song["id"]])


def test_available_backgrounds_fill_missing_project_tags_from_metadata(monkeypatch, tmp_path):
    background_name = "legacy_project_video.mp4"
    (tmp_path / background_name).write_bytes(b"video")
    monkeypatch.setattr(websocket_handler, "backgrounds_dir", tmp_path)
    monkeypatch.setattr(websocket_handler, "load_bg_meta", lambda: {
        background_name: {
            "mood": "잔잔/묵상",
            "moods": ["잔잔/묵상"],
            "isDefault": True,
        }
    })

    backgrounds = websocket_handler._available_stage_backgrounds([
        {"name": background_name, "url": "/static/backgrounds/legacy_project_video.mp4"}
    ])

    assert len(backgrounds) == 1
    assert backgrounds[0]["mood"] == "잔잔/묵상"
    assert backgrounds[0]["moods"] == ["잔잔/묵상"]
    assert backgrounds[0]["isDefault"] is True
