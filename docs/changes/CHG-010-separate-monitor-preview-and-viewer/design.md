# Change Design: CHG-010-separate-monitor-preview-and-viewer

## 1. 기술적 해결 방안 (Technical Solution)

### 1.1 에디터 미리보기 캔버스 실시간 인터랙션 보장 (`editor-monitor.js`)
- `handleGuideModified` 및 `handleCustomObjectChanged` 이벤트 핸들러에서 에디터 내부 실시간 미리보기를 위해 `syncCanvasToMonitorSettings()` 및 `updateInfoUI()`를 실시간으로 계속 실행하도록 유지.
- 이를 통해 사용자가 캔버스에서 가이드 박스 위치/크기를 움직이거나 속성을 바꿀 때 에디터 화면 안에서는 실시간으로 어떨지 시각적으로 즉시 확인 가능.

### 1.2 모니터링 페이지(송출 뷰어) 전송 분리 (`editor-monitor.js`)
- 외부 뷰어로 전송되는 `broadcastMonitorSettings()`는 캔버스 편집 중에 호출하지 않고, 오직 **"레이아웃 저장" (`btn-save-monitor-layout`)** 버튼을 클릭했을 때 호출되는 `saveMonitorSettings()` 단계에서만 전송.
- 외부 모니터링 페이지는 저장된 레이아웃 데이터만 수신하여 송출 화면 유지.
