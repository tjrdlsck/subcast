import os
import pytest

def test_editor_monitor_js_prevents_drag_cancellation():
    js_path = os.path.join("frontend", "js", "modules", "editor-monitor.js")
    assert os.path.exists(js_path), f"JS file missing: {js_path}"
    
    with open(js_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    assert "syncCanvasToMonitorSettings(isModifiedEnd = false)" in content
    assert "if (isModifiedEnd && !boxObj.group)" in content
    assert "canvas.on('object:resizing', handleGuideMoving)" in content
    assert "canvas.off('object:resizing', handleGuideMoving)" in content

def test_monitor_line_height_and_padding_in_css():
    css_path = os.path.join("frontend", "css", "viewer.css")
    assert os.path.exists(css_path), f"CSS file missing: {css_path}"
    
    with open(css_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    assert "line-height: 1.35" in content

def test_viewer_js_line_height_and_padding():
    js_path = os.path.join("frontend", "js", "viewer.js")
    assert os.path.exists(js_path), f"JS file missing: {js_path}"
    
    with open(js_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    assert 'lineHeight = size * 1.35' in content
