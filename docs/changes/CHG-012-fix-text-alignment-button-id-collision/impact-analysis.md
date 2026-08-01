# Impact Analysis: CHG-012-fix-text-alignment-button-id-collision

## 1. 영향 범위 (Scope Boundaries)

### Allowed Scope
- `frontend/editor.html` ("정렬 및 배치" 버튼 ID `btn-align-element-left`, `btn-align-element-right`로 변경)
- `frontend/js/modules/editor-canvas.js` (`alignBtnIds` 배열의 ID 갱신)
- `frontend/js/modules/editor-init.js` (캔버스 요소 정렬 버튼 변수 참조 ID 갱신)
- `docs/changes/CHG-012-fix-text-alignment-button-id-collision/*`
- `docs/project-state.md`

### Protected Scope
- `backend/`
- `frontend/js/viewer.js`
- `frontend/js/modules/editor-elements.js`
- `frontend/js/modules/editor-monitor.js`
- `run.py`

## 2. 리스크 및 영향도 평가 (Risk Analysis)
- `btn-align-left`, `btn-align-right` ID 충돌이 해제되므로 "스타일 및 정렬"의 글자 정렬과 "정렬 및 배치"의 캔버스 요소 이동 정렬이 독립적으로 작동함을 검증.
- 텍스트 박스 선택 시 속성 인스펙터 패널에서 글자 정렬 상태(left, center, right) 활성화(`active` 클래스)가 원활히 작동하는지 검증.
