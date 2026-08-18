import pytest
import asyncio
import os
from fastapi.testclient import TestClient
from backend.main import app
from backend.services.connection_manager import manager

client = TestClient(app)

def test_rapid_slide_change_broadcast():
    """빠른 연속 SLIDE_CHANGE 요청 시 모든 브로드캐스트가 즉각 전달되는지 검증"""
    asyncio.run(manager.initialize())
    
    with client.websocket_connect("/ws?role=presenter") as ws_presenter:
        # 최초 INITIAL_SYNC 패킷 수신
        sync_packet = ws_presenter.receive_json()
        assert sync_packet["type"] == "INITIAL_SYNC"
        
        # 슬라이드 1 -> 2 -> 3 연속 전송
        slide_ids = ["slide_1", "slide_2", "slide_3"]
        for s_id in slide_ids:
            ws_presenter.send_json({
                "type": "SLIDE_CHANGE",
                "slideId": s_id
            })
            resp = ws_presenter.receive_json()
            assert resp["type"] == "SLIDE_CHANGE"
            assert resp["slideId"] == s_id
            
        assert manager.project_data.settings.currentLiveSlideId == "slide_3"


def test_presenter_js_structure_and_optimistic_update():
    """presenter.js 파일 내 updateSlideActiveState 및 낙관적 UI 업데이트 코드가 존재하는지 검증"""
    js_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "js", "presenter.js")
    with open(js_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    assert "function updateSlideActiveState(" in content, "updateSlideActiveState 증분 업데이트 함수가 정의되어야 합니다."
    assert "currentLiveIndex = nextIdx;" in content, "navigateSlide에 로컬 인덱스 선반영(낙관적 업데이트)이 포함되어야 합니다."
    assert "slide-number-badge" in content, "배지 증분 스타일 갱신을 위한 클래스가 존재해야 합니다."
    assert "activeEl.blur()" in content, "버튼 포커스 방어 로직이 포함되어야 합니다."


def test_concurrent_save_project_data_no_locking_errors():
    """동시에 다수의 save_project_data 태스크가 실행되어도 WinError 32/2 없이 안전하게 처리되는지 검증"""
    async def _runner():
        from backend.storage import save_project_data, load_project_data
        data = await load_project_data("proj_default")
        
        tasks = [save_project_data(data) for _ in range(15)]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for r in results:
            assert not isinstance(r, Exception), f"Concurrent save raised exception: {r}"

    asyncio.run(_runner())

