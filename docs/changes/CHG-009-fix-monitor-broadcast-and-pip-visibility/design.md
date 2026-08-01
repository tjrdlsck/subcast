# Change Design: CHG-009-fix-monitor-broadcast-and-pip-visibility

## 1. 기술적 해결 방안 (Technical Solution)

### 1.1 무대 모니터 이벤트 수정 (`editor-monitor.js`)
- `handleGuideModified` 및 `handleCustomObjectChanged` 함수 내에서 `broadcastMonitorSettings()` 호출 제거.
- 객체 이동/조작 시 `updateInfoUI()` 및 `syncCanvasToMonitorSettings()`만 유지하고, 실제 Broadcast는 "레이아웃 저장" (`btn-save-monitor-layout`) 클릭 시에만 발생.

### 1.2 현장 배경 뷰어 숨김 처리 수정 (`editor-stage-bg.js`)
- `hideStageBgMainViewer()` 함수 내부에서 `pip-stage-preview-container` 모달 요소를 찾아 `style.display = 'none'` 처리 추가.
  ```javascript
  function hideStageBgMainViewer() {
      const overlay = document.getElementById('stage-bg-main-viewer-overlay');
      if (overlay) overlay.style.display = 'none';
      const pipContainer = document.getElementById('pip-stage-preview-container');
      if (pipContainer) pipContainer.style.display = 'none';
  }
  ```
