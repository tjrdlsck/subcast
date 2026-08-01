# Testing Strategy: CHG-013-fix-text-shadow-and-clipboard-selection-copy

## 1. 검증 전략 (Testing Strategy)

### 1.1 구문 및 회귀 테스트
- `node --check frontend/js/modules/editor-init.js` 및 `node --check frontend/js/modules/editor-history.js` 실행.
- `venv\Scripts\python.exe -m pytest tests/ --ignore=tests/test_template_undo.py` 실행 (75개 테스트 PASS 검증).

### 1.2 수동 시나리오 검증
- 텍스트 요소 선택 후 "글자 그림자 효과 적용" 체크박스 선택 시 캔버스 텍스트 뒤에 그림자가 즉시 나타나고, 블러/이동 X/이동 Y 수치 조절 시 실시간 반영되는지 확인.
- 속성 설정 패널의 텍스트를 마우스로 드래그 선택한 후 Ctrl+C 누르고 다른 곳에 붙여넣었을 때 HTML/JSON 코드 대신 선택한 텍스트 문장만 깔끔하게 붙여넣어지는지 확인.
