import pytest
import asyncio
from fastapi.testclient import TestClient
from backend.main import app, manager
from backend.schemas import SlideTemplate

client = TestClient(app)

def test_template_bulk_apply_and_undo():
    """템플릿 일괄 적용 및 백업, 되돌리기(UNDO_BULK_ACTION) 웹소켓 테스트"""
    # 1. 테스트 전 매니저 초기화 및 히스토리 청소
    asyncio.run(manager.initialize())
    manager.project_history.clear()
    
    # 임시 테스트 템플릿 주입
    test_tpl = {
        "id": "tpl_test_undo",
        "name": "테스트용 템플릿",
        "thumbnail": "data:image/jpeg;base64,dummy",
        "elements": [
            {
                "id": "elem_tpl_text",
                "type": "text",
                "content": "템플릿 텍스트",
                "x": 5.0,
                "y": 5.0,
                "width": 20.0,
                "height": 5.0,
                "style": {
                    "fontSize": "3vw",
                    "fontColor": "#ffffff",
                    "fontFamily": "Outfit"
                }
            }
        ]
    }
    
    # 기존 템플릿 캐시에 없으면 추가
    if not any(t.id == "tpl_test_undo" for t in manager.project_data.templates):
        manager.project_data.templates.append(SlideTemplate.model_validate(test_tpl))
    
    # 원본 슬라이드 1의 요소 개수 보관 (복구 검증용)
    slide_1_orig = next(s for s in manager.project_data.slides if s.id == "slide_1")
    orig_elements_count = len(slide_1_orig.elements)
    
    with client.websocket_connect("/ws?role=editor") as ws:
        # 최초 동기화 버림
        ws.receive_json()
        
        # 2. 템플릿 일괄 적용 (APPLY_TEMPLATE_BULK) 요청 발송
        ws.send_json({
            "type": "APPLY_TEMPLATE_BULK",
            "slideIds": ["slide_1"],
            "templateId": "tpl_test_undo"
        })
        
        # 3. 갱신 브로드캐스트 수신 및 검증
        sync_resp = ws.receive_json()
        assert sync_resp["type"] == "INITIAL_SYNC"
        assert sync_resp["historyCount"] == 1
        
        # 슬라이드 1의 요소가 템플릿 요소로 교체되었는지 검증
        slide_1 = next(s for s in manager.project_data.slides if s.id == "slide_1")
        assert len(slide_1.elements) == 1
        assert slide_1.elements[0].content == "템플릿 텍스트"
        
        # 4. 되돌리기 (UNDO_BULK_ACTION) 요청 발송
        ws.send_json({
            "type": "UNDO_BULK_ACTION"
        })
        
        # 5. 복구 브로드캐스트 수신 및 검증
        undo_resp = ws.receive_json()
        assert undo_resp["type"] == "INITIAL_SYNC"
        assert undo_resp["historyCount"] == 0
        
        # 슬라이드 1의 요소 개수가 원래대로 복구되었는지 검증
        restored_slide_1 = next(s for s in manager.project_data.slides if s.id == "slide_1")
        assert len(restored_slide_1.elements) == orig_elements_count
