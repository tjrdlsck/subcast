# Impact Analysis: CHG-021-fix-monitor-properties-sync-and-rendering

## 1. 영향 범위 분석 (Impact Analysis)

### Changed System Modules
- `frontend/js/modules/editor-history.js`: `saveStateToHistory()` 호출 시 무대 모니터 모드 분기 처리 및 `saveMonitorStateToHistory()` 연동.
- `frontend/js/modules/editor-monitor.js`: `syncCanvasToMonitorSettings()`, `enterMonitorMode()`, `applyMonitorSnapshot()`에서 `strokeColor`, `strokeWidth`, `fontStyle`, `opacity` 등 전체 속성 직렬화/복원 보장.
- `frontend/js/viewer.js`: `renderMonitorViewerLayout()`에서 CURRENT / NEXT 텍스트 박스의 테두리(`-webkit-text-stroke`), `paint-order`, `fontStyle`, `opacity` CSS 적용.

### Scope Boundaries
- **Allowed Scope**:
  - `frontend/js/modules/editor-history.js`
  - `frontend/js/modules/editor-monitor.js`
  - `frontend/js/viewer.js`
  - `tests/test_monitor_properties_sync.py`
  - `docs/changes/CHG-021-fix-monitor-properties-sync-and-rendering/`
  - `docs/project-state.md`
- **Protected Scope**:
  - `backend/`
  - `frontend/editor.html`
  - `frontend/monitor.html`
  - `frontend/presenter.html`
  - `frontend/viewer.html`
  - `frontend/js/presenter.js`
  - `frontend/js/modules/editor-canvas.js`
  - `frontend/js/modules/editor-elements.js`
  - 기타 지정되지 않은 소스 파일

## 2. 회귀 위험도 (Regression Risks)
- 기존 무대 모니터 레이아웃 저장/불러오기 데이터 포맷과의 하위 호환성 유지를 위해 기존 필드가 없거나 `undefined`인 경우 기본값(`transparent`, `0`, `normal`, `1.0`)으로 폴백하도록 처리하므로 회귀 위험 없음.
