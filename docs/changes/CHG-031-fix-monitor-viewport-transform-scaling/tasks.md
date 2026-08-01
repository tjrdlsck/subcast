# Tasks Breakdown: CHG-031-fix-monitor-viewport-transform-scaling

## Task List

- [ ] **Task 1: HTML DOM 구조에 `#monitor-stage-wrapper` 스테이지 감싸기 적용**
  - `frontend/monitor.html` 및 `frontend/viewer.html` 내 768px x 432px 고정 스테이지 래퍼 추가.

- [ ] **Task 2: `frontend/js/viewer.js` Transform Scale 통합 연산 적용**
  - `renderMonitorViewerLayout()` 및 `calculateStageBounds()`를 768x432 100% 해상도 + `transform: translate(-50%, -50%) scale(...)` 방식으로 개편.

- [ ] **Task 3: 자동 테스트 및 전체 테스트 검증**
  - `tests/test_monitor_transform_scaling.py` 작성 및 전체 테스트 스위트 실행.
