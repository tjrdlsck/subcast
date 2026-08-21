import re
import pytest

def test_editor_bible_js_contains_safe_bindings():
    """editor-bible.js 내의 버그 수정 및 안전 바인딩 검증"""
    with open("frontend/js/modules/editor-bible.js", "r", encoding="utf-8") as f:
        content = f.read()

    # 1. getElementById 오호출 및 setTimeout 제거 검증
    assert 'document.getElementById("btn-bible-close-modal", "btn-bible-modal-close")' not in content

    # 2. XSS 이스케이프 유틸리티 함수 존재 검증
    assert 'function escapeHtml(' in content

    # 3. 사사기 약칭이 '삿'으로 올바르게 매핑되었는지 검증
    assert '"사사기": "삿"' in content
    assert '"이사야": "사"' in content

    # 4. NIV 영어 성경 약칭 매핑 존재 검증
    assert '"Genesis": "Gen"' in content
    assert '"Matthew": "Mat"' in content
    assert '"Revelation": "Rev"' in content

    # 5. 전역 이벤트 가드 플래그 존재 검증
    assert 'isBibleGlobalEventsBound' in content
    assert 'isBibleViewerWheelBound' in content

    # 6. WebSocket 연결 검증 추가 확인
    assert 'ws.readyState !== WebSocket.OPEN' in content

    # 7. deleteSlides 중복 제거 확인
    assert 'function deleteSlides(' not in content


def test_editor_slides_js_contains_delete_slides():
    """editor-slides.js로 deleteSlides 함수가 정상 이관되었는지 검증"""
    with open("frontend/js/modules/editor-slides.js", "r", encoding="utf-8") as f:
        content = f.read()

    assert 'function deleteSlides(slideIds)' in content
    assert 'ws.send(JSON.stringify({ type: "DELETE_SLIDES", slideIds: slideIds }));' in content


def test_split_text_by_length_behavior():
    """editor-bible-slides.js 내의 splitTextByLength 로직 검증"""
    with open("frontend/js/modules/editor-bible-slides.js", "r", encoding="utf-8") as f:
        content = f.read()

    assert 'splitTextByLength(text, maxLen = 80)' in content
    assert 'word.substring(i, i + maxLen)' in content
