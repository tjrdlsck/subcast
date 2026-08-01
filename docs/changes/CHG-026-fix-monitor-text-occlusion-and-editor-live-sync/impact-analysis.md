# Impact Analysis: CHG-026-fix-monitor-text-occlusion-and-editor-live-sync

## 1. 영향 범위 분석 (Impact Scope)

### Allowed Scope (수정 허용 범위)
- `frontend/js/viewer.js`
- `frontend/monitor.html`
- `frontend/js/modules/editor-slides.js`
- `frontend/js/modules/editor-monitor.js`
- `tests/test_monitor_text_occlusion_and_live_sync.py` (또는 JS 테스트 파일)
- `docs/changes/CHG-026-fix-monitor-text-occlusion-and-editor-live-sync/`
- `docs/project-state.md`

### Protected Scope (수정 불가/보호 범위)
- `backend/` (본 변경건은 백엔드 로직 수정 미포함)
- `frontend/presenter.html`
- `frontend/js/presenter.js`
- `frontend/editor.html`

## 2. 사이드 이펙트 및 리스크 (Side Effects & Risks)
- **프레젠터 라이브 송출 기능**: 프레젠터(`presenter.js`)에서의 슬라이드 라이브 전환(`changeSlide`)은 웹소켓을 경유하므로, 에디터의 `notifyMonitorSlideChange` 차단에 의해 영향을 받지 않고 정상 동작해야 함.
- **모니터 에디터 렌더링**: 모니터 에디터 캔버스(`editor-monitor.js`)에서 가이드 박스(`currentGuideBox`, `nextGuideBox`)와 커스텀 요소 간의 z-order 순서가 정합성을 유지해야 함.

## 3. 회귀 테스트 기준선 (Regression Test Baseline)
- 기존 모니터 및 프레젠터 제어 단위 테스트 실행 통과.
- 신규 작성할 `tests/test_monitor_text_occlusion_and_live_sync.py` 테스트 통과.
