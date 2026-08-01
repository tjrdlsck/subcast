# Impact Analysis: CHG-017-fix-monitor-multiselect-position

- **Change ID**: `CHG-017-fix-monitor-multiselect-position`
- **Date**: 2026-08-01
- **Status**: APPROVED

## 1. 변경 범위 (Scope)

### Allowed Scope
- `frontend/js/modules/editor-monitor.js`: `getAbsoluteObjectBounds` 절대 좌표 도출 헬퍼 추가 및 `syncCanvasToMonitorSettings()` 수정
- `docs/changes/CHG-017-fix-monitor-multiselect-position/`
- `docs/project-state.md`

### Protected Scope
- `backend/`
- `frontend/monitor.html`
- `frontend/viewer.html`
- `frontend/js/modules/editor-history.js`
- `run.py`
- 기타 지정되지 않은 모든 모듈

## 2. 잠재적 영향 및 위험 요소
- **Fabric.js Group 스케일 연동**: ActiveSelection 조작 중 `group.scaleX`나 `group.scaleY`가 적용될 때 개별 객체의 matrix 변환 계산이 누락되지 않도록 `getBoundingRect(true, true)` 및 `calcTransformMatrix()`의 조합 검증 필요.
- **가이드 박스 스케일 정규화**: 스케일 조작 후 `width` 및 `scaleX=1, scaleY=1` 정규화 시 ActiveSelection 상태를 교란시키지 않도록 absolute 계산된 값만 `monitorSettings`에 반영.

## 3. 검증 계획
- 단일 객체 선택 시 좌표 계산 일치 확인.
- 다중 객체 선택(ActiveSelection) 드래그 및 스케일 변경 시 미리보기/모니터 화면 좌표 일치 확인.
- 테스트 코드 `tests/test_monitor_multiselect.py` 작성 및 실행.
