import pytest
from pathlib import Path

def test_viewer_css_has_monitor_mode():
    css_path = Path("frontend/css/viewer.css")
    assert css_path.exists()
    content = css_path.read_text(encoding="utf-8")
    assert "body.monitor-mode" in content
    assert "background-color: #000000 !important;" in content

def test_monitor_html_has_monitor_mode_class():
    html_path = Path("frontend/monitor.html")
    assert html_path.exists()
    content = html_path.read_text(encoding="utf-8")
    assert "monitor-mode" in content
    assert 'class="system-disconnected monitor-mode"' in content

def test_viewer_js_toggles_monitor_mode():
    js_path = Path("frontend/js/viewer.js")
    assert js_path.exists()
    content = js_path.read_text(encoding="utf-8")
    assert "document.body.classList.add('monitor-mode')" in content
