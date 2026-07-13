import pytest
from fastapi.testclient import TestClient
from backend.main import app, manager

client = TestClient(app)

def test_read_root():
    """루트 경로 접속 시 JSON 응답 또는 Static 파일 서빙 안내 확인"""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert "roles" in data

def test_websocket_connection_invalid_role():
    """잘못된 role 파라미터로 웹소켓 접속 시도 시 거절 확인"""
    # 쿼리 파라미터 유효성 검사 실패 시 FastAPI는 웹소켓 연결이 되기 전에 예외를 발생시키거나 거절합니다.
    with pytest.raises(Exception):
        with client.websocket_connect("/ws?role=invalid") as websocket:
            pass

def test_websocket_sync():
    """웹소켓 정상 연결 및 초기 동기화(INITIAL_SYNC) 패킷 수신 테스트"""
    # 테스트 전 매니저 초기화 수동 호출 (FastAPI startup_event 대체)
    import asyncio
    asyncio.run(manager.initialize())
    
    with client.websocket_connect("/ws?role=presenter") as websocket:
        data = websocket.receive_json()
        assert data["type"] == "INITIAL_SYNC"
        assert "data" in data
        assert "settings" in data["data"]
        assert "slides" in data["data"]
        # 최초 락 상태는 비어있어야 함
        assert data["lockedSlides"] == {}

def test_websocket_slide_change():
    """웹소켓을 통한 슬라이드 변경 전파 테스트"""
    with client.websocket_connect("/ws?role=presenter") as ws_presenter:
        # 최초 동기화 패킷 버림
        ws_presenter.receive_json()
        
        # 슬라이드 변경 요청 전송
        ws_presenter.send_json({
            "type": "SLIDE_CHANGE",
            "slideId": "slide_2"
        })
        
        # 본인에게도 상태 갱신이 브로드캐스트되는지 확인
        resp = ws_presenter.receive_json()
        assert resp["type"] == "SLIDE_CHANGE"
        assert resp["slideId"] == "slide_2"
        
        # 캐싱된 전역 변수 값도 바뀌었는지 검증
        assert manager.project_data.settings.currentLiveSlideId == "slide_2"
