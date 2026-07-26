import pytest
import io
import json
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_project_export_and_import():
    # 1. Get project list
    response = client.get("/api/projects")
    assert response.status_code == 200
    projects = response.json()
    assert len(projects) > 0
    
    target_id = projects[0]["id"]
    
    # 2. Export single project
    export_res = client.get(f"/api/projects/{target_id}/export")
    assert export_res.status_code == 200
    project_json = export_res.json()
    assert project_json["id"] == target_id
    
    # 3. Import project back
    file_bytes = json.dumps(project_json).encode("utf-8")
    import_res = client.post(
        "/api/projects/import",
        files={"file": ("project_export.json", io.BytesIO(file_bytes), "application/json")}
    )
    assert import_res.status_code == 200
    import_data = import_res.json()
    assert import_data["status"] == "success"
    assert import_data["imported_count"] == 1
    imported_proj = import_data["projects"][0]
    assert imported_proj["id"] != target_id # New ID generated
    
    # Clean up imported project
    client.delete(f"/api/projects/{imported_proj['id']}")

def test_praise_export_and_import():
    # 1. Export praise songs
    export_res = client.get("/api/praise/export")
    assert export_res.status_code == 200
    songs = export_res.json()
    assert isinstance(songs, list)
    
    # 2. Import praise songs
    test_songs = [
        {"title": "테스트 찬양 101", "lyrics": "가사 테스트 101"},
        {"title": "테스트 찬양 102", "lyrics": "가사 테스트 102"}
    ]
    file_bytes = json.dumps(test_songs).encode("utf-8")
    import_res = client.post(
        "/api/praise/import",
        files={"file": ("praise_test.json", io.BytesIO(file_bytes), "application/json")}
    )
    assert import_res.status_code == 200
    assert import_res.json()["status"] == "success"
    assert import_res.json()["imported_count"] == 2
    
    # Verify imported song search
    search_res = client.get("/api/praise/search?query=테스트 찬양 101")
    assert search_res.status_code == 200
    found_songs = search_res.json()
    assert any(s["title"] == "테스트 찬양 101" for s in found_songs)
    
    # 3. Export specific praise song by id
    if found_songs:
        single_id = found_songs[0]["id"]
        single_export_res = client.get(f"/api/praise/export?ids={single_id}")
        assert single_export_res.status_code == 200
        single_exported_data = single_export_res.json()
        assert len(single_exported_data) == 1
        assert single_exported_data[0]["title"] == found_songs[0]["title"]
    
    # Clean up test praise songs
    test_ids = [s["id"] for s in found_songs if s["title"] in ["테스트 찬양 101", "테스트 찬양 102"]]
    if test_ids:
        client.post("/api/praise/delete", json={"ids": test_ids})

def test_praise_import_duplicate_titles():
    duplicate_songs = [
        {"title": "중복 테스트 찬양", "lyrics": "가사 내용 1"},
        {"title": "중복 테스트 찬양", "lyrics": "가사 내용 2"}
    ]
    file_bytes = json.dumps(duplicate_songs).encode("utf-8")
    res = client.post(
        "/api/praise/import",
        files={"file": ("praise_dup.json", io.BytesIO(file_bytes), "application/json")}
    )
    assert res.status_code == 200
    assert res.json()["imported_count"] == 2

    search_res = client.get("/api/praise/search?query=중복 테스트 찬양")
    assert search_res.status_code == 200
    results = search_res.json()
    titles = [s["title"] for s in results]
    assert "중복 테스트 찬양" in titles
    assert "중복 테스트 찬양 (1)" in titles

    clean_ids = [s["id"] for s in results if "중복 테스트 찬양" in s["title"]]
    if clean_ids:
        client.post("/api/praise/delete", json={"ids": clean_ids})
