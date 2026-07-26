import pytest
from fastapi.testclient import TestClient
from backend.main import app, manager

client = TestClient(app)

def test_read_root():
    """루트 경로 접속 시 JSON 응답 또는 Static 파일 서빙 안내 확인"""
    response = client.get("/")
    assert response.status_code == 200
    content_type = response.headers.get("content-type", "")
    if "application/json" in content_type:
        data = response.json()
        assert "message" in data
        assert "roles" in data
    else:
        assert "text/html" in content_type

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

def test_save_slide_with_shapes_and_styles():
    """도형(rect) 및 다양한 서식 스타일을 포함한 슬라이드 저장 및 검증"""
    import asyncio
    asyncio.run(manager.initialize())
    
    with client.websocket_connect("/ws?role=editor") as ws:
        # 최초 동기화 버림
        ws.receive_json()
        
        # 락 획득 시도
        ws.send_json({
            "type": "LOCK_SLIDE",
            "slideId": "slide_1",
            "editorName": "테스트에디터"
        })
        # LOCK 확인 패킷
        lock_resp = ws.receive_json()
        assert lock_resp["type"] == "SLIDE_LOCKED"
        
        # 사각형 및 원, 텍스트 스타일이 포함된 슬라이드 데이터 발송
        updated_slide = {
            "id": "slide_1",
            "name": "오프닝 타이틀",
            "elements": [
                {
                    "id": "elem_text_new",
                    "type": "text",
                    "content": "테스트 텍스트",
                    "x": 10.0,
                    "y": 20.0,
                    "width": 30.0,
                    "height": 5.0,
                    "style": {
                        "fontSize": "3.5vw",
                        "fontColor": "#ff0000",
                        "fontFamily": "Outfit",
                        "fontWeight": "bold",
                        "fontStyle": "italic",
                        "textAlign": "center"
                    }
                },
                {
                    "id": "elem_rect_new",
                    "type": "rect",
                    "content": "",
                    "x": 40.0,
                    "y": 50.0,
                    "width": 15.0,
                    "height": 10.0,
                    "style": {
                        "fillColor": "#00ff00",
                        "strokeColor": "#0000ff",
                        "strokeWidth": 2
                    }
                }
            ]
        }
        
        ws.send_json({
            "type": "SAVE_SLIDE",
            "slide": updated_slide
        })
        
        # 서버에서 브로드캐스트하는 SLIDE_UPDATED 패킷 수신 대기 (동기화)
        resp = ws.receive_json()
        assert resp["type"] == "SLIDE_UPDATED"
        assert resp["slideId"] == "slide_1"
        
        # 저장 확인을 위해 DB(메모리 캐시)를 재조회
        target_slide = next(s for s in manager.project_data.slides if s.id == "slide_1")
        assert target_slide.elements[0].id == "elem_text_new"
        assert target_slide.elements[0].style.fontWeight == "bold"
        assert target_slide.elements[1].id == "elem_rect_new"
        assert target_slide.elements[1].style.fillColor == "#00ff00"

def test_websocket_background_mode():
    """웹소켓을 통한 배경 모드 변경 및 영속화 테스트"""
    import asyncio
    asyncio.run(manager.initialize())
    
    with client.websocket_connect("/ws?role=presenter") as ws:
        # 최초 동기화 버림
        ws.receive_json()
        
        # 배경 모드를 transparent로 변경 요청
        ws.send_json({
            "type": "SET_BACKGROUND_MODE",
            "mode": "transparent"
        })
        
        # 브로드캐스트 패킷 수신
        resp = ws.receive_json()
        assert resp["type"] == "SET_BACKGROUND_MODE"
        assert resp["mode"] == "transparent"
        
        # 영속화된 캐시 확인
        assert manager.project_data.settings.backgroundMode == "transparent"
