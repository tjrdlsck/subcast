# Tasks Breakdown: CHG-037-fix-monitor-textbox-height-resizing

## 태스크 목록

### Task 1: 가이드 박스 수직 리사이즈 및 `heightPct` 계산 로직 교정
- **목적**: 캔버스 상에서 세로 핸들 조작 시 `actualH` 및 `heightPct`가 정확히 증가/감소하고 `scaleY: 1` 초기화 시에도 수축되지 않도록 수정.
- **대상 파일**: `frontend/js/modules/editor-monitor.js`
- **세부 작업**:
  - `syncCanvasToMonitorSettings` 내 `updateBox` 함수 수정:
    - `scaleY` 조작 비율을 감지하여 `actualH = boxObj.height * scaleY` 기반으로 `heightPct`를 올바르게 계산.
    - `boxObj.set({ scaleX: 1, scaleY: 1 })` 시 `heightPct`가 텍스트 높이로 원상복구되는 방지 조치 적용.

### Task 2: 1줄 및 빈 슬라이드 텍스트 자동 수축 방지
- **목적**: 슬라이드 텍스트 렌더링 시 내용 길이에 맞춰 `heightPct`가 자동으로 쪼그라들지 않도록 독립적 고정 영역 보장.
- **대상 파일**: `frontend/js/modules/editor-monitor.js`
- **세부 작업**:
  - `enterMonitorMode`에서 기존 저장된 `currentBox.heightPct` 및 `nextBox.heightPct`를 가이드 박스 영역 높이로 확실하게 적용.

### Task 3: 자동/수동 회귀 검증
- **목적**: 변경 사항이 모니터 에디터 및 방송 뷰어에 올바르게 적용되고 기존 테스트를 통과하는지 검증.
- **대상 파일**: `tests/test_monitor_responsive_text_overflow.py`, `tests/test_monitor_api.py` 등
- **세부 작업**:
  - pytest를 통한 모니터 백엔드/프론트엔드 관련 테스트 실행 및 0 failure 통과 확인.
