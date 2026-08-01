# Testing Strategy: CHG-009-fix-monitor-broadcast-and-pip-visibility

## 1. 검증 전략 (Testing Strategy)

### 1.1 구문 및 회귀 테스트
- `node --check frontend/js/modules/editor-monitor.js` 및 `editor-stage-bg.js` 실행.
- `venv\Scripts\python.exe -m pytest tests/ --ignore=tests/test_template_undo.py` 실행 (75개 테스트 PASS 검증).

### 1.2 수동 시나리오 검증
- 무대 모니터 탭에서 캔버스 가이드 박스를 이동/조작할 때 저장 전에는 외부 방송이 안 되고, "레이아웃 저장" 버튼 클릭 시에만 방송되는지 검증.
- 현장 배경 탭 진입 후 타 탭(무대 모니터 등)으로 이동 시 PiP 모달이 말끔히 숨겨지고, 다시 현장 배경 탭 진입 시 나타나는지 검증.
