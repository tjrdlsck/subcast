# Tasks Breakdown: CHG-029-fix-monitor-text-clip-and-auto-fit

## Task 목록

- [ ] **Task 1: CSS 및 HTML 모니터 텍스트 카드 안심 패딩 및 line-height 1.5 적용**
  - `frontend/css/viewer.css`, `frontend/monitor.html`, `frontend/viewer.html`에 `line-height: 1.5`, `padding-bottom: 8px`, `margin: auto 0`, `box-sizing: content-box` 적용.

- [ ] **Task 2: `viewer.js` 렌더링 스타일 보완**
  - `renderMonitorViewerLayout` 및 `updateMonitorViewerTexts` 내 인라인 스타일을 `line-height: 1.5`, `padding-bottom: 8px`, `box-sizing: content-box`로 업데이트.

- [ ] **Task 3: 단위 및 전체 회귀 테스트 실행**
  - `tests/test_monitor_text_clip_autofit.py` 작성 및 전체 109+ 개 테스트 통과 확인.
