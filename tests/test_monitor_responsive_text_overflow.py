import os
import unittest


def read_frontend(path):
    with open(path, "r", encoding="utf-8") as file:
        return file.read()


class TestMonitorResponsiveTextOverflow(unittest.TestCase):
    def test_viewer_css_constrains_monitor_text_to_card(self):
        content = read_frontend(os.path.join("frontend", "css", "viewer.css"))

        self.assertIn(".monitor-card", content)
        self.assertIn("overflow: hidden !important;", content)
        self.assertIn("line-height: 1.35;", content)
        self.assertIn("padding: 0.15em 0.2em;", content)
        self.assertIn("display: block;", content)
        self.assertNotIn("-webkit-line-clamp: 4", content)

    def test_monitor_pages_initialize_bounded_cards_and_text(self):
        for page in ("frontend/monitor.html", "frontend/viewer.html"):
            content = read_frontend(page)
            self.assertIn('id="monitor-current-card"', content)
            self.assertIn('id="monitor-next-card"', content)
            self.assertIn('overflow: hidden;', content)
            self.assertIn('line-height: 1.35;', content)
            self.assertNotIn('-webkit-line-clamp: 4;', content)

    def test_viewer_js_keeps_layout_and_text_updates_bounded(self):
        content = read_frontend(os.path.join("frontend", "js", "viewer.js"))

        self.assertIn("function fitMonitorText", content)
        self.assertIn("function applyMonitorTextBounds", content)
        self.assertIn("curCard", content)
        self.assertIn("nxtCard", content)
        self.assertNotIn('webkitLineClamp = "4"', content)


if __name__ == "__main__":
    unittest.main()
