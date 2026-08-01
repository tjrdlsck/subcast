# Impact Analysis: CHG-034-responsive-monitor-text-overflow

## 1. 영향 범위

### Allowed Scope (수정 허용 범위)

- `frontend/css/viewer.css`
- `frontend/monitor.html`
- `frontend/viewer.html`
- `frontend/js/viewer.js`
- `tests/test_monitor_responsive_text_overflow.py`
- `docs/changes/CHG-034-responsive-monitor-text-overflow/`
- `docs/project-state.md`

### Protected Scope (수정 불가 범위)

- `backend/`
- `frontend/editor.html`
- `frontend/presenter.html`
- `frontend/js/presenter.js`
- `frontend/js/modules/editor-monitor.js`
- `frontend/js/modules/editor-slides.js`

## 2. 영향 대상

- 모니터 Current/Next 카드의 CSS 오버플로우 및 말줄임 처리
- `monitor.html`과 `viewer.html`의 모니터 텍스트 DOM 초기 스타일
- `viewer.js`의 카드 레이아웃 및 텍스트 갱신 순서
- 긴 텍스트와 카드 크기 조합을 검증하는 정적 회귀 테스트

## 3. 위험 분석

- **기존 1~2줄 텍스트 하단 잘림**: line-height와 카드 내부 여백을 보존하고 일반 텍스트 회귀 테스트를 추가한다.
- **CSS와 JS 스타일 충돌**: 동일한 오버플로우 정책을 CSS와 JS에 일관되게 반영하고 `!important` 의존을 최소화한다.
- **카드 높이별 줄 수 불일치**: 고정 줄 수만 강제하지 않고 카드의 실제 높이를 기준으로 표시 영역을 제한한다.
- **모니터 뷰어와 별도 모니터 페이지 불일치**: 두 HTML의 동일한 텍스트 요소에 같은 정책을 적용한다.

## 4. 회귀 통제

- 현행 기준선의 73개 통과 테스트를 유지한다.
- 기존 모니터 텍스트 클리핑/정합성 테스트가 새 요구사항과 충돌할 경우, 승인된 변경 설계에 맞춰 검증 기준을 갱신한다.
- `tests/test_template_undo.py`의 기존 WebSocket 블로킹은 기준선 실패로 별도 기록한다.
