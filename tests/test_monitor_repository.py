import pytest
from backend.monitor_repository import (
    MonitorSettingsRepository,
    get_monitor_settings,
    update_monitor_settings,
    validate_monitor_settings,
    validate_box_settings
)

def test_repository_get_default_settings(tmp_path):
    db_file = str(tmp_path / "test_repo.db")
    repo = MonitorSettingsRepository(db_file)
    
    settings = repo.get_settings("default_profile")
    assert settings is not None
    assert settings["settingId"] == "default_profile"
    assert settings["layoutMode"] == "custom_canvas"
    assert settings["currentBox"]["leftPct"] == 5.0
    assert settings["currentBox"]["fontSize"] == 28
    assert settings["currentBox"]["isTransparentBg"] is True
    assert settings["nextBox"]["topPct"] == 51.0

def test_repository_get_nonexistent(tmp_path):
    db_file = str(tmp_path / "test_repo.db")
    repo = MonitorSettingsRepository(db_file)
    settings = repo.get_settings("non_existent_profile")
    assert settings is None

def test_repository_update_settings(tmp_path):
    db_file = str(tmp_path / "test_repo.db")
    repo = MonitorSettingsRepository(db_file)
    
    update_data = {
        "layoutMode": "split_horizontal",
        "currentBox": {
            "leftPct": 10.0,
            "topPct": 5.0,
            "widthPct": 80.0,
            "heightPct": 40.0,
            "fontSize": 32,
            "textColor": "#FFFF00",
            "bgColor": "rgba(0,0,0,0.5)",
            "isTransparentBg": False
        },
        "nextBox": {
            "leftPct": 10.0,
            "topPct": 50.0,
            "widthPct": 80.0,
            "heightPct": 40.0,
            "fontSize": 24,
            "textColor": "#CCCCCC",
            "bgColor": "transparent",
            "isTransparentBg": True
        }
    }
    
    updated = repo.update_settings(update_data, "default_profile")
    assert updated["layoutMode"] == "split_horizontal"
    assert updated["currentBox"]["leftPct"] == 10.0
    assert updated["currentBox"]["fontSize"] == 32
    assert updated["currentBox"]["isTransparentBg"] is False
    assert updated["nextBox"]["topPct"] == 50.0

def test_repository_helper_functions(tmp_path):
    db_file = str(tmp_path / "test_helper.db")
    
    settings = get_monitor_settings(db_file)
    assert settings["settingId"] == "default_profile"
    
    update_data = {
        "currentBox": {
            "leftPct": 15.0,
            "topPct": 10.0,
            "widthPct": 70.0,
            "heightPct": 30.0,
            "fontSize": 40,
            "textColor": "#FFFFFF",
            "bgColor": "transparent",
            "isTransparentBg": True
        }
    }
    updated = update_monitor_settings(update_data, db_file)
    assert updated["currentBox"]["leftPct"] == 15.0
    assert updated["currentBox"]["fontSize"] == 40

def test_validation_bounds_and_range():
    # leftPct range error
    with pytest.raises(ValueError, match="leftPct must be between 0 and 100"):
        validate_box_settings("currentBox", {"leftPct": -5.0, "topPct": 5.0, "widthPct": 50.0, "heightPct": 50.0, "fontSize": 20})

    # topPct range error
    with pytest.raises(ValueError, match="topPct must be between 0 and 100"):
        validate_box_settings("currentBox", {"leftPct": 5.0, "topPct": 105.0, "widthPct": 50.0, "heightPct": 50.0, "fontSize": 20})

    # widthPct range error
    with pytest.raises(ValueError, match="widthPct must be between 0 and 100"):
        validate_box_settings("currentBox", {"leftPct": 5.0, "topPct": 5.0, "widthPct": -10.0, "heightPct": 50.0, "fontSize": 20})

    # heightPct range error
    with pytest.raises(ValueError, match="heightPct must be between 0 and 100"):
        validate_box_settings("currentBox", {"leftPct": 5.0, "topPct": 5.0, "widthPct": 50.0, "heightPct": 120.0, "fontSize": 20})

    # leftPct + widthPct > 100%
    with pytest.raises(ValueError, match="leftPct \\+ widthPct must not exceed 100%"):
        validate_box_settings("currentBox", {"leftPct": 60.0, "topPct": 5.0, "widthPct": 50.0, "heightPct": 40.0, "fontSize": 20})

    # topPct + heightPct > 100%
    with pytest.raises(ValueError, match="topPct \\+ heightPct must not exceed 100%"):
        validate_box_settings("currentBox", {"leftPct": 5.0, "topPct": 60.0, "widthPct": 50.0, "heightPct": 50.0, "fontSize": 20})

    # fontSize < 10
    with pytest.raises(ValueError, match="fontSize must be between 10 and 200"):
        validate_box_settings("currentBox", {"leftPct": 5.0, "topPct": 5.0, "widthPct": 50.0, "heightPct": 40.0, "fontSize": 5})

    # fontSize > 200
    with pytest.raises(ValueError, match="fontSize must be between 10 and 200"):
        validate_box_settings("currentBox", {"leftPct": 5.0, "topPct": 5.0, "widthPct": 50.0, "heightPct": 40.0, "fontSize": 250})

def test_validate_monitor_settings_wrapper():
    # valid settings
    validate_monitor_settings({
        "currentBox": {"leftPct": 5.0, "topPct": 5.0, "widthPct": 90.0, "heightPct": 40.0, "fontSize": 28},
        "nextBox": {"leftPct": 5.0, "topPct": 50.0, "widthPct": 90.0, "heightPct": 40.0, "fontSize": 22}
    })
