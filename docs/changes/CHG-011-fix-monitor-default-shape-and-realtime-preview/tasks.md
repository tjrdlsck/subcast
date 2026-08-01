# Tasks Breakdown: CHG-011-fix-monitor-default-shape-and-realtime-preview

## Task List

- [x] **Task 1**: DB(`GAE_Bible.db`)의 `custom_elements` 오염 데이터 제거 및 `tests/test_monitor_custom_elements.py` cleanup 추가
- [x] **Task 2**: `frontend/editor.html`, `frontend/js/modules/editor-monitor.js`, `frontend/js/viewer.js` 에 실시간 PIP 미리보기(`channel=preview`) 및 외부 송출(`channel=monitor`) 분리 로직 반영
- [x] **Task 3**: 구문 검증 및 pytest 스위트 회귀 테스트 진행
