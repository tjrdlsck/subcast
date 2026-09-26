import re
from pathlib import Path


def test_editor_slide_select_no_monitor_broadcast() -> None:
    content = Path("frontend/js/modules/editor-slides.js").read_text(encoding="utf-8")
    select_slide_match = re.search(r'function selectSlideForEdit\([^\)]*\)\s*\{([\s\S]*?)\n\s*\}', content)
    assert select_slide_match is not None, "selectSlideForEdit function not found"
    assert "notifyMonitorSlideChange" not in select_slide_match.group(1)
