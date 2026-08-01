# Impact Analysis: CHG-031-fix-monitor-viewport-transform-scaling

## 1. 영향 범위 (Scope)

### Allowed Scope
- `frontend/css/viewer.css`
- `frontend/monitor.html`
- `frontend/viewer.html`
- `frontend/js/viewer.js`
- `tests/test_monitor_transform_scaling.py`
- `docs/changes/CHG-031-fix-monitor-viewport-transform-scaling/`
- `docs/project-state.md`

### Protected Scope
- `backend/`
- `frontend/editor.html`
- `frontend/presenter.html`
- `frontend/js/presenter.js`
- `frontend/js/modules/editor-*.js`

## 2. 부작용 및 위험 요소 (Risk Analysis)
- `transform: scale()` 적용 시 뷰포트 중앙 정렬 (`transform-origin: center center` 또는 `top left` + offset) 위치 계산 정확도 보장 필요.
- 창 크기 변경 이벤트 (`resize`) 시 스테이지 scale 값이 부드럽게 재계산되도록 리스너 조율.

## 3. 회귀 테스트 및 검증 계획
- `tests/test_monitor_transform_scaling.py` 테스트 케이스 생성 및 기존 test suite 검증.
