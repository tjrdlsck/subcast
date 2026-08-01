# Impact Analysis: CHG-001-remove-monitor-guide-ui

## 1. Scope 정의
- **Allowed Scope**:
  - `frontend/editor.html`
  - `docs/changes/CHG-001-remove-monitor-guide-ui/`
  - `docs/project-state.md`
- **Protected Scope**:
  - `backend/`
  - `frontend/js/` (기존 logic 유지)
  - `tests/`
  - `run.py`

## 2. 영향 분석 (Impact & Risk)
- `frontend/editor.html`에서 불필요한 가이드/좌표 안내 `<div>` 3개 제거.
- `frontend/js/modules/editor-monitor.js` 275라인에서 `document.getElementById("monitor-layout-info")`를 조회하나, `if (infoEl)` 처리되어 있어 요소 삭제 시에도 자바스크립트 예외 발생하지 않음.
- 기능적 부작용 및 회귀(Regression) 위험도 매우 낮음.
