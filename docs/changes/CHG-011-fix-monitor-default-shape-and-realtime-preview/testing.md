# Testing Strategy: CHG-011-fix-monitor-default-shape-and-realtime-preview

## 1. 검증 전략 (Testing Strategy)

### 1.1 구문 및 회귀 테스트
- `node --check frontend/js/modules/editor-monitor.js` 및 `node --check frontend/js/viewer.js` 구문 점검.
- `venv\Scripts\python.exe -m pytest tests/ --ignore=tests/test_template_undo.py` 실행 (전체 테스트 PASS 검증).

### 1.2 기능 검증
- 무대 모니터 탭 진입 시 원형(circle) 도형이 자동으로 생성되거나 나타나지 않는지 확인.
- 무대 모니터 탭 캔버스에서 가이드 박스를 드래그/리사이즈할 때 저장 버튼을 누르지 않아도 `pip-monitor-preview-box` (PIP iframe)에 움직임이 즉각 반영되는지 확인.
- `http://127.0.0.1:8000/static/monitor.html?channel=monitor` 페이지에서는 캔버스 드래그 중인 미완성 상태가 나오지 않고, "레이아웃 저장" 버튼을 눌렀을 때만 변경되는지 확인.
