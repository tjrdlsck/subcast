# Impact Analysis: CHG-002-realtime-monitor-preview

## 1. Scope 정의
- **Allowed Scope**:
  - `frontend/js/modules/editor-monitor.js`
  - `docs/changes/CHG-002-realtime-monitor-preview/`
  - `docs/project-state.md`
- **Protected Scope**:
  - `backend/`
  - `frontend/editor.html`
  - `frontend/js/viewer.js` (기존 BroadcastChannel 리스너 유지)
  - `tests/`
  - `run.py`

## 2. 영향 분석 (Impact & Risk)
- `frontend/js/modules/editor-monitor.js` 내의 `handleGuideModified()` 및 캔버스 이벤트 리스너(`object:moving`, `object:scaling`, `object:modified`)에서 `broadcastMonitorSettings()` 함수를 호출하여 BroadcastChannel 메시지 발송.
- 서버 API 호출 및 LocalStorage 저장은 `saveMonitorSettings()` (저장 버튼 누를 때만) 실행되므로 서버 부하 감소 및 사용자 의도대로 동작.
- 기존 웹소켓/백엔드 모니터링 API와의 사이드이펙트 없음.
