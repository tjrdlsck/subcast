import os
import pytest

def test_viewer_css_has_line_height_1_35_and_max_height_none():
    css_path = os.path.join("frontend", "css", "viewer.css")
    assert os.path.exists(css_path), f"CSS file missing: {css_path}"
    
    with open(css_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    assert "line-height: 1.35" in content
    assert "max-height: none" in content
    assert "overflow: visible" in content
    assert "padding: 0.15em 0.2em" in content

def test_monitor_html_has_line_height_1_35():
    html_path = os.path.join("frontend", "monitor.html")
    assert os.path.exists(html_path), f"HTML file missing: {html_path}"
    
    with open(html_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    assert "line-height: 1.35" in content
    assert "overflow: visible" in content
    assert "padding: 0.15em 0.2em" in content

def test_viewer_html_has_line_height_1_35():
    html_path = os.path.join("frontend", "viewer.html")
    assert os.path.exists(html_path), f"HTML file missing: {html_path}"
    
    with open(html_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    assert "line-height: 1.35" in content
    assert "overflow: visible" in content
    assert "padding: 0.15em 0.2em" in content

def test_viewer_js_has_line_height_1_35_and_max_height_none():
    js_path = os.path.join("frontend", "js", "viewer.js")
    assert os.path.exists(js_path), f"JS file missing: {js_path}"
    
    with open(js_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    assert 'lineHeight = "1.35"' in content or 'size * 1.35' in content
    assert 'maxHeight = "none"' in content
    assert 'overflow = "visible"' in content
