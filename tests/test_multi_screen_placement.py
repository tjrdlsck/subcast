import os
import re

def test_multi_screen_frontend_integration():
    """멀티 모니터 자동 분할 송출 관련 프론트엔드 파일 통합 검증"""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    editor_html_path = os.path.join(base_dir, "frontend", "editor.html")
    presenter_html_path = os.path.join(base_dir, "frontend", "presenter.html")
    index_html_path = os.path.join(base_dir, "frontend", "index.html")
    display_manager_js_path = os.path.join(base_dir, "frontend", "js", "modules", "editor-display-manager.js")
    editor_css_path = os.path.join(base_dir, "frontend", "css", "editor.css")
    viewer_html_path = os.path.join(base_dir, "frontend", "viewer.html")
    monitor_html_path = os.path.join(base_dir, "frontend", "monitor.html")

    # 1. 파일 존재 여부
    assert os.path.exists(editor_html_path), "editor.html 파일이 존재해야 합니다."
    assert os.path.exists(presenter_html_path), "presenter.html 파일이 존재해야 합니다."
    assert os.path.exists(index_html_path), "index.html 파일이 존재해야 합니다."
    assert os.path.exists(display_manager_js_path), "editor-display-manager.js 파일이 존재해야 합니다."
    assert os.path.exists(editor_css_path), "editor.css 파일이 존재해야 합니다."

    # 2. editor.html, presenter.html, index.html 내 버튼 및 스크립트 로드 검증
    with open(editor_html_path, "r", encoding="utf-8") as f:
        editor_html = f.read()
    assert "btn-multi-display-cast" in editor_html, "editor.html 헤더에 btn-multi-display-cast 버튼이 있어야 합니다."
    assert "editor-display-manager.js" in editor_html, "editor.html에 editor-display-manager.js 스크립트가 로드되어야 합니다."

    with open(presenter_html_path, "r", encoding="utf-8") as f:
        presenter_html = f.read()
    assert "btn-multi-display-cast" in presenter_html, "presenter.html 헤더에 btn-multi-display-cast 버튼이 있어야 합니다."
    assert "editor-display-manager.js" in presenter_html, "presenter.html에 editor-display-manager.js 스크립트가 로드되어야 합니다."

    with open(index_html_path, "r", encoding="utf-8") as f:
        index_html = f.read()
    assert "btn-multi-display-cast" in index_html, "index.html 헤더에 btn-multi-display-cast 버튼이 있어야 합니다."
    assert "editor-display-manager.js" in index_html, "index.html에 editor-display-manager.js 스크립트가 로드되어야 합니다."

    # 3. editor-display-manager.js 로직 검증
    with open(display_manager_js_path, "r", encoding="utf-8") as f:
        js_content = f.read()
    assert "modal-display-manager" in js_content, "동적 모달 생성 ID가 정의되어 있어야 합니다."
    assert "getScreenDetails" in js_content, "Window Management API(getScreenDetails) 호출 로직이 있어야 합니다."
    assert "startMultiScreenCast" in js_content, "일괄 송출 함수(startMultiScreenCast)가 정의되어 있어야 합니다."
    assert "closeAllCastWindows" in js_content, "일괄 닫기 함수(closeAllCastWindows)가 정의되어 있어야 합니다."
    assert "stage_viewer" in js_content and "stage_monitor" in js_content, "현장 뷰어 및 무대 모니터 라우팅 정의가 있어야 합니다."

    # 4. viewer.html 및 monitor.html 보조 스크립트 검증
    with open(viewer_html_path, "r", encoding="utf-8") as f:
        viewer_html = f.read()
    assert "requestFullscreen" in viewer_html, "viewer.html에 전체화면 보조 핸들러가 포함되어야 합니다."

    with open(monitor_html_path, "r", encoding="utf-8") as f:
        monitor_html = f.read()
    assert "requestFullscreen" in monitor_html, "monitor.html에 전체화면 보조 핸들러가 포함되어야 합니다."
