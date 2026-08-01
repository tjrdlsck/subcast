# Tasks Breakdown: CHG-017-fix-monitor-multiselect-position

- **Change ID**: `CHG-017-fix-monitor-multiselect-position`
- **Date**: 2026-08-01
- **Status**: APPROVED

## Task List

- [x] **Task 1: `editor-monitor.js` 절대 좌표 계산 헬퍼 구현 및 동기화 함수 수정**
  - `getAbsoluteObjectBounds` 구현하여 Fabric.js ActiveSelection 유무와 독립적인 absolute left/top/width/height 반환
  - `syncCanvasToMonitorSettings()`에서 `getAbsoluteObjectBounds` 사용하도록 수정

- [x] **Task 2: 자동화 테스트 작성 및 검증**
  - `tests/test_monitor_multiselect.py` 작성하여 ActiveSelection 상태 좌표 동기화 검증
  - 전체 pytest 회귀 검증 실행
