import os
import re
import pytest

def test_editor_elements_has_paint_first_stroke():
    filepath = os.path.join("frontend", "js", "modules", "editor-elements.js")
    assert os.path.exists(filepath)
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    assert "paintFirst: 'stroke'" in content or 'paintFirst: "stroke"' in content

def test_editor_monitor_has_paint_first_stroke():
    filepath = os.path.join("frontend", "js", "modules", "editor-monitor.js")
    assert os.path.exists(filepath)
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Check that currentGuideBox and nextGuideBox have paintFirst: 'stroke'
    matches = re.findall(r"paintFirst:\s*['\"]stroke['\"]", content)
    assert len(matches) >= 2, "editor-monitor.js must set paintFirst: 'stroke' for guide boxes"

def test_editor_init_has_stroke_handlers_and_paint_first():
    filepath = os.path.join("frontend", "js", "modules", "editor-init.js")
    assert os.path.exists(filepath)
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    assert "text-strokewidth" in content
    assert "paintFirst: 'stroke'" in content or 'paintFirst: "stroke"' in content
