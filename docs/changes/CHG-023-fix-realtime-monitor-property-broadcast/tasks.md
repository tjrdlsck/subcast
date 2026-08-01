# Tasks Breakdown: CHG-023-fix-realtime-monitor-property-broadcast

## Task 1: `editor-monitor.js` saveMonitorStateToHistory 브로드캐스트 전송 추가
- [x] `editor-monitor.js`: `saveMonitorStateToHistory()`에 `updateInfoUI()` 및 `broadcastMonitorPreviewSettings()` 호출 추가

## Task 2: `editor-init.js` 실시간 속성 변경 oninput 방송 연동
- [x] `editor-init.js`: `updateTextStrokeColor`, `text-strokewidth` `oninput` 등 속성 조작 함수에 무대 모니터 실시간 브로드캐스트 보장

## Task 3: 회귀 테스트 작성 및 종합 검증
- [x] `tests/test_monitor_realtime_property_broadcast.py` 작성 및 테스트 구동 (21개 전원 통과)
- [x] `docs/project-state.md` 갱신
