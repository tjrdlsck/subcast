# Impact Analysis: CHG-004-editor-fontsize-and-minimize-fix

## 1. Scope 정의
- **Allowed Scope**:
  - `frontend/css/editor.css`
  - `frontend/js/modules/editor-init.js`
  - `docs/changes/CHG-004-editor-fontsize-and-minimize-fix/`
  - `docs/project-state.md`
- **Protected Scope**:
  - `backend/`
  - `frontend/editor.html`
  - `tests/`
  - `run.py`

## 2. 영향 분석 (Impact & Risk)
- **텍스트 박스 고정**: `fontSize` 대입 시 `width = width * scaleX` 계산 후 `scaleX: 1, scaleY: 1` 설정으로 가로 크기가 왜곡되거나 변하지 않음.
- **패널 접기 방어**: `.right-inspector-panel.collapsed { display: none !important; }`를 적용해 캔버스 이벤트에서 `display = "flex"`가 호출되어도 접힘 상태 안정성 유지.
