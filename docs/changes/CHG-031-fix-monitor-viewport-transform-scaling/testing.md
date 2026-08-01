# Testing Strategy: CHG-031-fix-monitor-viewport-transform-scaling

## 1. 검증 대상
- 무대 모니터링 화면(`monitor.html`, `viewer.html`) 및 미리보기 iframe(`pip-monitor-iframe`)에서 `#monitor-stage-wrapper` 및 `transform: scale()` 적용 여부.

## 2. 검증 방법
- `pytest tests/test_monitor_transform_scaling.py` 실행.
- 전체 unit test suite 통과 확인.
