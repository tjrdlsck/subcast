import os
import pytest
from backend.database import init_monitor_db, get_db_connection
from backend.monitor_repository import get_monitor_settings, update_monitor_settings

def test_monitor_db_schema_has_extended_columns(tmp_path):
    test_db = str(tmp_path / "test_monitor.db")
    init_monitor_db(test_db)
    
    conn = get_db_connection(test_db)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(monitor_settings)")
    columns = [row[1] for row in cursor.fetchall()]
    conn.close()
    
    expected_cols = [
        "current_stroke_color", "current_stroke_width", "current_font_style", "current_opacity",
        "next_stroke_color", "next_stroke_width", "next_font_style", "next_opacity"
    ]
    for col in expected_cols:
        assert col in columns, f"Column {col} missing in monitor_settings table"

def test_monitor_repository_persists_extended_text_properties(tmp_path):
    test_db = str(tmp_path / "test_monitor.db")
    init_monitor_db(test_db)
    
    payload = {
        "layoutMode": "custom_canvas",
        "currentBox": {
            "leftPct": 10.0,
            "topPct": 10.0,
            "widthPct": 80.0,
            "heightPct": 30.0,
            "fontSize": 32,
            "textColor": "#FF0000",
            "strokeColor": "#00FF00",
            "strokeWidth": 4,
            "fontWeight": "bold",
            "fontStyle": "italic",
            "fontFamily": "Roboto",
            "textAlign": "left",
            "opacity": 0.8
        },
        "nextBox": {
            "leftPct": 10.0,
            "topPct": 50.0,
            "widthPct": 80.0,
            "heightPct": 30.0,
            "fontSize": 24,
            "textColor": "#0000FF",
            "strokeColor": "#FFFF00",
            "strokeWidth": 2,
            "fontWeight": "normal",
            "fontStyle": "normal",
            "fontFamily": "Arial",
            "textAlign": "right",
            "opacity": 0.9
        }
    }
    
    updated = update_monitor_settings(payload, db_path=test_db)
    assert updated is not None
    assert updated["currentBox"]["strokeColor"] == "#00FF00"
    assert updated["currentBox"]["strokeWidth"] == 4
    assert updated["currentBox"]["fontStyle"] == "italic"
    assert updated["currentBox"]["opacity"] == 0.8
    
    assert updated["nextBox"]["strokeColor"] == "#FFFF00"
    assert updated["nextBox"]["strokeWidth"] == 2
    assert updated["nextBox"]["fontStyle"] == "normal"
    assert updated["nextBox"]["opacity"] == 0.9
    
    # Reload from DB and verify persistence
    loaded = get_monitor_settings(db_path=test_db)
    assert loaded["currentBox"]["strokeColor"] == "#00FF00"
    assert loaded["currentBox"]["strokeWidth"] == 4
    assert loaded["currentBox"]["fontStyle"] == "italic"
    assert loaded["currentBox"]["opacity"] == 0.8
    assert loaded["nextBox"]["strokeColor"] == "#FFFF00"
    assert loaded["nextBox"]["strokeWidth"] == 2
