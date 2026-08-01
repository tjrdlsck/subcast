import os
import pytest

def test_viewer_css_has_unclipped_text_rules():
    css_path = os.path.join("frontend", "css", "viewer.css")
    assert os.path.exists(css_path), f"CSS file missing: {css_path}"
    
    with open(css_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    assert "#monitor-current-text" in content
    assert "#monitor-next-text" in content
    assert "overflow: visible" in content

def test_monitor_html_has_unclipped_styles():
    html_path = os.path.join("frontend", "monitor.html")
    assert os.path.exists(html_path), f"HTML file missing: {html_path}"
    
    with open(html_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    assert "display: block" in content
    assert "overflow: visible" in content

def test_viewer_html_has_unclipped_styles():
    html_path = os.path.join("frontend", "viewer.html")
    assert os.path.exists(html_path), f"HTML file missing: {html_path}"
    
    with open(html_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    assert "display: block" in content
    assert "overflow: visible" in content

def test_viewer_js_enforces_unclipped_text():
    js_path = os.path.join("frontend", "js", "viewer.js")
    assert os.path.exists(js_path), f"JS file missing: {js_path}"
    
    with open(js_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    assert "fitMonitorText" in content
    assert "overflow" in content
