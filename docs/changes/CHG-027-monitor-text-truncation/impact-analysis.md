# Impact Analysis: CHG-027-monitor-text-truncation

## 1. 영향 범위 (Impact Scope)
- **모니터링 텍스트 렌더링**: `frontend/js/viewer.js` 내 `updateMonitorViewerTexts` 및 HTML/CSS 모니터 카드 스타일
- **모니터 오버레이 뷰**: `frontend/monitor.html`, `frontend/viewer.html`
- **모니터 CSS 스타일**: `frontend/css/viewer.css`

## 2. Allowed Scope vs Protected Scope

### Allowed Scope (허용 범위)
- `frontend/js/viewer.js`
- `frontend/monitor.html`
- `frontend/viewer.html`
- `frontend/css/viewer.css`
- `tests/test_monitor_text_truncation.py` (신규 검증 테스트)
- `docs/changes/CHG-027-monitor-text-truncation/`
- `docs/project-state.md`

### Protected Scope (보호 범위)
- `backend/` (백엔드 로직 수정 불필요)
- `frontend/editor.html`
- `frontend/presenter.html`
- `frontend/js/presenter.js`
- `frontend/js/modules/editor-*.js`

## 3. 부작용 및 회귀 위험 (Side Effects & Risks)
- **단일 줄 텍스트 또는 짧은 텍스트의 가독성**: 생략 처리(`...`) 조건이 너무 엄격하여 짧은 문장이 잘리는 일이 없도록, 영역 초과시에만(CSS/JS clamp) 적용되도록 해야 합니다.
- **폰트 크기 변경과의 간섭**: 모니터링 설정에서 폰트 크기를 조정하더라도 말줄임표(Ellipsis) 처리가 정상 동작하고 레이아웃 상자를 벗어나지 않도록 overflow 및 line-clamp 속성을 통합 적용합니다.
