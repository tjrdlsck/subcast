import pytest
from fastapi.testclient import TestClient
from backend.main import app, praise_db

client = TestClient(app)

def test_praise_api_workflow():
    # 1. 신규 찬양곡 등록 (mood 태그 포함)
    save_resp = client.post("/api/praise/save", json={
        "title": "테스트 찬양곡 100",
        "lyrics": "테스트 가사 1절\n테스트 가사 2절",
        "mood": "경배/찬양"
    })
    assert save_resp.status_code == 200
    assert save_resp.json()["status"] == "success"

    # 2. 찬양곡 검색 (제목 및 mood 태그 반환 확인)
    search_resp = client.get("/api/praise/search?query=테스트 찬양곡 100")
    assert search_resp.status_code == 200
    songs = search_resp.json()
    assert len(songs) > 0
    target_song = next((s for s in songs if s["title"] == "테스트 찬양곡 100"), None)
    assert target_song is not None
    assert "id" in target_song
    assert target_song.get("mood") == "경배/찬양"
    song_id = target_song["id"]

    # 3. 태그 키워드로 검색 (경배/찬양)
    tag_search_resp = client.get("/api/praise/search?query=경배/찬양")
    assert tag_search_resp.status_code == 200
    tag_songs = tag_search_resp.json()
    assert any(s["id"] == song_id for s in tag_songs)

    # 4. 찬양곡 수정 (제목 및 mood 업데이트)
    update_resp = client.post("/api/praise/save", json={
        "id": song_id,
        "title": "테스트 찬양곡 100 (수정)",
        "lyrics": "수정된 가사 내용",
        "mood": "잔잔/묵상"
    })
    assert update_resp.status_code == 200

    # 5. 수정 확인
    search_resp2 = client.get("/api/praise/search?query=테스트 찬양곡 100 (수정)")
    assert search_resp2.status_code == 200
    songs2 = search_resp2.json()
    updated_song = next((s for s in songs2 if s["id"] == song_id), None)
    assert updated_song is not None
    assert updated_song["title"] == "테스트 찬양곡 100 (수정)"
    assert updated_song["lyrics"] == "수정된 가사 내용"
    assert updated_song["mood"] == "잔잔/묵상"

    # 6. 찬양곡 삭제
    delete_resp = client.post("/api/praise/delete", json={
        "ids": [song_id]
    })
    assert delete_resp.status_code == 200
    assert delete_resp.json()["deleted_count"] >= 1

    # 7. 삭제 확인
    search_resp3 = client.get("/api/praise/search?query=테스트 찬양곡 100 (수정)")
    assert search_resp3.status_code == 200
    songs3 = search_resp3.json()
    assert not any(s["id"] == song_id for s in songs3)


def test_praise_save_rejects_duplicate_titles_without_overwriting():
    first = client.post("/api/praise/save", json={
        "title": "중복 저장 보호 테스트",
        "lyrics": "원본 가사",
        "mood": "경배/찬양",
    })
    assert first.status_code == 200
    first_id = first.json()["id"]

    duplicate = client.post("/api/praise/save", json={
        "title": "중복 저장 보호 테스트",
        "lyrics": "덮어쓰면 안 되는 가사",
        "mood": "잔잔/묵상",
    })
    assert duplicate.status_code == 409
    assert "이미 등록" in duplicate.json()["detail"]

    songs = client.get("/api/praise/search?query=중복 저장 보호 테스트").json()
    saved = next(song for song in songs if song["id"] == first_id)
    assert saved["lyrics"] == "원본 가사"
    assert saved["mood"] == "경배/찬양"


def test_praise_save_duplicate_checks_cover_title_normalization_and_edit_conflicts():
    first = client.post("/api/praise/save", json={
        "title": "Café Song",
        "lyrics": "첫 곡 가사",
    }).json()
    second = client.post("/api/praise/save", json={
        "title": "다른 곡",
        "lyrics": "두 번째 곡 가사",
    }).json()

    normalized_duplicate = client.post("/api/praise/save", json={
        "title": " CAFÉ SONG ",
        "lyrics": "중복 가사",
    })
    assert normalized_duplicate.status_code == 409

    conflicting_edit = client.post("/api/praise/save", json={
        "id": first["id"],
        "title": "다른 곡",
        "lyrics": "수정 가사",
    })
    assert conflicting_edit.status_code == 409

    unchanged = client.get("/api/praise/search?query=다른 곡").json()
    saved_second = next(song for song in unchanged if song["id"] == second["id"])
    assert saved_second["lyrics"] == "두 번째 곡 가사"

    same_title_edit = client.post("/api/praise/save", json={
        "id": first["id"],
        "title": "Café Song",
        "lyrics": "수정된 첫 곡 가사",
    })
    assert same_title_edit.status_code == 200
    updated_first = client.get("/api/praise/search?query=Cafe").json()
    saved_first = next(song for song in updated_first if song["id"] == first["id"])
    assert saved_first["lyrics"] == "수정된 첫 곡 가사"


def test_praise_save_rejects_unknown_song_id():
    response = client.post("/api/praise/save", json={
        "id": 999999,
        "title": "존재하지 않는 곡 수정",
        "lyrics": "가사",
    })
    assert response.status_code == 404

