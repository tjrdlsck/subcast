# Tasks Breakdown: CHG-016-stage-monitor-undo-redo

- **Change ID**: `CHG-016-stage-monitor-undo-redo`
- **Date**: 2026-08-01
- **Status**: APPROVED

## Task List

- [x] **Task 1: `editor-monitor.js` 무대 모니터 히스토리 스택 및 Undo/Redo 로직 구현**
  - `monitorUndoStack`, `monitorRedoStack`, `isMonitorUndoingRedoing` 플래그 추가
  - `enterMonitorMode()` 진입 시 초기 스냅샷 기록 및 스택 초기화
  - `saveMonitorStateToHistory()`, `undoMonitor()`, `redoMonitor()`, `applyMonitorSnapshot()` 구현
  - `window.subcastMonitorEditor` 객체에 `undoMonitor`, `redoMonitor` 노출

- [x] **Task 2: `editor-history.js` Undo/Redo 분기 연동**
  - `undo()` 및 `redo()` 함수 실행 시 무대 모니터 모드 여부 확인
  - 무대 모니터 모드일 경우 `window.subcastMonitorEditor.undoMonitor()` / `redoMonitor()` 위임 호출

- [x] **Task 3: 자동화 테스트 작성 및 검증**
  - `tests/test_monitor_undo_redo.py` 신규 작성하여 모니터 모드 전용 undo/redo 로직 모듈형 테스트 수행
  - 기존 슬라이드 undo 테스트 등 회귀 검증 통과 확인
