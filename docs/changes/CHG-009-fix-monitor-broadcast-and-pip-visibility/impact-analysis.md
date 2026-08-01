# Impact Analysis: CHG-009-fix-monitor-broadcast-and-pip-visibility

## 1. 영향 범위 (Scope Boundaries)

### Allowed Scope
- `frontend/js/modules/editor-monitor.js`
- `frontend/js/modules/editor-stage-bg.js`
- `docs/changes/CHG-009-fix-monitor-broadcast-and-pip-visibility/*`
- `docs/project-state.md`

### Protected Scope
- `backend/`
- `frontend/editor.html`
- `frontend/js/modules/editor-elements.js`
- `frontend/js/modules/editor-init.js`
- `frontend/js/modules/editor-clipboard.js`
- `tests/`
- `run.py`

## 2. 리스크 및 영향도 평가 (Risk Analysis)
- 무대 모니터 저장 버튼 클릭 시 기존 저장 및 방송 기능이 누락되지 않도록 검증 필요.
- 현장 배경 탭으로 다시 진입했을 때 PiP 모달이 정상적으로 다시 보여지는지 검증 필요.
