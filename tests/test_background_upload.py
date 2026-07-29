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
