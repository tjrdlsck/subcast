# Testing Strategy: CHG-030-fix-monitor-second-line-truncation

## 1. 검증 대상
- 무대 모니터링 화면(`monitor.html`, `viewer.html`) 및 에디터 미리보기(`pip-monitor-iframe`)에서 2줄 이상 텍스트 렌더링 시 잘림 여부.

## 2. 검증 방법
- `pytest tests/test_monitor_text_clip_autofit.py` 실행하여 텍스트 스타일 규칙(`line-height: 1.28`, `max-height: 100%`) 수신 검증.
