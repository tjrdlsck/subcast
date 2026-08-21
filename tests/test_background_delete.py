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

def test_pending_delete_files_excluded_from_list():
    """비동기 삭제 대기 중인 파일이 목록 조회에서 제외되는지 검증 테스트"""
    from backend.routers.backgrounds import pending_delete_bg_files

    test_file = backgrounds_dir / "test_pending_delete_bg.mp4"
    test_file.write_bytes(b"dummy pending delete video")

    try:
        # pending_delete_bg_files에 등록되지 않았을 때는 목록에 포함
        res = client.get("/api/backgrounds/list")
        assert res.status_code == 200
        names = [f["name"] for f in res.json().get("files", [])]
        assert "test_pending_delete_bg.mp4" in names

        # pending_delete_bg_files에 등록되면 목록에서 제외되어야 함
        pending_delete_bg_files.add("test_pending_delete_bg.mp4")
        res_after = client.get("/api/backgrounds/list")
        assert res_after.status_code == 200
        names_after = [f["name"] for f in res_after.json().get("files", [])]
        assert "test_pending_delete_bg.mp4" not in names_after
    finally:
        pending_delete_bg_files.discard("test_pending_delete_bg.mp4")
        if test_file.exists():
            test_file.unlink()
