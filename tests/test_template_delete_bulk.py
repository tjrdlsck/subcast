import pytest
import asyncio
from fastapi.testclient import TestClient
from backend.main import app, manager
from backend.schemas import SlideTemplate

client = TestClient(app)

def test_template_delete_bulk():
    """템플릿 일괄 삭제(DELETE_TEMPLATE with templateIds) 웹소켓 테스트"""
    # 1. 테스트 전 매니저 초기화
    asyncio.run(manager.initialize())
    
    # 임시 테스트 템플릿 2개 주입
    test_tpl_1 = {
        "id": "tpl_test_del_1",
        "name": "삭제 테스트 1",
        "thumbnail": "data:image/jpeg;base64,dummy",
        "elements": []
    }
    test_tpl_2 = {
        "id": "tpl_test_del_2",
        "name": "삭제 테스트 2",
        "thumbnail": "data:image/jpeg;base64,dummy",
        "elements": []
    }
    
    # 기존 템플릿 리스트에 추가 (중복 방지)
    if not any(t.id == "tpl_test_del_1" for t in manager.project_data.templates):
        manager.project_data.templates.append(SlideTemplate.model_validate(test_tpl_1))
    if not any(t.id == "tpl_test_del_2" for t in manager.project_data.templates):
        manager.project_data.templates.append(SlideTemplate.model_validate(test_tpl_2))
        
    assert any(t.id == "tpl_test_del_1" for t in manager.project_data.templates)
    assert any(t.id == "tpl_test_del_2" for t in manager.project_data.templates)
    
    with client.websocket_connect("/ws?role=editor") as ws:
        # 최초 동기화 버림
        ws.receive_json()
        
        # 2. 템플릿 일괄 삭제 요청 발송
        ws.send_json({
            "type": "DELETE_TEMPLATE",
            "templateIds": ["tpl_test_del_1", "tpl_test_del_2"]
        })
        
        # 3. 갱신 브로드캐스트 수신 및 검증
        sync_resp = ws.receive_json()
        assert sync_resp["type"] == "INITIAL_SYNC"
        
        # 템플릿들이 제거되었는지 검증
        templates = manager.project_data.templates
        assert not any(t.id == "tpl_test_del_1" for t in templates)
        assert not any(t.id == "tpl_test_del_2" for t in templates)
