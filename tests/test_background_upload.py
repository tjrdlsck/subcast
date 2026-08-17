import pytest
from fastapi.testclient import TestClient
from backend.main import app
import io

client = TestClient(app)

def test_list_backgrounds():
    response = client.get("/api/backgrounds/list")
    assert response.status_code == 200
    data = response.json()
    assert "files" in data

def test_youtube_download_removed():
    # 유튜브 다운로드 API가 제거되어 404 Not Found를 반환해야 함
    response = client.post("/api/backgrounds/download-youtube", json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"})
    assert response.status_code == 404

def test_upload_background_invalid_file():
    # 동영상 확장자가 아닌 파일 업로드 시 400 에러
    files = {'file': ('test.txt', b'hello world', 'text/plain')}
    response = client.post("/api/backgrounds/upload", files=files)
    assert response.status_code == 400


def test_upload_background_valid_video():
    # .mp4 동영상 파일 업로드 시 200 반환 및 title 필드 확인
    fake_mp4 = io.BytesIO(b'\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00isommp42')
    files = {'file': ('sample_worship_bg.mp4', fake_mp4, 'video/mp4')}
    response = client.post("/api/backgrounds/upload", files=files)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["title"] == "sample_worship_bg.mp4"
    assert "upload_" in data["filename"]

    # 목록 조회 시 title 확인
    list_res = client.get("/api/backgrounds/list")
    assert list_res.status_code == 200
    files_list = list_res.json()["files"]
    uploaded_item = next((f for f in files_list if f["name"] == data["filename"]), None)
    assert uploaded_item is not None
    assert uploaded_item["title"] == "sample_worship_bg.mp4"

    # 테스트 후 생성된 파일 정리
    client.post("/api/backgrounds/delete", json={"names": [data["filename"]]})
