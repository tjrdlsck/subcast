# Impact Analysis: CHG-006-fix-btn-delete-null-reference-crash

## 1. Scope 정의
- **Allowed Scope**:
  - `frontend/js/modules/editor-canvas.js`
  - `frontend/js/modules/editor-init.js`
  - `docs/changes/CHG-006-fix-btn-delete-null-reference-crash/`
  - `docs/project-state.md`
- **Protected Scope**:
  - `backend/`
  - `frontend/editor.html`
  - `tests/`
  - `run.py`

## 2. 영향 분석 (Impact & Risk)
- Null 가드 처리로 개체 선택 및 초기화 시 런타임 자바스크립트 예외 복원.
- 속성 설정 창 정상 표시 회복.
