# Impact Analysis: CHG-023-fix-realtime-monitor-property-broadcast

## 1. 영향 범위 분석 (Impact Analysis)

### Changed System Modules
- `frontend/js/modules/editor-monitor.js`: `saveMonitorStateToHistory()` 내 `broadcastMonitorPreviewSettings()` 및 `updateInfoUI()` 호출 추가.
- `frontend/js/modules/editor-init.js`: `updateTextStrokeColor`, `text-strokewidth` `oninput` 등 속성 변경 조작 시 무대 모니터 실시간 미리보기 방송 연동.

### Scope Boundaries
- **Allowed Scope**:
  - `frontend/js/modules/editor-monitor.js`
  - `frontend/js/modules/editor-init.js`
  - `tests/test_monitor_realtime_property_broadcast.py`
  - `docs/changes/CHG-023-fix-realtime-monitor-property-broadcast/`
  - `docs/project-state.md`
- **Protected Scope**:
  - `backend/`
  - `frontend/editor.html`
  - `frontend/monitor.html`
  - `frontend/presenter.html`
  - `frontend/viewer.html`
  - `frontend/js/viewer.js`
  - `frontend/js/presenter.js`
  - `frontend/js/modules/editor-canvas.js`
  - 기타 지정되지 않은 소스 파일

## 2. 회귀 위험도 (Regression Risks)
- 기존 마우스 드래그 이동/스케일 시 방송 로직은 그대로 유지되며, 속성 변경 패널 입력 시 방송 호출만 추가되므로 회귀 위험 없음.
