# Testing Strategy: CHG-023-fix-realtime-monitor-property-broadcast

## 1. 자동화 테스트 계획
- `tests/test_monitor_realtime_property_broadcast.py`
  - `saveMonitorStateToHistory` 내 `broadcastMonitorPreviewSettings()` 포함 여부 검증
  - `editor-init.js` 속성 조작 시 모니터 실시간 브로드캐스트 호출 포함 여부 검증

## 2. 수동 검증 계획
- 무대 모니터 탭 클릭 후 텍스트 상자 선택
- 요소를 마우스로 드래그하여 움직이지 않은 상태에서 색상 픽커로 글자 색상/테두리 색상 변경
- 색상이 바뀌는 순간 요소를 움직이지 않아도 미리보기 창에 즉각 색상이 변경되어 나타나는지 확인
