# Impact Analysis: CHG-019-fix-monitor-multiselect-position

## 1. Allowed & Protected Scope Boundary

### Allowed Scope (수정 허용 범위)
- `frontend/js/modules/editor-monitor.js` (`getAbsoluteObjectBounds` 함수 연산 수정)
- `tests/test_monitor_multiselect.py` (다중 선택 이동 및 위치 계산 테스트 검증)
- `docs/changes/CHG-019-fix-monitor-multiselect-position/*`
- `docs/project-state.md`

### Protected Scope (수정 금지 범위)
- `backend/`
- `frontend/editor.html`
- `frontend/monitor.html`
- `frontend/js/viewer.js`
- `frontend/js/modules/editor-canvas.js`
- `frontend/js/modules/editor-slides.js`
- `run.py`
- 기타 시스템 주요 모듈

## 2. 영향도 분석 (Impact Assessment)
- **기존 기능 영향**:
  - `editor-monitor.js` 내의 `getAbsoluteObjectBounds` 연산 방식 개선으로, 단일 선택 시 동작은 100% 하위 호환 유지됨.
  - 무대 모니터 가이드 박스 다중 선택 이동 시 실시간 미리보기 및 BroadcastChannel/WebSocket 전송 데이터 정확도 향상.
- **부작용 가능성**:
  - 없음. `getAbsoluteObjectBounds`는 `editor-monitor.js` 전용 내부 헬퍼 함수이며, `calcTransformMatrix()` 기반의 정리된 절대 좌표 계산 수식을 사용하여 사이드 이펙트가 전혀 없음.
