import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from backend.main import app, backgrounds_dir, load_bg_meta, save_bg_meta

client = TestClient(app)

def test_delete_background_file_success():
    """배경 파일 삭제 성공 케이스 테스트"""
    test_file = backgrounds_dir / "test_delete_bg.mp4"
    test_file.write_bytes(b"dummy video content for deletion")

    thumb_file = backgrounds_dir / "thumb_test_delete_bg.jpg"
    thumb_file.write_bytes(b"dummy thumb content")

    meta = load_bg_meta()
    meta["test_delete_bg.mp4"] = {"thumbnailUrl": "/static/backgrounds/thumb_test_delete_bg.jpg"}
    save_bg_meta(meta)

    try:
        response = client.post("/api/backgrounds/delete", json={
            "names": ["test_delete_bg.mp4"]
        })
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["deleted_count"] == 1

        assert not test_file.exists()
        assert not thumb_file.exists()

        updated_meta = load_bg_meta()
        assert "test_delete_bg.mp4" not in updated_meta
    finally:
        for p in [test_file, thumb_file]:
            if p.exists():
                p.unlink()

def test_delete_background_file_empty_names():
    """빈 삭제 요청 전달 시 0건 반환 테스트"""
    response = client.post("/api/backgrounds/delete", json={"names": []})
    assert response.status_code == 200
    assert response.json()["deleted_count"] == 0
