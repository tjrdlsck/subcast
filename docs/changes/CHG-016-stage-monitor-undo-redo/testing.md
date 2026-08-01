# Testing Strategy: CHG-016-stage-monitor-undo-redo

- **Change ID**: `CHG-016-stage-monitor-undo-redo`
- **Date**: 2026-08-01
- **Status**: APPROVED

## 1. 단위 및 통합 테스트 계획
- `tests/test_monitor_undo_redo.py`를 신규 생성하여 무대 모니터 모드의 히스토리 스택 관리, Undo 및 Redo 상태 전이, 캔버스 재구성 스냅샷 복원이 정상적으로 일치하는지 검증.

## 2. 수동 테스트 시나리오
1. 에디터 접속 후 좌측 탭에서 `무대 모니터` 선택 (`enterMonitorMode()`).
2. 🔴 CURRENT 가이드 박스를 드래그하여 이동 또는 크기 변경.
3. `Ctrl+Z` 입력 -> 가이드 박스가 변경 전 위치/크기로 복원되는지 확인.
4. `Ctrl+Shift+Z` 입력 -> 가이드 박스가 다시 변경 후 위치/크기로 이동하는지 확인.
5. 도형(사각형/원 등) 추가 -> `Ctrl+Z` 누를 시 도형 삭제됨 확인 -> `Ctrl+Shift+Z` 누를 시 도형 재출현 확인.
6. 슬라이드 탭으로 복귀 시 슬라이드 캔버스의 Undo/Redo 기능에 영향이 없는지 확인.

## 3. 회귀 테스트 명령어
```bash
pytest tests/
```
