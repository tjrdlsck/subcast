import os
import unittest

class TestStageMonitorGuideBox(unittest.TestCase):
    def setUp(self):
        self.js_file_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "frontend", "js", "modules", "editor-monitor.js"
        )

    def test_dummy_text_and_min_bounds(self):
        """editor-monitor.js가 가변 슬라이드 텍스트에 종속되지 않고 더미 문구 및 최소 규격을 갖는지 검증"""
        self.assertTrue(os.path.exists(self.js_file_path), "editor-monitor.js 파일이 존재해야 합니다.")
        
        with open(self.js_file_path, "r", encoding="utf-8") as f:
            content = f.read()

        # 1. 표준 가이드 더미 문구 포함 여부 검증
        self.assertIn("🔴 [현재 자막 영역]", content, "현재 자막 더미 가이드 텍스트가 정의되어야 합니다.")
        self.assertIn("🔵 [다음 자막 영역]", content, "다음 자막 더미 가이드 텍스트가 정의되어야 합니다.")
        self.assertIn("여기에 현재 슬라이드 자막이 표시됩니다.", content, "가이드 상세 안내 문구가 정의되어야 합니다.")

        # 2. Fabric Textbox 최소 크기(minWidth, minHeight) 보장 검증
        self.assertIn("minWidth: 150", content, "가이드 텍스트박스에 minWidth 설정이 포함되어야 합니다.")
        self.assertIn("minHeight: 50", content, "가이드 텍스트박스에 minHeight 설정이 포함되어야 합니다.")

if __name__ == "__main__":
    unittest.main()
