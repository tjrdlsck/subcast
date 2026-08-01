"""
Unit tests for Subcast Editor Monitoring Settings & Scaling logic
"""

import json
import pytest

def sanitize_coord(val_pct, default_pct, max_pct):
    if val_pct is None:
        return default_pct
    try:
        val = float(val_pct)
        return max(0.0, min(float(max_pct), val))
    except (ValueError, TypeError):
        return default_pct

def calculate_effective_font_size(base_font_size, scale_y=1.0):
    return max(10, round(float(base_font_size) * float(scale_y)))

def test_monitoring_settings_schema():
    sample_settings = {
        "layoutMode": "custom_canvas",
        "bibleMode": "summary",
        "currentBox": {
            "leftPct": 5.0,
            "topPct": 5.0,
            "widthPct": 90.0,
            "heightPct": 42.0,
            "fontSize": 28,
            "isTransparentBg": True,
            "textColor": "#FFFFFF",
            "bgColor": "transparent"
        },
        "nextBox": {
            "leftPct": 5.0,
            "topPct": 51.0,
            "widthPct": 90.0,
            "heightPct": 42.0,
            "fontSize": 22,
            "isTransparentBg": False,
            "textColor": "#A0A0A0",
            "bgColor": "#181818"
        }
    }
    
    # Assert JSON serialization works
    serialized = json.dumps(sample_settings)
    loaded = json.loads(serialized)
    
    assert loaded["layoutMode"] == "custom_canvas"
    assert loaded["currentBox"]["fontSize"] == 28
    assert loaded["currentBox"]["isTransparentBg"] is True
    assert loaded["nextBox"]["bgColor"] == "#181818"

def test_coord_sanitization():
    assert sanitize_coord(None, 5, 90) == 5
    assert sanitize_coord(120, 5, 90) == 90
    assert sanitize_coord(-10, 5, 90) == 0
    assert sanitize_coord(45.5, 5, 90) == 45.5

def test_font_size_scaling():
    assert calculate_effective_font_size(24, 1.5) == 36
    assert calculate_effective_font_size(20, 0.5) == 10
    assert calculate_effective_font_size(10, 0.1) == 10  # clamped to min 10
