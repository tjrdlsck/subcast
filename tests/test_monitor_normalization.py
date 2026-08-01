import pytest

def normalize_coordinates(left, top, width, height, base_w=1920, base_h=1080):
    """Fabric.js 캔버스 절대 좌표 -> 상대 비율 좌표 정규화 공식"""
    def clamp(val, min_v, max_v):
        return max(min_v, min(max_v, val))

    left_pct = clamp((left / base_w) * 100.0, 0.0, 95.0)
    top_pct = clamp((top / base_h) * 100.0, 0.0, 95.0)
    width_pct = clamp((width / base_w) * 100.0, 5.0, 100.0 - left_pct)
    height_pct = clamp((height / base_h) * 100.0, 5.0, 100.0 - top_pct)

    return {
        "leftPct": round(left_pct, 2),
        "topPct": round(top_pct, 2),
        "widthPct": round(width_pct, 2),
        "heightPct": round(height_pct, 2)
    }

def denormalize_coordinates(left_pct, top_pct, width_pct, height_pct, screen_w=1920, screen_h=1080):
    """상대 비율 좌표 -> 무대 디스플레이 절대 좌표 역정규화 공식"""
    return {
        "left": screen_w * (left_pct / 100.0),
        "top": screen_h * (top_pct / 100.0),
        "width": screen_w * (width_pct / 100.0),
        "height": screen_h * (height_pct / 100.0)
    }

def test_normalization_standard_values():
    norm = normalize_coordinates(96, 54, 1728, 453.6, 1920, 1080)
    assert norm["leftPct"] == 5.0
    assert norm["topPct"] == 5.0
    assert norm["widthPct"] == 90.0
    assert norm["heightPct"] == 42.0

def test_normalization_out_of_bounds_clamping():
    norm = normalize_coordinates(-100, -50, 2500, 1500, 1920, 1080)
    assert norm["leftPct"] == 0.0
    assert norm["topPct"] == 0.0
    assert norm["widthPct"] == 100.0
    assert norm["heightPct"] == 100.0

def test_denormalize_rendering_scaling():
    # 4K resolution (3840 x 2160) denormalization
    denorm = denormalize_coordinates(5.0, 50.0, 90.0, 40.0, 3840, 2160)
    assert denorm["left"] == 192.0
    assert denorm["top"] == 1080.0
    assert denorm["width"] == 3456.0
    assert denorm["height"] == 864.0
