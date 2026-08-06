# Impact Analysis: CHG-038 찬양 슬라이드 2분할 레이아웃 적용 및 성경/일반 슬라이드 1분할 단일 레이아웃 자동 분기

## 1. 영향 범위 분석 (Impact Scope)
- **주요 대상 파일**:
  - `frontend/js/viewer.js` (또는 `monitor.html` / `presenter.js` 수신 및 렌더링부)
  - `frontend/js/modules/editor-monitor.js`
  - `frontend/js/modules/editor-praise.js`
  - `tests/test_stage_monitor_conditional_split.py`
- **영향 받는 기능**:
  - 무대 모니터(`monitor.html`) 렌더링 로직 (슬라이드 종류에 따른 2분할 vs 1분할 레이아웃 전환)
  - 실시간 방송 메시지(BroadcastChannel) 수신부의 렌더링 스위칭

## 2. Allowed Scope & Protected Scope

### Allowed Scope (수정 허용 범위)
- `docs/project-state.md`
- `docs/changes/current/*`
- `frontend/js/viewer.js`
- `frontend/js/modules/editor-monitor.js`
- `frontend/js/modules/editor-praise.js`
- `tests/test_stage_monitor_conditional_split.py`

### Protected Scope (수정 보호 범위)
- `backend/`
- `frontend/editor.html`, `frontend/monitor.html`
- `run.py`, `requirements.txt`

## 3. 리스크 및 완화책
- **리스크**: 찬양 슬라이드 식별 판단이 명확하지 않아 성경 슬라이드가 2분할로 잘못 노출될 위험.
- **완화책**: 슬라이드 생성 시 `slideType: 'praise'` / `isPraise: true` 속성을 명시적으로 부여하고, ID 프리픽스(`slide_praise_`) 및 이름 태그(`찬양:`)를 다중 검증하는 안전 헬퍼 함수 `isPraiseSlide(slide)` 구현.
