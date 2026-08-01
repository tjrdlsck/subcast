# Tasks Breakdown: CHG-009-fix-monitor-broadcast-and-pip-visibility

## Task List

- [x] **Task 1**: `frontend/js/modules/editor-monitor.js` 에서 캔버스 수정 이벤트 중 `broadcastMonitorSettings()` 실시간 호출 제거 (저장 버튼 클릭 시만 방송)
- [x] **Task 2**: `frontend/js/modules/editor-stage-bg.js` 의 `hideStageBgMainViewer()` 함수에 `pip-stage-preview-container` 숨김 처리 추가
- [x] **Task 3**: 구문 검증(`node --check`) 및 pytest 스위트 회귀 테스트 진행
