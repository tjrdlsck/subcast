# Impact Analysis: CHG-028-fix-editor-monitor-text-resize-and-line-height

## 1. 영향 범위 (Impact Scope)
- **에디터 무대 모니터 탭 캔버스 조작**: `frontend/js/modules/editor-monitor.js`
- **모니터링 텍스트 카드 스타일 및 렌더링**: `frontend/css/viewer.css`, `frontend/monitor.html`, `frontend/viewer.html`, `frontend/js/viewer.js`

## 2. Allowed Scope vs Protected Scope

### Allowed Scope (허용 범위)
- `frontend/js/modules/editor-monitor.js`
- `frontend/css/viewer.css`
- `frontend/monitor.html`
- `frontend/viewer.html`
- `frontend/js/viewer.js`
- `tests/test_editor_monitor_resize_and_line_height.py` (신규 테스트)
- `docs/changes/CHG-028-fix-editor-monitor-text-resize-and-line-height/`
- `docs/project-state.md`

### Protected Scope (보호 범위)
- `backend/`
- `frontend/editor.html`
- `frontend/presenter.html`
- `frontend/js/presenter.js`
- `frontend/js/modules/editor-slides.js` 등 타 에디터 모듈

## 3. 부작용 및 회귀 위험 (Side Effects & Risks)
- 드래그 완료 시점(`object:modified`)에 스케일 정규화(`scaleX: 1`, `scaleY: 1`)가 정상 동작하는지 확인하여 폰트 크기 및 너비 정보 보존.
- `line-height` 상향 조정 시 카드 높이 내 전체 줄 수가 안정적으로 조절되는지 확인.
