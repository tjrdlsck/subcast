import re
from pathlib import Path

def test_editor_html_contains_slide_sorter_elements():
    html_path = Path("frontend/editor.html")
    assert html_path.exists(), "frontend/editor.html must exist"
    content = html_path.read_text(encoding="utf-8")

    # 1. 모아보기 토글 버튼
    assert 'id="btn-toggle-sorter"' in content, "btn-toggle-sorter must exist in editor.html"
    assert "모아보기" in content, "모아보기 text must exist in editor.html"

    # 2. 오버레이 컨테이너 및 툴바
    assert 'id="slide-sorter-overlay"' in content, "slide-sorter-overlay must exist in editor.html"
    assert 'id="slide-sorter-grid"' in content, "slide-sorter-grid must exist in editor.html"
    assert 'id="btn-close-slide-sorter"' in content, "btn-close-slide-sorter must exist in editor.html"
    assert 'id="input-sorter-zoom"' in content, "input-sorter-zoom must exist in editor.html"
    assert 'id="sorter-slide-count"' in content, "sorter-slide-count must exist in editor.html"


def test_editor_css_contains_slide_sorter_styles():
    css_path = Path("frontend/css/editor.css")
    assert css_path.exists(), "frontend/css/editor.css must exist"
    content = css_path.read_text(encoding="utf-8")

    # 1. 좌측/우측 패널 자동 숨김 및 레이아웃 100% 확장
    assert "body.slide-sorter-active .left-sub-panel" in content, "Must hide left sub panel in sorter mode"
    assert "body.slide-sorter-active .right-inspector-panel" in content, "Must hide inspector panel in sorter mode"
    assert "display: none !important" in content, "display: none must be applied to side panels"

    # 2. 그리드 및 카드 스타일
    assert ".slide-sorter-grid" in content, ".slide-sorter-grid style must exist"
    assert "grid-template-columns: repeat(auto-fill, minmax(" in content, "Auto-fill responsive grid must be defined"
    assert ".sorter-card" in content, ".sorter-card style must exist"
    assert ".sorter-card.editing" in content, ".sorter-card.editing style must exist"
    assert ".sorter-card-index" in content, ".sorter-card-index style must exist"


def test_editor_slides_js_contains_sorter_logic():
    js_path = Path("frontend/js/modules/editor-slides.js")
    assert js_path.exists(), "frontend/js/modules/editor-slides.js must exist"
    content = js_path.read_text(encoding="utf-8")

    # 1. 핵심 함수 선언 및 캔버스 화면 맞춤
    assert "function openSlideSorter(" in content, "openSlideSorter must be defined"
    assert "function closeSlideSorter(" in content, "closeSlideSorter must be defined"
    assert "fitCanvasToScreen()" in content, "fitCanvasToScreen must be called when closing sorter"
    assert "canvas.calcOffset()" in content, "canvas.calcOffset must be called when closing sorter"
    assert "function toggleSlideSorter(" in content, "toggleSlideSorter must be defined"
    assert "function setSorterZoom(" in content, "setSorterZoom must be defined"
    assert "function renderSlideSorter(" in content, "renderSlideSorter must be defined"

    # 2. 더블클릭 이벤트 및 DND 처리
    assert "card.ondblclick =" in content, "ondblclick handler must be attached to sorter cards"
    assert "closeSlideSorter()" in content, "closeSlideSorter must be called upon dblclick"
    assert "REORDER_SLIDES" in content, "REORDER_SLIDES must be sent on sorter card drop"

    # 3. Ctrl+마우스 휠 줌 처리
    assert "e.ctrlKey" in content, "Ctrl key check for zoom must exist"
    assert "e.preventDefault()" in content, "preventDefault must be called to block native zoom"

    # 4. 전역 객체 노출
    assert "window.subcastSlideSorter =" in content, "window.subcastSlideSorter must be exposed"


def test_editor_shortcuts_js_contains_sorter_hotkeys():
    js_path = Path("frontend/js/modules/editor-shortcuts.js")
    assert js_path.exists(), "frontend/js/modules/editor-shortcuts.js must exist"
    content = js_path.read_text(encoding="utf-8")

    # Ctrl+G 및 Escape 단축키
    assert "subcastSlideSorter.toggle()" in content, "Ctrl+G toggle shortcut must exist"
    assert "subcastSlideSorter.close()" in content, "Escape close shortcut must exist"


def test_slide_sorter_edge_cases_and_hardening():
    shortcuts_js = Path("frontend/js/modules/editor-shortcuts.js").read_text(encoding="utf-8")
    slides_js = Path("frontend/js/modules/editor-slides.js").read_text(encoding="utf-8")
    canvas_js = Path("frontend/js/modules/editor-canvas.js").read_text(encoding="utf-8")
    css_content = Path("frontend/css/editor.css").read_text(encoding="utf-8")

    # 1. 단축키 충돌 격리: Delete, Ctrl+X, Ctrl+C 핸들러에서 isSorterActive 우선 처리
    assert "const isSorterActive = !!(window.subcastSlideSorter" in shortcuts_js
    assert "deleteSelectedSlidesWithConfirm()" in shortcuts_js
    assert "cutSelectedSlides()" in shortcuts_js
    assert "copySelectedSlides()" in shortcuts_js

    # 2. 실시간 썸네일 즉시 캡처 및 3. 타 오버레이 배타성 보장 및 1. 캔버스 선택 해제
    assert "canvas.discardActiveObject()" in slides_js
    assert "hideBibleMainViewer()" in slides_js
    assert "hidePraiseMainViewer()" in slides_js
    assert "curSlide.thumbnail = canvas.toDataURL" in slides_js

    # 4. 2D DND 드롭 인디케이터 클래스
    assert ".sorter-card.drag-over-left" in css_content
    assert ".sorter-card.drag-over-right" in css_content
    assert 'card.classList.add("drag-over-left")' in slides_js

    # 5. 빈 슬라이드 방어
    assert "if (!projectData || !projectData.slides || projectData.slides.length === 0)" in slides_js

    # 6. 모아보기 중 리사이즈 캔버스 연산 스킵
    assert "if (typeof isSlideSorterOpen !== 'undefined' && isSlideSorterOpen) return;" in canvas_js
