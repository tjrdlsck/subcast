# Technical Design: CHG-002-realtime-monitor-preview

## 1. 변경 대상
- `frontend/js/modules/editor-monitor.js`

## 2. 세부 설계
1. **`broadcastMonitorSettings()` 헬퍼 함수 추가**:
   ```javascript
   function broadcastMonitorSettings() {
       if (window.BroadcastChannel) {
           try {
               const bc = new BroadcastChannel("subcast_monitor_channel");
               bc.postMessage({ type: "MONITOR_LAYOUT_UPDATE", settings: monitorSettings });
               bc.close();
           } catch (e) {
               console.error("Failed to post message to BroadcastChannel", e);
           }
       }
   }
   ```
2. **`handleGuideModified()` 연동**:
   캔버스에서 가이드 박스 이동/크기조절 시:
   ```javascript
   function handleGuideModified(e) {
       const target = e.target;
       if (!target || !target.isMonitorGuide || !target.boxType) return;
       syncCanvasToMonitorSettings();
       broadcastMonitorSettings();
   }
   ```
3. **이벤트 리스너 확장**:
   `object:moving`, `object:scaling`, `object:modified` 시 실시간 발송.
4. **저장 버튼 이벤트**:
   `saveMonitorSettings()`는 API 저장 + LocalStorage 저장 + BroadcastChannel 발송을 최종 확정.
