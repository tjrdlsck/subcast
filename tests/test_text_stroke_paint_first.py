from pathlib import Path


def test_editor_elements_has_paint_first_stroke() -> None:
    content = Path("frontend/js/modules/editor-elements.js").read_text(encoding="utf-8")
    assert "paintFirst: 'stroke'" in content or 'paintFirst: "stroke"' in content


def test_editor_init_has_stroke_handlers_and_paint_first() -> None:
    content = Path("frontend/js/modules/editor-init.js").read_text(encoding="utf-8")
    assert "text-strokewidth" in content
    assert "paintFirst: 'stroke'" in content or 'paintFirst: "stroke"' in content
