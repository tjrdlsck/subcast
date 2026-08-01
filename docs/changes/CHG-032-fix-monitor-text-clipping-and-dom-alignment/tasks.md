# Tasks Breakdown: CHG-032-fix-monitor-text-clipping-and-dom-alignment

## 단위 작업 목록

- [ ] **Task 1: CSS 및 HTML 인라인 스타일 클리핑 해제 및 패딩 구조 정문화**
  - `frontend/css/viewer.css`, `frontend/monitor.html`, `frontend/viewer.html` 내 `#monitor-current-text`, `#monitor-next-text`에 `display: block`, `overflow: visible`, `max-height: none`, `-webkit-line-clamp: unset`, `line-height: 1.20`, `padding: 0` 반영.
  - `.monitor-card`에 `overflow: visible`, `padding: 4px 8px` 부여.

- [ ] **Task 2: `viewer.js` 및 `editor-monitor.js` 렌더링 스타일 및 lineHeight 동기화**
  - `frontend/js/viewer.js` `renderMonitorViewerLayout()`의 `curText` / `nxtText` 인라인 스타일 동기화.
  - `frontend/js/modules/editor-monitor.js` 가이드 텍스트박스 `lineHeight: 1.20` 동기화.

- [ ] **Task 3: 단위 테스트 작성 및 기존 검증 스위트 회귀 검증**
  - `tests/test_monitor_text_clipping_and_alignment.py` 신규 작성 및 실행.
  - 기존 113개 모니터링/에디터 테스트 통과 확인.
