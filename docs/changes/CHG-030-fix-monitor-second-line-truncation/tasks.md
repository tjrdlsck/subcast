# Tasks Breakdown: CHG-030-fix-monitor-second-line-truncation

## Task List

- [ ] **Task 1: CSS 및 JS 인라인 스타일 수직 제약 보정**
  - `frontend/css/viewer.css` 내 `.monitor-card` 및 `#monitor-current-text`, `#monitor-next-text`에 `line-height: 1.28`, `max-height: 100%`, `padding: 2px 0` 적용.
  - `frontend/js/viewer.js` 내 `renderMonitorViewerLayout` 인라인 스타일 동기화.
  - `frontend/monitor.html`, `frontend/viewer.html` 내 인라인 스타일 동기화.

- [ ] **Task 2: 자동 테스트 및 회귀 검증**
  - `tests/test_monitor_text_clip_autofit.py` 수정 및 pytest 실행으로 검증.
