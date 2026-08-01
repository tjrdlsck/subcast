# Tasks Breakdown: CHG-018-fix-monitor-viewer-aspect-ratio-distance

- **Change ID**: `CHG-018-fix-monitor-viewer-aspect-ratio-distance`
- **Date**: 2026-08-01
- **Status**: APPROVED

## Task List

- [x] **Task 1: `viewer.js` 16:9 Aspect-Fit 스테이지 투영 수식 적용**
  - `renderMonitorViewerLayout()` 내 16:9 가상 스테이지 계산 (`stageW`, `stageH`, `stageLeft`, `stageTop`, `scale`)
  - CURRENT/NEXT 가이드 카드 및 폰트 크기를 16:9 스테이지 기준으로 투영
  - `renderMonitorCustomElements()`의 커스텀 도형/이미지 요소를 16:9 스테이지 기준으로 투영

- [x] **Task 2: 자동화 테스트 작성 및 검증**
  - `tests/test_monitor_aspect_ratio.py` 작성하여 16:9 Aspect Fit 스테이지 계산 로직 검증
  - 전체 pytest 회귀 검증 수행
