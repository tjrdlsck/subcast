# Testing Strategy: CHG-010-separate-monitor-preview-and-viewer

## 1. 검증 전략 (Testing Strategy)

### 1.1 구문 및 회귀 테스트
- `node --check frontend/js/modules/editor-monitor.js` 실행.
- `venv\Scripts\python.exe -m pytest tests/ --ignore=tests/test_template_undo.py` 실행 (75개 테스트 PASS 검증).

### 1.2 수동 시나리오 검증
- 무대 모니터 탭 캔버스에서 가이드 위치/크기를 움직였을 때 에디터 미리보기 캔버스 및 수치 UI가 즉각 실시간으로 변경되어 어떨지 확인되는지 검증.
- 저장을 누르기 전에는 외부 송출 뷰어 페이지로 화면 데이터가 방송(Broadcast)되지 않고, "레이아웃 저장"을 눌렀을 때만 외부 송출 뷰어 페이지로 전달되는지 검증.
