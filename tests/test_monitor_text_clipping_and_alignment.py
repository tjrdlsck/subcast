import os
import pytest

def test_viewer_css_clipping_removed():
    css_path = os.path.join("frontend", "css", "viewer.css")
    assert os.path.exists(css_path)
    with open(css_path, "r", encoding="utf-8") as f:
        content = f.read()

    assert "overflow: visible" in content
    assert "max-height: none" in content
    assert "line-height: 1.35;" in content

def test_monitor_html_clipping_removed():
    html_path = os.path.join("frontend", "monitor.html")
    assert os.path.exists(html_path)
    with open(html_path, "r", encoding="utf-8") as f:
        content = f.read()

    assert "display: block;" in content
    assert "overflow: visible;" in content
    assert "line-height: 1.35;" in content

def test_viewer_js_line_height_sync():
    js_path = os.path.join("frontend", "js", "viewer.js")
    assert os.path.exists(js_path)
    with open(js_path, "r", encoding="utf-8") as f:
        content = f.read()

    assert 'curText.style.display = "block";' in content
    assert 'curText.style.overflow = "visible";' in content
    assert 'curText.style.lineHeight = "1.35";' in content
    assert 'nxtText.style.lineHeight = "1.35";' in content

def test_editor_monitor_js_line_height():
    editor_path = os.path.join("frontend", "js", "modules", "editor-monitor.js")
    assert os.path.exists(editor_path)
    with open(editor_path, "r", encoding="utf-8") as f:
        content = f.read()

    assert "lineHeight: 1.35" in content
