# Technical Design: CHG-023-fix-realtime-monitor-property-broadcast

## 1. 개요 및 목적
무대 모니터 탭에서 속성 설정(글자 색상, 테두리 색상, 두께, 폰트 스타일 등) 조작 시 요소를 이동하지 않더라도 입력/변경 즉시(`oninput`) 실시간 미리보기 화면으로 즉각 브로드캐스트 전송되도록 수정함.

## 2. 세부 설계 (Technical Detail)

### A. `editor-monitor.js` `saveMonitorStateToHistory()` 수정
- `saveMonitorStateToHistory()`:
  ```javascript
  function saveMonitorStateToHistory() {
      if (!isMonitorMode || isMonitorUndoingRedoing) return;
      syncCanvasToMonitorSettings();
      updateInfoUI();
      broadcastMonitorPreviewSettings();
      const snapshotStr = JSON.stringify(monitorSettings);
      if (monitorUndoStack.length > 0 && monitorUndoStack[monitorUndoStack.length - 1] === snapshotStr) {
          return;
      }
      monitorUndoStack.push(snapshotStr);
      monitorRedoStack = [];
  }
  ```
- `saveMonitorStateToHistory()` 내부에서 `updateInfoUI()`와 `broadcastMonitorPreviewSettings()`를 호출하게 함으로써, 속성 변경 저장 시점에 요소를 움직이지 않아도 즉시 미리보기에 반영됨.

### B. `editor-init.js` 실시간 속성 변경 함수 브로드캐스트 보장
- `updateTextStrokeColor()`, `text-strokewidth` `oninput` 등 속성 실시간 조작 시:
  ```javascript
  if (window.subcastMonitorEditor && window.subcastMonitorEditor.isMonitorMode && window.subcastMonitorEditor.isMonitorMode()) {
      if (typeof window.subcastMonitorEditor.syncCanvasToMonitorSettings === 'function') {
          window.subcastMonitorEditor.syncCanvasToMonitorSettings();
      }
      if (typeof window.subcastMonitorEditor.broadcastMonitorPreviewSettings === 'function') {
          window.subcastMonitorEditor.broadcastMonitorPreviewSettings();
      }
  }
  ```
- 색상 픽커 슬라이더를 드래그하거나 투명도를 변경할 때 `oninput` 시점에 매 프레임 실시간으로 미리보기 창에 색상 변화가 반영됨.

## 3. 검증 계획
- `tests/test_monitor_realtime_property_broadcast.py` 정적 및 로직 테스트 작성:
  - `saveMonitorStateToHistory` 내 `broadcastMonitorPreviewSettings` 호출 여부 검증
  - `editor-init.js` 내 실시간 모니터 브로드캐스트 연동 여부 검증
