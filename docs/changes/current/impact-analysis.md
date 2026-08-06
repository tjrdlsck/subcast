# Impact Analysis: CHG-037 무대 모니터 가이드 박스 고정 더미 텍스트화 및 PiP 실시간 연동 UX 개선

## 1. 영향 범위 분석 (Impact Scope)
- **주요 대상 파일**:
  - `frontend/js/modules/editor-monitor.js`
  - (필요 시) `frontend/js/modules/editor-stage-bg.js`
  - (테스트) `tests/test_stage_monitor_guide_box.py` 또는 관련 테스트 파일
- **영향 받는 기능**:
  - 에디터 모니터 탭 메인 캔버스 렌더링 (`enterMonitorMode`, `getInitialSlideTexts`)
  - 모니터 가이드 박스 동기화 및 브로드캐스트 (`syncCanvasToMonitorSettings`, `broadcastMonitorPreviewSettings`)
  - 측면 PiP 미리보기 iframe 연동

## 2. Allowed Scope & Protected Scope

### Allowed Scope (수정 허용 범위)
- `docs/project-state.md`
- `docs/changes/current/*`
- `frontend/js/modules/editor-monitor.js`
- `frontend/js/modules/editor-stage-bg.js`
- `tests/test_stage_monitor_guide_box.py` (신규 검증 테스트)

### Protected Scope (수정 보호 범위 - 사용자 승인 없이 수정 불가)
- `backend/` 하위 전 파일
- `frontend/editor.html` (DOM ID 변경 금지)
- `frontend/js/viewer.js`, `frontend/js/presenter.js`
- `run.py`, `requirements.txt`

## 3. 기존 테스트 및 기준선 (Test Baseline)
- 기존 모니터 관련 테스트 실행 후 회귀(Regression) 유발 여부 확인.
- 메인 캔버스 동기화 및 broadcast 이벤트 동작 검증.

## 4. 리스크 및 완화책 (Risks & Mitigation)
- **리스크**: 더미 텍스트 사용 시 실제 모니터(`monitor.html`)로 수신되는 설정값에 텍스트 내용까지 덮어써질 위험.
- **완화책**: `syncCanvasToMonitorSettings()`에서 `textColor`, `fontSize`, `leftPct`, `widthPct` 등 **레이아웃/스타일 속성만** 동기화하고, 실제 텍스트 내용(`curText`, `nextText`)은 수신부(`monitor.html`)에서 기존 슬라이드 데이터 원본을 사용하도록 분리 보장.
