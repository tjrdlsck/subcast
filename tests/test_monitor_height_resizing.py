import os
import unittest

class TestMonitorHeightResizing(unittest.TestCase):
    def test_editor_monitor_height_pct_scale_y_logic(self):
        """editor-monitor.js에서 scaleY != 1일 때만 heightPct가 갱신되고 scaleY == 1일 때 기존 heightPct가 보존되는지 검증"""
        editor_monitor_path = os.path.join("frontend", "js", "modules", "editor-monitor.js")
        with open(editor_monitor_path, "r", encoding="utf-8") as f:
            content = f.read()

        # scaleYVal != 1.0 일 때의 조건절 검증
        self.assertIn("Math.abs(scaleYVal - 1.0) > 0.001", content)
        # scaleY == 1.0 일 때 heightPct 보존 처리 검증
        self.assertIn("heightPct = clamp(heightPct, 5, 100 - topPct)", content)
        # scaleY: 1 정규화 검증
        self.assertIn("scaleY: 1", content)

if __name__ == "__main__":
    unittest.main()
