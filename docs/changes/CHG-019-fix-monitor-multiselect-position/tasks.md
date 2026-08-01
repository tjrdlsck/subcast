# Tasks Breakdown: CHG-019-fix-monitor-multiselect-position

## Task List

- [x] **Task 1: `editor-monitor.js`의 `getAbsoluteObjectBounds` 연산 개선**
  - `frontend/js/modules/editor-monitor.js`에서 `obj.group` 존재 시 `calcTransformMatrix()` 기반의 절대 좌상단 좌표(`left`, `top`) 및 정밀 `width`, `height` 도출 로직으로 변경 완료.
- [x] **Task 2: 테스트 및 회귀 검증**
  - `tests/test_monitor_multiselect.py` 작성 및 실행.
  - 다중 선택 드래그 위치 동기화 및 26개 모니터 테스트 전체 통과 확인.
