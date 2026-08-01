import os
import pytest

def test_monitor_html_has_stage_wrapper():
    html_path = os.path.join("frontend", "monitor.html")
    assert os.path.exists(html_path), f"HTML file missing: {html_path}"
    
    with open(html_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    assert 'id="monitor-stage-wrapper"' in content
    assert 'width: 768px; height: 432px' in content
    assert 'transform: translate(-50%, -50%)' in content

def test_viewer_html_has_stage_wrapper():
    html_path = os.path.join("frontend", "viewer.html")
    assert os.path.exists(html_path), f"HTML file missing: {html_path}"
    
    with open(html_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    assert 'id="monitor-stage-wrapper"' in content
    assert 'width: 768px; height: 432px' in content
    assert 'transform: translate(-50%, -50%)' in content

def test_viewer_js_has_stage_wrapper_transform_scaling():
    js_path = os.path.join("frontend", "js", "viewer.js")
    assert os.path.exists(js_path), f"JS file missing: {js_path}"
    
    with open(js_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    assert 'document.getElementById("monitor-stage-wrapper")' in content
    assert 'stageWrapper.style.transform =' in content
    assert 'scale(${scale})' in content
