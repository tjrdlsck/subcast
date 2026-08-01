# Tasks Breakdown: CHG-028-fix-editor-monitor-text-resize-and-line-height

## Task 목록

- [ ] **Task 1: `editor-monitor.js` 텍스트 박스 리사이즈 동기화 로직 보정**
  - 드래그 진행 중(`scaling`, `resizing`, `moving`)과 드래그 종료(`modified`) 시점의 정규화 분리.
  - `object:resizing` 이벤트 바인딩 추가.

- [ ] **Task 2: 모니터 텍스트 line-height 및 하단 패딩 적용**
  - `frontend/css/viewer.css`, `frontend/monitor.html`, `frontend/viewer.html`, `frontend/js/viewer.js`에 `line-height: 1.4` 및 `padding-bottom: 4px` 적용.

- [ ] **Task 3: 단위 및 전체 회귀 테스트 실행**
  - `tests/test_editor_monitor_resize_and_line_height.py` 작성 및 전체 테스트 통과 확인.
