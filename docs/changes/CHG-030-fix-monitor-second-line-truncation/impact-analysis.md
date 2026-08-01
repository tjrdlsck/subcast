# Impact Analysis: CHG-030-fix-monitor-second-line-truncation

## 1. 영향 범위 (Scope)

### Allowed Scope
- `frontend/css/viewer.css`
- `frontend/monitor.html`
- `frontend/viewer.html`
- `frontend/js/viewer.js`
- `tests/test_monitor_text_clip_autofit.py`
- `docs/changes/CHG-030-fix-monitor-second-line-truncation/`
- `docs/project-state.md`

### Protected Scope
- `backend/`
- `frontend/editor.html`
- `frontend/presenter.html`
- `frontend/js/presenter.js`
- `frontend/js/modules/editor-*.js`

## 2. 부작용 및 위험 요소 (Risk Analysis)
- `line-height` 조절 시 극단적인 디센더(Descender: 한글 'ㄹ' 받침, 영어 'g, p, q, y') 획이 잘리지 않도록 행간 `1.28~1.3` 선에서 안전 균형점 확보 필요.
- 폰트 크기 및 스케일에 따른 모니터 카드 수직 중앙 정렬 (`margin: auto 0`, `align-items: center`) 유지 확인.

## 3. 회귀 테스트 및 검증 계획
- 기존 테스트 baseline 및 `tests/test_monitor_text_clip_autofit.py` 검증 수행.
