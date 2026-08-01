# Impact Analysis: CHG-010-separate-monitor-preview-and-viewer

## 1. 영향 범위 (Scope Boundaries)

### Allowed Scope
- `frontend/js/modules/editor-monitor.js`
- `docs/changes/CHG-010-separate-monitor-preview-and-viewer/*`
- `docs/project-state.md`

### Protected Scope
- `backend/`
- `frontend/editor.html`
- `frontend/js/viewer.js`
- `frontend/js/modules/editor-elements.js`
- `frontend/js/modules/editor-init.js`
- `tests/`
- `run.py`

## 2. 리스크 및 영향도 평가 (Risk Analysis)
- 에디터 미리보기 캔버스의 실시간 조작 인터랙션(드래그, 리사이즈, UI 텍스트 정보 표시)이 원활히 지속되어야 함.
- 외부 방송 메시지(`broadcastMonitorSettings`)가 "레이아웃 저장" 시점에만 정확히 1회 전송되어 송출 페이지가 오염되지 않도록 검증.
