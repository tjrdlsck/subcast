import os
import re

def test_monitor_card_zindex_in_html_and_js():
    monitor_html_path = os.path.join("frontend", "monitor.html")
    viewer_js_path = os.path.join("frontend", "js", "viewer.js")
    
    with open(monitor_html_path, "r", encoding="utf-8") as f:
        html_content = f.read()

    # monitor-current-card & monitor-next-card z-index Check
    assert 'id="monitor-current-card"' in html_content
    assert 'id="monitor-next-card"' in html_content
    assert 'z-index: 10;' in html_content or 'z-index:10;' in html_content

    with open(viewer_js_path, "r", encoding="utf-8") as f:
        js_content = f.read()

    # curCard.style.zIndex = "10"; nxtCard.style.zIndex = "10";
    assert 'curCard.style.zIndex = "10"' in js_content
    assert 'nxtCard.style.zIndex = "10"' in js_content
    # customLayer.style.zIndex = "1";
    assert 'customLayer.style.zIndex = "1"' in js_content

def test_editor_slide_select_no_monitor_broadcast():
    editor_slides_path = os.path.join("frontend", "js", "modules", "editor-slides.js")
    
    with open(editor_slides_path, "r", encoding="utf-8") as f:
        content = f.read()

    # selectSlideForEdit should not call notifyMonitorSlideChange
    select_slide_match = re.search(r'function selectSlideForEdit\([^\)]*\)\s*\{([\s\S]*?)\n\s*\}', content)
    assert select_slide_match is not None, "selectSlideForEdit function not found"
    
    func_body = select_slide_match.group(1)
    assert "notifyMonitorSlideChange" not in func_body, "selectSlideForEdit still contains notifyMonitorSlideChange call"

def test_editor_monitor_guide_boxes_bring_to_front():
    editor_monitor_path = os.path.join("frontend", "js", "modules", "editor-monitor.js")
    
    with open(editor_monitor_path, "r", encoding="utf-8") as f:
        content = f.read()

    assert "currentGuideBox.bringToFront()" in content
    assert "nextGuideBox.bringToFront()" in content
