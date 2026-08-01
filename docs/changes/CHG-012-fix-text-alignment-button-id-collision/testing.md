# Testing Strategy: CHG-012-fix-text-alignment-button-id-collision

## 1. 검증 전략 (Testing Strategy)

### 1.1 구문 및 회귀 테스트
- `node --check frontend/js/modules/editor-canvas.js` 및 `node --check frontend/js/modules/editor-init.js` 실행.
- `venv\Scripts\python.exe -m pytest tests/ --ignore=tests/test_template_undo.py` 실행 (75개 테스트 PASS 검증).

### 1.2 수동 시나리오 검증
- 텍스트 상자 선택 후 "스타일 및 정렬" 패널에서 L / C / R 버튼 클릭 시 텍스트 상자 자체가 캔버스 상에서 움직이지 않고, 텍스트 상자 내부의 글자 정렬(`textAlign`)만 좌측/중앙/우측으로 정렬되는지 확인.
- "정렬 및 배치" 패널에서 左 좌측 / 右 우측 버튼 클릭 시 캔버스 상에서 요소 위치가 배치 정렬되는지 확인.
