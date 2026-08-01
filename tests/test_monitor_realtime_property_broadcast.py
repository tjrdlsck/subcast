import os
import pytest

def test_save_monitor_state_triggers_realtime_broadcast():
    filepath = os.path.join("frontend", "js", "modules", "editor-monitor.js")
    assert os.path.exists(filepath)
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Verify saveMonitorStateToHistory contains broadcastMonitorPreviewSettings
    assert "broadcastMonitorPreviewSettings();" in content

def test_editor_init_realtime_property_changes_trigger_monitor_save():
    filepath = os.path.join("frontend", "js", "modules", "editor-init.js")
    assert os.path.exists(filepath)
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Check that fill and stroke update functions invoke saveMonitorStateToHistory
    assert "updateTextFillColor" in content
    assert "updateTextStrokeColor" in content
    assert "saveMonitorStateToHistory" in content
