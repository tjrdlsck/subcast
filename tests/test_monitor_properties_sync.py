import os
import pytest

def test_editor_history_triggers_monitor_save():
    filepath = os.path.join("frontend", "js", "modules", "editor-history.js")
    assert os.path.exists(filepath)
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    assert "saveMonitorStateToHistory" in content, "saveStateToHistory must delegate to saveMonitorStateToHistory in monitor mode"

def test_editor_monitor_serializes_extended_text_properties():
    filepath = os.path.join("frontend", "js", "modules", "editor-monitor.js")
    assert os.path.exists(filepath)
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    assert "strokeColor" in content
    assert "strokeWidth" in content
    assert "fontStyle" in content
    assert "opacity" in content

def test_viewer_renders_monitor_extended_text_properties():
    filepath = os.path.join("frontend", "js", "viewer.js")
    assert os.path.exists(filepath)
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    assert "webkitTextStroke" in content
    assert "paintOrder" in content
    assert "fontStyle" in content
    assert "opacity" in content
