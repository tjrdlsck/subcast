import pytest
from fastapi.testclient import TestClient
from backend.main import app, backgrounds_dir, load_bg_meta, save_bg_meta
import json

@pytest.fixture
def client():
    return TestClient(app)

def test_stage_bg_tag_persistence(client):
    # 1. 배경 파일 및 meta.json 가상 세팅
    test_bg_name = "test_bg_tag.mp4"
    bg_path = backgrounds_dir / test_bg_name
    bg_path.write_bytes(b"dummy video content")

    meta = load_bg_meta()
    meta[test_bg_name] = {
        "mood": "경배/찬양",
        "moods": ["경배/찬양"],
        "isDefault": True,
        "thumbnailUrl": "/static/backgrounds/thumb_test_bg_tag.jpg"
    }
    save_bg_meta(meta)

    # 2. GET /api/backgrounds/list 호출 시 mood, moods, isDefault가 포함되어 반환되는지 확인
    res = client.get("/api/backgrounds/list")
    assert res.status_code == 200
    data = res.json()
    files = data.get("files", [])
    target_file = next((f for f in files if f["name"] == test_bg_name), None)
    
    assert target_file is not None
    assert target_file.get("mood") == "경배/찬양"
    assert target_file.get("moods") == ["경배/찬양"]
    assert target_file.get("isDefault") is True

    # Clean up
    if bg_path.exists():
        bg_path.unlink()
    meta = load_bg_meta()
    if test_bg_name in meta:
        meta.pop(test_bg_name)
        save_bg_meta(meta)
