# Testing Strategy: CHG-017-fix-monitor-multiselect-position

- **Change ID**: `CHG-017-fix-monitor-multiselect-position`
- **Date**: 2026-08-01
- **Status**: APPROVED

## 1. 단위 및 통합 테스트 계획
- `tests/test_monitor_multiselect.py`를 신규 생성하여 다중 선택 좌표 변환 및 `getAbsoluteObjectBounds` 연동 논리를 자동화 테스트.

## 2. 수동 테스트 시나리오
1. 무대 모니터 탭 접속.
2. 🔴 CURRENT 및 🔵 NEXT 박스 두 개를 Shift+클릭 또는 드래그하여 다중 선택(`ActiveSelection`).
3. 두 박스를 같이 위/아래/좌/우로 이동.
4. 미리보기 팝업 및 모니터링 화면(`monitor.html`)에서 두 박스가 겹치지 않고 실제 캔버스 거리 그대로 유지되는지 확인.

## 3. 회귀 테스트 명령어
```bash
$env:PYTHONPATH='.'; .\venv\Scripts\pytest.exe tests/
```
