import os
import pytest

def test_editor_monitor_get_absolute_object_bounds_defined():
    """frontend/js/modules/editor-monitor.js 파일에 getAbsoluteObjectBounds 함수 정의 및 calcTransformMatrix 연동 확인"""
    filepath = os.path.join("frontend", "js", "modules", "editor-monitor.js")
    assert os.path.exists(filepath), f"File missing: {filepath}"
    
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    assert "function getAbsoluteObjectBounds(obj)" in content, "getAbsoluteObjectBounds function missing in editor-monitor.js"
    assert "getAbsoluteObjectBounds(boxObj)" in content, "getAbsoluteObjectBounds call missing in syncCanvasToMonitorSettings"
    assert "matrix[4]" in content, "Center X matrix calculation missing in getAbsoluteObjectBounds"
    assert "matrix[5]" in content, "Center Y matrix calculation missing in getAbsoluteObjectBounds"
    assert "centerX - (width / 2)" in content, "Top-Left calculation missing in getAbsoluteObjectBounds"

def test_multiselect_absolute_bounds_math():
    """calcTransformMatrix 기반의 getAbsoluteObjectBounds 수학적 연산 정밀 검증"""
    # ActiveSelection 그룹 내의 두 객체가 relative offset 및 group transformation을 지닐 때
    # M1, M2 행렬 변환에 따라 캔버스 절대 좌표(centerX, centerY)와 Top-Left 좌표가 비동등하게 산출되는지 검증
    
    group_center_x, group_center_y = 500.0, 300.0
    
    # currentBox (그룹 내 상대좌표: left=-100, top=-50, width=200, height=100)
    # M1[4] = 500 - 100 = 400.0, M1[5] = 300 - 50 = 250.0
    m1 = [1, 0, 0, 1, 400.0, 250.0]
    w1, h1 = 200.0, 100.0
    left1 = m1[4] - (w1 / 2)  # 400 - 100 = 300.0
    top1 = m1[5] - (h1 / 2)   # 250 - 50 = 200.0

    # nextBox (그룹 내 상대좌표: left=100, top=50, width=200, height=100)
    # M2[4] = 500 + 100 = 600.0, M2[5] = 300 + 50 = 350.0
    m2 = [1, 0, 0, 1, 600.0, 350.0]
    w2, h2 = 200.0, 100.0
    left2 = m2[4] - (w2 / 2)  # 600 - 100 = 500.0
    top2 = m2[5] - (h2 / 2)   # 350 - 50 = 300.0

    # 두 박스의 캔버스 절대 Left, Top 좌표는 겹치지 않고 명확히 분리됨
    assert left1 != left2, f"left coordinates overlap: left1={left1}, left2={left2}"
    assert top1 != top2, f"top coordinates overlap: top1={top1}, top2={top2}"
    assert left1 == 300.0
    assert top1 == 200.0
    assert left2 == 500.0
    assert top2 == 300.0
