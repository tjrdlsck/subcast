# Testing Strategy: CHG-008-fix-canvas-delete-key-isolation

## 1. 검증 전략 (Testing Strategy)

### 1.1 구문 및 회귀 테스트
- `node --check frontend/js/modules/editor-init.js` 및 `editor-clipboard.js` 실행.
- `venv\Scripts\python.exe -m pytest tests/ --ignore=tests/test_template_undo.py` 실행 (75개 테스트 PASS 검증).

### 1.2 수동 시나리오 검증
- 무대 모니터 탭 활성화 후 캔버스 배경 클릭 상태에서 `Delete` 키 입력 시 슬라이드 삭제 확인 창이 나타나지 않는지 검증.
- 무대 모니터 캔버스에 사각형 요소 추가 후 선택하여 `Delete` 키 입력 시 사각형만 삭제되는지 검증.
