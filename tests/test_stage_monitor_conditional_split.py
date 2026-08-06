import os
import unittest

class TestStageMonitorConditionalSplit(unittest.TestCase):
    def setUp(self):
        self.base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.viewer_js_path = os.path.join(self.base_dir, "frontend", "js", "viewer.js")
        self.praise_js_path = os.path.join(self.base_dir, "frontend", "js", "modules", "editor-praise.js")
        self.slides_js_path = os.path.join(self.base_dir, "frontend", "js", "modules", "editor-slides.js")

    def test_praise_slide_flags_in_editor_praise(self):
        """editor-praise.js에서 찬양 슬라이드 생성 시 slideType: 'praise' 및 isPraise: true 부여 검증"""
        self.assertTrue(os.path.exists(self.praise_js_path))
        with open(self.praise_js_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("slideType: 'praise'", content, "editor-praise.js에 slideType: 'praise' 속성이 명시되어야 합니다.")
        self.assertIn("isPraise: true", content, "editor-praise.js에 isPraise: true 속성이 명시되어야 합니다.")

    def test_viewer_js_conditional_split_logic(self):
        """viewer.js에서 찬양 슬라이드인 경우 2분할, 그 외 슬라이드는 1분할(nxtCard 숨김) 조건부 분기 검증"""
        self.assertTrue(os.path.exists(self.viewer_js_path))
        with open(self.viewer_js_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("function isPraiseSlide", content, "viewer.js에 isPraiseSlide 헬퍼 함수가 존재해야 합니다.")
        self.assertIn("nxtCard.style.display = \"none\"", content, "성경/일반 슬라이드 시 하단 분할 카드를 숨기는 분기가 존재해야 합니다.")
        self.assertIn("nxtCard.style.display = \"flex\"", content, "찬양 슬라이드 시 하단 2분할 카드를 노출하는 분기가 존재해야 합니다.")

    def test_editor_slides_payload_includes_ispraise(self):
        """editor-slides.js에서 BroadcastChannel 페이로드에 isPraise가 포함되는지 검증"""
        self.assertTrue(os.path.exists(self.slides_js_path))
        with open(self.slides_js_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("isPraise: isPraise", content, "editor-slides.js의 SLIDE_CHANGE 메시지에 isPraise 필드가 포함되어야 합니다.")

if __name__ == "__main__":
    unittest.main()
