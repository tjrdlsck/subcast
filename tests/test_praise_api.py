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

