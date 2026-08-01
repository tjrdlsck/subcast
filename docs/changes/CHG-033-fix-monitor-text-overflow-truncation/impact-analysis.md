# Impact Analysis: CHG-033-fix-monitor-text-overflow-truncation

## 1. 영향 범위 (Scope)

### Allowed Scope (수정 허용 범위)
- `frontend/css/viewer.css` (모니터 텍스트 생략 및 overflow/line-clamp 관련 스타일 규칙)
- `frontend/monitor.html` (모니터 텍스트 카드의 레이아웃 구조)
- `frontend/js/viewer.js` (`renderMonitorViewerLayout` 및 텍스트 렌더링/생략 처리 로직)
- `tests/test_monitor_text_truncation_and_overflow.py` (신규 테스트)
- `docs/changes/CHG-033-fix-monitor-text-overflow-truncation/`
- `docs/project-state.md`

### Protected Scope (수정 불가 범위)
- `backend/`
- `frontend/editor.html`
- `frontend/presenter.html`
- `frontend/js/presenter.js`
- `frontend/js/modules/editor-monitor.js` (캔버스 기본 데이터 정의 유지)

## 2. 부작용 및 위험 요소 (Risk Assessment)
- **위험 1**: `-webkit-line-clamp` 적용 시 `white-space: pre-wrap`의 개행 문자 처리 문제로 인해 줄 수가 잘못 계산될 수 있음.
  - **대응**: `display: -webkit-box` 및 exact line-height / max-height 경계를 엄격히 지정하고, 동적 auto-fit 폰트 축소 함수(Safe Font Scale Down)를 조합하여 text clipping 방지.
- **위험 2**: 폰트 자동 축소 시 스크립트 오버헤드 또는 DOM reflow 발생.
  - **대응**: DOM 업데이트 시 단일 패스(Single-pass) 측정 또는 CSS 기반 안전 멀티라인 truncation 기술 적용.

## 3. 회귀 테스트 영향 (Regression Control)
- existing tests (CHG-032 및 모니터링 레이아웃 수직 정합성) 통과 여부 검증.
