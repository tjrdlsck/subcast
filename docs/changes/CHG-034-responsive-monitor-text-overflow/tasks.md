# Tasks Breakdown: CHG-034-responsive-monitor-text-overflow

## Task List

- [x] **Task 1: 모니터 카드 및 텍스트 CSS 오버플로우 경계 수정** (`frontend/css/viewer.css`)
  - 카드와 텍스트가 박스 밖으로 확장되지 않도록 overflow 정책을 정리한다.
  - 텍스트 너비·높이 제한, 줄바꿈, 말줄임 속성을 공통 규칙으로 적용한다.

- [x] **Task 2: 모니터 HTML 초기 스타일 동기화** (`frontend/monitor.html`, `frontend/viewer.html`)
  - Current/Next 카드와 텍스트의 초기 스타일을 CSS 정책과 일치시킨다.
  - 기존 카드 구조와 시각적 스타일은 유지한다.

- [x] **Task 3: JavaScript 레이아웃·텍스트 렌더링 정책 통합** (`frontend/js/viewer.js`)
  - `renderMonitorViewerLayout()`의 overflow visible/unset 설정을 제거 또는 교체한다.
  - `updateMonitorViewerTexts()`와 레이아웃 렌더링의 텍스트 제약을 일관되게 만든다.

- [ ] **Task 4: 회귀 테스트 작성 및 실행** (`tests/test_monitor_responsive_text_overflow.py`)
  - CSS, HTML, JS의 카드 경계 및 말줄임 정책을 검증한다.
  - 기존 모니터 텍스트 정합성 테스트와 기준선 테스트를 실행한다.
