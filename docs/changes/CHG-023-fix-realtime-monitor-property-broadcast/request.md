# Change Request: CHG-023-fix-realtime-monitor-property-broadcast

## 요청 정보
- **요청자**: 사용자
- **작성일**: 2026-08-01
- **상태**: PROPOSED

## 요청 내용
무대 모니터 탭에서 텍스트 색상, 테두리 색상, 두께 등의 속성을 변경하였을 때 요소를 움직이지 않더라도 변경 즉시(oninput 시점) 실시간 미리보기에 100% 실시간 반영되도록 동기화 조작 수정.

## 현상 및 원인
1. **현상**: 색상을 변경한 직후에는 미리보기가 안 바뀌다가 캔버스 상의 요소를 클릭하고 마우스로 움직여야 비로소 변경된 색상이 미리보기에 나타남.
2. **원인**:
   - `editor-monitor.js`의 `saveMonitorStateToHistory()` 함수가 `syncCanvasToMonitorSettings()`만 수행하고 실시간 브로드캐스트 함수인 `broadcastMonitorPreviewSettings()`를 호출하지 않음.
   - 캔버스 요소를 드래그하여 움직일 때(`handleGuideMoving`)에만 `broadcastMonitorPreviewSettings()`가 호출되어 드래그 시점에만 미리보기가 갱신됨.

## 해결 방향
1. `editor-monitor.js`: `saveMonitorStateToHistory()` 내부에서 `updateInfoUI()` 및 `broadcastMonitorPreviewSettings()`를 함께 호출하도록 개선.
2. `editor-init.js`: 색상 픽커(`oninput`), 테두리 두께(`oninput`), 글꼴/크기/정렬 조작 시 무대 모니터 모드이면 즉시 `syncCanvasToMonitorSettings()` 및 `broadcastMonitorPreviewSettings()`를 실시간 호출하도록 보장.
