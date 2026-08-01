# Impact Analysis: PIP 미리보기 박스 비율 계산 및 줄바꿈 일치 수정 (CHG-015)

## 1. 영향 범위 분석

### Impact Area
- `frontend/js/viewer.js`: 모니터 뷰어 및 PIP 미리보기 렌더링 시 폰트 스케일 계산식 및 줄바꿈 CSS 속성 변경.
- `frontend/monitor.html`: 모니터 뷰어 HTML 템플릿 CSS 속성 점검.

## 2. Scope Controls

### Allowed Scope
- `frontend/js/viewer.js`
- `frontend/monitor.html`
- `docs/changes/CHG-015-fix-pip-monitor-preview-aspect-ratio/`
- `docs/project-state.md`

### Protected Scope
- `backend/`
- `frontend/editor.html`
- `frontend/js/modules/editor-monitor.js`
- `run.py`
- 기타 언급되지 않은 모든 소스 파일

## 3. 회귀 영향도 평가
- 기존 모니터 API, DB persistence, BroadcastChannel 통신 로직에는 전혀 영향을 주지 않는 순수 클라이언트 렌더링 스타일/스케일 계산 수정입니다.
- 백엔드 및 에디터 캔버스 자체 동작에는 변경이 없습니다.
