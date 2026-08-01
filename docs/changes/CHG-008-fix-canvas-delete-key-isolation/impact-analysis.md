# Impact Analysis: CHG-008-fix-canvas-delete-key-isolation

## 1. 영향 범위 (Scope Boundaries)

### Allowed Scope
- `frontend/js/modules/editor-init.js`
- `frontend/js/modules/editor-clipboard.js`
- `docs/changes/CHG-008-fix-canvas-delete-key-isolation/*`
- `docs/project-state.md`

### Protected Scope
- `backend/`
- `frontend/editor.html`
- `frontend/js/modules/editor-elements.js`
- `frontend/js/modules/editor-monitor.js`
- `tests/`
- `run.py`

## 2. 리스크 및 영향도 평가 (Risk Analysis)
- 일반 슬라이드 편집 모드에서 좌측 썸네일로 선택된 슬라이드를 `Delete` 키로 삭제하는 기능은 유지되어야 함.
- 무대 모니터 탭/모드 구분을 통해 무대 모니터 작업 중 슬라이드가 삭제되는 회귀 버그 방지.
