import os
import pytest
import re

def test_editor_monitor_undo_redo_functions_exist():
    """frontend/js/modules/editor-monitor.js 파일에 undoMonitor, redoMonitor, saveMonitorStateToHistory 정의 확인"""
    filepath = os.path.join("frontend", "js", "modules", "editor-monitor.js")
    assert os.path.exists(filepath), f"File missing: {filepath}"
    
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    assert "function undoMonitor()" in content, "undoMonitor function missing in editor-monitor.js"
    assert "function redoMonitor()" in content, "redoMonitor function missing in editor-monitor.js"
    assert "function saveMonitorStateToHistory()" in content, "saveMonitorStateToHistory missing in editor-monitor.js"
    assert "undoMonitor" in content, "undoMonitor not exported in subcastMonitorEditor"
    assert "redoMonitor" in content, "redoMonitor not exported in subcastMonitorEditor"

def test_editor_history_delegates_to_monitor():
    """frontend/js/modules/editor-history.js 파일의 undo, redo 함수에 모니터 모드 위임 분기 존재 확인"""
    filepath = os.path.join("frontend", "js", "modules", "editor-history.js")
    assert os.path.exists(filepath), f"File missing: {filepath}"

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    assert "subcastMonitorEditor.undoMonitor" in content, "subcastMonitorEditor.undoMonitor call missing in editor-history.js"
    assert "subcastMonitorEditor.redoMonitor" in content, "subcastMonitorEditor.redoMonitor call missing in editor-history.js"

def test_editor_monitor_events_trigger_history():
    """editor-monitor.js의 캔버스 modification/addition/deletion 이벤트 핸들러에서 saveMonitorStateToHistory 호출 확인"""
    filepath = os.path.join("frontend", "js", "modules", "editor-monitor.js")
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    assert "saveMonitorStateToHistory()" in content, "saveMonitorStateToHistory call missing in canvas handlers"
    assert "canvas.on('object:modified', handleGuideModified)" in content, "object:modified listener missing"
