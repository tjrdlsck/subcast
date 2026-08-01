# Tasks Breakdown: CHG-021-fix-monitor-properties-sync-and-rendering

## Task 1: `editor-history.js` saveStateToHistory 무대 모니터 트리거 연결
- [x] `editor-history.js`: `isMonitorMode()`일 때 `saveMonitorStateToHistory()` 호출하도록 수정

## Task 2: `editor-monitor.js` 텍스트 속성 직렬화/복원 확장
- [x] `syncCanvasToMonitorSettings`: `strokeColor`, `strokeWidth`, `fontStyle`, `opacity` 포함
- [x] `enterMonitorMode` 및 `applyMonitorSnapshot`: `currentGuideBox` 및 `nextGuideBox` 생성 옵션에 `stroke`, `strokeWidth`, `fontStyle`, `opacity` 반영

## Task 3: `viewer.js` 모니터링 뷰어 CSS 렌더링 확장
- [x] `renderMonitorViewerLayout`: `-webkit-text-stroke`, `paint-order`, `fontStyle`, `opacity` CSS 파이프라인 추가

## Task 4: 종합 테스트 작성 및 검증
- [x] `tests/test_monitor_properties_sync.py` 작성 및 파이썬 테스트 실행 (17개 관련 테스트 전원 통과)
- [x] `docs/project-state.md` 갱신
