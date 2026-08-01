# Tasks Breakdown: CHG-027-monitor-text-truncation

## Task 목록

- [ ] **Task 1: CSS 및 HTML 모니터 텍스트 카드 축약 스타일 추가**
  - `frontend/css/viewer.css`에 `.monitor-card-text` / `#monitor-current-text`, `#monitor-next-text`에 멀티라인 line-clamp, overflow hidden, text-overflow ellipsis 적용.
  - `frontend/monitor.html` 및 `frontend/viewer.html` 인라인 스타일 보완.

- [ ] **Task 2: `viewer.js` 텍스트 업데이트 로직 검토 및 축약 처리 강화**
  - `updateMonitorViewerTexts` 함수에서 텍스트 수신 시 overflow 방지 및 line-clamp가 부드럽게 적용되도록 수정을 반영.

- [ ] **Task 3: 검증 테스트 작성 및 실행**
  - `tests/test_monitor_text_truncation.py`를 생성하여 모니터 텍스트 축약 CSS/JS 속성 및 레이아웃 설정이 바르게 적용되었는지 검증.
