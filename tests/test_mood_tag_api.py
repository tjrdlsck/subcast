from fastapi.testclient import TestClient

from backend.main import app
from backend.routers import backgrounds as backgrounds_router
from backend.services import tag_service


client = TestClient(app)


def test_tag_api_add_rename_delete_and_protect_default(monkeypatch, tmp_path):
    monkeypatch.setattr(tag_service, "TAG_FILE", tmp_path / "mood_tags.json")
    monkeypatch.setattr(tag_service, "_TAG_CACHE", None)
    monkeypatch.setattr(tag_service, "_TAG_CACHE_MTIME_NS", None)

    created = client.post("/api/tags", json={"name": "새 공통 태그"})
    assert created.status_code == 200
    tag_id = created.json()["id"]
    song = client.post("/api/praise/save", json={
        "title": "태그 삭제 연결 검증",
        "lyrics": "검증 가사",
        "mood": "새 공통 태그",
    })
    assert song.status_code == 200
    song_id = song.json()["id"]

    try:
        renamed = client.patch(f"/api/tags/{tag_id}", json={"name": "이름 바뀐 태그"})
        assert renamed.status_code == 200
        assert tag_service.canonical_tag_name("새 공통 태그") == "이름 바뀐 태그"

        deleted = client.delete(f"/api/tags/{tag_id}")
        assert deleted.status_code == 200
        assert deleted.json()["usage"]["songs"] == 1
        assert tag_service.canonical_tag_name("새 공통 태그") == "기본/일반"
        assert tag_service.canonical_tag_name("이름 바뀐 태그") == "기본/일반"
        result = client.get("/api/praise/search", params={"query": "태그 삭제 연결 검증"})
        assert result.status_code == 200
        assert result.json()[0]["mood"] == "기본/일반"

        assert client.patch("/api/tags/default", json={"name": "기본 변경"}).status_code == 400
        assert client.delete("/api/tags/default").status_code == 400
    finally:
        client.post("/api/praise/delete", json={"ids": [song_id]})


def test_unassigned_background_is_not_implicitly_marked_as_default(monkeypatch, tmp_path):
    image_name = "unassigned-background.jpg"
    (tmp_path / image_name).write_bytes(b"image")
    monkeypatch.setattr(backgrounds_router, "backgrounds_dir", tmp_path)
    monkeypatch.setattr(backgrounds_router, "load_bg_meta", lambda: {})

    response = client.get("/api/backgrounds/list")
    assert response.status_code == 200
    item = next(file for file in response.json()["files"] if file["name"] == image_name)
    assert item["mood"] is None
    assert item["moods"] == []
