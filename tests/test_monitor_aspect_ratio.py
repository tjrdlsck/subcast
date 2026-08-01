import os
import pytest

def test_calculate_stage_bounds_formula():
    """16:9 Aspect Ratio Fit 스테이지 계산 로직 검증"""
    def calculate_stage_bounds(window_w, window_h):
        target_ratio = 16 / 9
        window_ratio = window_w / window_h
        if window_ratio > target_ratio:
            stage_h = window_h
            stage_w = stage_h * target_ratio
            stage_left = (window_w - stage_w) / 2
            stage_top = 0.0
        else:
            stage_w = window_w
            stage_h = stage_w / target_ratio
            stage_left = 0.0
            stage_top = (window_h - stage_h) / 2
        scale = stage_w / 768.0
        return stage_w, stage_h, stage_left, stage_top, scale

    # 1. 1920 x 1080 (Exact 16:9)
    sw, sh, sl, st, scale = calculate_stage_bounds(1920, 1080)
    assert pytest.approx(sw) == 1920.0
    assert pytest.approx(sh) == 1080.0
    assert pytest.approx(sl) == 0.0
    assert pytest.approx(st) == 0.0
    assert pytest.approx(scale) == 2.5

    # 2. 1920 x 1200 (16:10 - 더 높은 화면, 상하 Letterbox 발생)
    sw, sh, sl, st, scale = calculate_stage_bounds(1920, 1200)
    assert pytest.approx(sw) == 1920.0
    assert pytest.approx(sh) == 1080.0
    assert pytest.approx(sl) == 0.0
    assert pytest.approx(st) == 60.0  # (1200 - 1080) / 2
    assert pytest.approx(scale) == 2.5

    # 3. 2560 x 1080 (21:9 - 더 넓은 화면, 좌우 Pillarbox 발생)
    sw, sh, sl, st, scale = calculate_stage_bounds(2560, 1080)
    assert pytest.approx(sw) == 1920.0
    assert pytest.approx(sh) == 1080.0
    assert pytest.approx(sl) == 320.0  # (2560 - 1920) / 2
    assert pytest.approx(st) == 0.0
    assert pytest.approx(scale) == 2.5

def test_viewer_js_contains_aspect_fit_logic():
    """frontend/js/viewer.js 파일 내 calculateStageBounds 및 stageLeft/stageTop 배치 연동 검증"""
    filepath = os.path.join("frontend", "js", "viewer.js")
    assert os.path.exists(filepath), f"File missing: {filepath}"

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    assert "function calculateStageBounds" in content, "calculateStageBounds function missing in viewer.js"
    assert "(cur.leftPct / 100) * 768" in content
    assert "(cur.topPct / 100) * 432" in content
    assert "(nxt.leftPct / 100) * 768" in content
