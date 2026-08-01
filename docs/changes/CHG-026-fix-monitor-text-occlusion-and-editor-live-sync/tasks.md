# Tasks Breakdown: CHG-026-fix-monitor-text-occlusion-and-editor-live-sync

## 1. 구현 태스크 목록

- [x] **Task 1: 모니터 뷰어 및 캔버스 z-index 레이어링 구조 개선**
  - `frontend/monitor.html` 및 `frontend/js/viewer.js` 수정: `#monitor-current-card`, `#monitor-next-card`에 `z-index: 10` 설정, `#monitor-custom-elements-layer`에 `z-index: 1` 설정.
  - `frontend/js/modules/editor-monitor.js` 수정: 캔버스 가이드 박스 Z-Order 유지 (`bringToFront()`).

- [x] **Task 2: 에디터 슬라이드 선택 시 모니터 동기화 전송 로직 제거**
  - `frontend/js/modules/editor-slides.js` 수정: `selectSlideForEdit()` 내 `notifyMonitorSlideChange()` 호출 제거.

- [x] **Task 3: 단위 및 회귀 테스트 작성 및 검증**
  - `tests/test_monitor_text_occlusion_and_live_sync.py` 생성 및 자동화 테스트 실행 (전원 통과).
