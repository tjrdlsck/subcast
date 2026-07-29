import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from backend.main import app, backgrounds_dir, load_bg_meta, save_bg_meta, generate_thumbnail_ffmpeg

client = TestClient(app)

def test_list_background_files_endpoint():
    """배경 파일 목록 조회 API 및 메타데이터 / 썸네일 검증"""
    response = client.get("/api/backgrounds/list")
    assert response.status_code == 200
    data = response.json()
    assert "files" in data
    assert isinstance(data["files"], list)

def test_rename_background_file_endpoint(tmp_path):
    """배경 파일명 변경 시 썸네일 및 메타데이터 보존 테스트"""
    test_file = backgrounds_dir / "test_dummy_bg.mp4"
    test_file.write_bytes(b"dummy video content")

    meta = load_bg_meta()
    meta["test_dummy_bg.mp4"] = {
        "thumbnailUrl": "/static/backgrounds/thumb_test_dummy_bg.jpg",
        "title": "테스트 비디오"
    }
    save_bg_meta(meta)

    thumb_file = backgrounds_dir / "thumb_test_dummy_bg.jpg"
    thumb_file.write_bytes(b"dummy thumb image")

    try:
        response = client.post("/api/backgrounds/rename", json={
            "old_name": "test_dummy_bg.mp4",
            "new_name": "renamed_dummy_bg.mp4"
        })
        assert response.status_code == 200
        res_data = response.json()
        assert res_data["success"] is True
        assert res_data["new_name"] == "renamed_dummy_bg.mp4"
        assert res_data["thumbnailUrl"] == "/static/backgrounds/thumb_renamed_dummy_bg.jpg"

        # 파일 및 썸네일 변경 확인
        assert (backgrounds_dir / "renamed_dummy_bg.mp4").exists()
        assert (backgrounds_dir / "thumb_renamed_dummy_bg.jpg").exists()

        # 메타데이터 갱신 확인
        updated_meta = load_bg_meta()
        assert "renamed_dummy_bg.mp4" in updated_meta
        assert updated_meta["renamed_dummy_bg.mp4"]["thumbnailUrl"] == "/static/backgrounds/thumb_renamed_dummy_bg.jpg"

    finally:
        # 정리 (Cleanup)
        for p in [
            backgrounds_dir / "test_dummy_bg.mp4",
            backgrounds_dir / "renamed_dummy_bg.mp4",
            backgrounds_dir / "thumb_test_dummy_bg.jpg",
            backgrounds_dir / "thumb_renamed_dummy_bg.jpg"
        ]:
            if p.exists():
                p.unlink()

        curr_meta = load_bg_meta()
        curr_meta.pop("test_dummy_bg.mp4", None)
        curr_meta.pop("renamed_dummy_bg.mp4", None)
        save_bg_meta(curr_meta)
