from pathlib import Path


def test_monitor_pages_initialize_bounded_cards_and_text() -> None:
    for page in ("frontend/monitor.html", "frontend/viewer.html"):
        content = Path(page).read_text(encoding="utf-8")
        assert 'id="monitor-current-card"' in content
        assert 'id="monitor-next-card"' in content
        assert 'overflow: hidden;' in content
        assert 'line-height: 1.35;' in content
        assert '-webkit-line-clamp: 4;' not in content
