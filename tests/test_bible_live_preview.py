import unittest
import os
import re

class TestBibleLivePreviewFix(unittest.TestCase):
    """
    CHG-024: 성경 탭 본문 로드 시 성경 메인 표 뷰어 상단으로 불필요한 검정 미니 미리보기 팝업이 발생하는 버그 수정 검증
    """

    def setUp(self):
        self.js_file_path = os.path.join("frontend", "js", "modules", "editor-bible.js")
        self.css_file_path = os.path.join("frontend", "css", "editor.css")
        
        with open(self.js_file_path, "r", encoding="utf-8") as f:
            self.js_content = f.read()

        with open(self.css_file_path, "r", encoding="utf-8") as f:
            self.css_content = f.read()

    def test_show_bible_live_preview_suppressed_when_main_viewer_active(self):
        """성경 메인 표 뷰어가 활성화(display !== 'none') 상태일 때 실시간 미리보기 팝업 출력을 억제하는 로직 검증"""
        self.assertIn('const viewerOverlay = document.getElementById("bible-main-viewer-overlay");', self.js_content)
        self.assertIn('if (viewerOverlay && window.getComputedStyle(viewerOverlay).display !== "none")', self.js_content)
        
        # showBibleLivePreview 함수 정의 부분 추출 후 조건 확인
        func_match = re.search(r'function showBibleLivePreview\(item\)\s*\{(.*?)\n\s*\}', self.js_content, re.DOTALL)
        self.assertIsNotNone(func_match, "showBibleLivePreview 함수를 찾을 수 없습니다.")
        func_body = func_match.group(1)
        self.assertIn('return;', func_body, "뷰어 오버레이 활성화 시 조기 return 로직이 존재해야 합니다.")

    def test_main_viewer_open_close_cleanup_live_preview(self):
        """showBibleMainViewer 및 hideBibleMainViewer 호출 시 hideBibleLivePreview cleanup이 일어나는지 검증"""
        show_func = re.search(r'function showBibleMainViewer\(results, titleInfo\)\s*\{(.*?)\n\s*\}', self.js_content, re.DOTALL)
        self.assertIsNotNone(show_func, "showBibleMainViewer 함수를 찾을 수 없습니다.")
        self.assertIn('hideBibleLivePreview();', show_func.group(1), "showBibleMainViewer에서 hideBibleLivePreview()를 호출해야 합니다.")

        hide_func = re.search(r'function hideBibleMainViewer\(\)\s*\{(.*?)\n\s*\}', self.js_content, re.DOTALL)
        self.assertIsNotNone(hide_func, "hideBibleMainViewer 함수를 찾을 수 없습니다.")
        self.assertIn('hideBibleLivePreview();', hide_func.group(1), "hideBibleMainViewer에서 hideBibleLivePreview()를 호출해야 합니다.")

    def test_css_bible_preview_overlay_styling(self):
        """editor.css의 .bible-preview-overlay 스타일 개선 검증"""
        self.assertIn('.bible-preview-overlay', self.css_content)
        self.assertIn('background: rgba(18, 18, 24, 0.92);', self.css_content)
        self.assertIn('backdrop-filter: blur(12px);', self.css_content)

if __name__ == "__main__":
    unittest.main()
