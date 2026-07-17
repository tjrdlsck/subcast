import pytest
import asyncio
import os
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from backend.main import app, manager
from backend.schemas import CustomFont

client = TestClient(app)

@pytest.mark.anyio
async def test_add_custom_font():
    """웹 폰트 추가(ADD_CUSTOM_FONT) 및 로컬 저장 기능 유닛 테스트"""
    # 1. 매니저 초기화 및 환경 정리
    await manager.initialize()
    
    # 기존 customFonts 초기화
    manager.project_data.customFonts = []
    
    test_family = "TestPretendard"
    test_url = "https://cdn.example.com/fonts/TestPretendard-Regular.woff2"
    test_css = """@font-face {
        font-family: 'TestPretendard';
        src: url('https://cdn.example.com/fonts/TestPretendard-Regular.woff2') format('woff2');
    }"""
    
    # 2. HTTPX Get 요청 모의(Mock) 구성 (인터넷 없이 테스트 수행 보장)
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.content = b"fake-font-binary-data"
    
    with patch("httpx.AsyncClient.get", return_value=mock_response) as mock_get:
        with client.websocket_connect("/ws?role=editor") as ws:
            # 최초 동기화 패킷 제거
            ws.receive_json()
            
            # 3. 폰트 추가 요청 송신
            ws.send_json({
                "type": "ADD_CUSTOM_FONT",
                "family": test_family,
                "url": test_url,
                "originalCssCode": test_css
            })
            
            # 4. 동기화 브로드캐스트 수신 및 검증
            sync_resp = ws.receive_json()
            assert sync_resp["type"] == "INITIAL_SYNC"
            
            # 백엔드 데이터에 저장되었는지 검증
            fonts = manager.project_data.customFonts
            assert len(fonts) == 1
            assert fonts[0].family == test_family
            assert "/static/fonts/TestPretendard_" in fonts[0].cssCode
            
            # 실제 파일이 다운로드되어 저장되었는지 확인
            import re
            local_url_match = re.search(r"url\('(.*?)'\)", fonts[0].cssCode)
            assert local_url_match is not None
            
            local_url = local_url_match.group(1)
            assert local_url.startswith("/static/fonts/")
            
            filename = local_url.replace("/static/fonts/", "")
            filepath = os.path.join("frontend", "fonts", filename)
            
            assert os.path.exists(filepath)
            
            # 5. 테스트용 파일 청소
            try:
                os.remove(filepath)
            except Exception:
                pass
            
            # 백엔드 데이터 정리
            manager.project_data.customFonts = []
            from backend.main import save_project_data
            await save_project_data(manager.project_data)
