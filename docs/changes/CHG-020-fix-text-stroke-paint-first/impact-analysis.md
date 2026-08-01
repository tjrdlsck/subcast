# Impact Analysis: CHG-020-fix-text-stroke-paint-first

## 1. 영향 범위 분석 (Impact Analysis)

### Changed System Modules
- `frontend/js/modules/editor-elements.js`: 텍스트 요소 생성 시 `paintFirst: 'stroke'` 기본값 적용.
- `frontend/js/modules/editor-monitor.js`: 무대 모니터 CURRENT / NEXT 가이드 텍스트박스 생성 시 `paintFirst: 'stroke'` 설정.
- `frontend/js/modules/editor-init.js`: 텍스트 테두리 색상/투명도/두께 실시간 조절 시 `paintFirst: 'stroke'` 동시 적용 및 `text-strokewidth` 이벤트 핸들러 추가.

### Scope Boundaries
- **Allowed Scope**:
  - `frontend/js/modules/editor-elements.js`
  - `frontend/js/modules/editor-monitor.js`
  - `frontend/js/modules/editor-init.js`
  - `tests/test_text_stroke_paint_first.py`
  - `docs/changes/CHG-020-fix-text-stroke-paint-first/`
  - `docs/project-state.md`
- **Protected Scope**:
  - `backend/`
  - `frontend/editor.html`
  - `frontend/monitor.html`
  - `frontend/presenter.html`
  - `frontend/viewer.html`
  - `frontend/js/presenter.js`
  - `frontend/js/viewer.js`
  - `frontend/js/modules/editor-canvas.js`
  - 기타 지정되지 않은 파일

## 2. 회귀 위험도 (Regression Risks)
- 기존에 테두리가 적용되어 있던 텍스트 슬라이드가 이전과 달리 폰트 내부 영역을 덮지 않게 되므로, 가시성이 크게 개선됨.
- `presenter.js`, `viewer.js`, `editor-history.js`에는 이미 `paintFirst: 'stroke'` 옵션이 부분 반영되어 있으므로 기존 슬라이드 직렬화/복원 데이터와의 하위 호환성 문제 없음.
