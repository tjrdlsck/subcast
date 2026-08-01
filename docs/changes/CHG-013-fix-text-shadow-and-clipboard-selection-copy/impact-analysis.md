# Impact Analysis: CHG-013-fix-text-shadow-and-clipboard-selection-copy

## 1. 영향 범위 (Scope Boundaries)

### Allowed Scope
- `frontend/js/modules/editor-init.js` (그림자 컨트롤 이벤트 등록 및 Ctrl+C/X 선택 텍스트 우회 처리)
- `frontend/js/modules/editor-history.js` (그림자 속성 직렬화/역직렬화 지원)
- `frontend/js/presenter.js` (그림자 속성 역직렬화 지원)
- `frontend/js/viewer.js` (그림자 속성 역직렬화 지원)
- `docs/changes/CHG-013-fix-text-shadow-and-clipboard-selection-copy/*`
- `docs/project-state.md`

### Protected Scope
- `backend/`
- `frontend/editor.html`
- `frontend/js/modules/editor-elements.js`
- `frontend/js/modules/editor-monitor.js`
- `run.py`

## 2. 리스크 및 영향도 평가 (Risk Analysis)
- `window.getSelection()`이 활성화되어 있을 때 단축키 감지에서 이탈하여 기존 캔버스/슬라이드 복사 기능이 예기치 않게 가로채지 않는지 검증.
- 그림자 효과 설정 변경 시 캔버스 렌더링 및 Undo/Redo 히스토리에 정상 반영되는지 검증.
