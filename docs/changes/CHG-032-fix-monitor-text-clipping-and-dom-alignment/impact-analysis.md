# Impact Analysis: CHG-032-fix-monitor-text-clipping-and-dom-alignment

## 1. 영향 범위 (Scope)

### Allowed Scope (수정 허용 범위)
- `frontend/css/viewer.css`
- `frontend/monitor.html`
- `frontend/viewer.html`
- `frontend/js/viewer.js`
- `frontend/js/modules/editor-monitor.js`
- `tests/test_monitor_text_clipping_and_alignment.py` (신규 테스트)
- `docs/changes/CHG-032-fix-monitor-text-clipping-and-dom-alignment/`
- `docs/project-state.md`

### Protected Scope (수정 금지 범위)
- `backend/`
- `frontend/editor.html`
- `frontend/presenter.html`
- `frontend/js/presenter.js`
- `frontend/js/modules/editor-bible.js`
- `frontend/js/modules/editor-praise.js`

## 2. 파급 효과 및 위험 요소 (Risk Analysis)
- **부모 카드 영역 오버플로우 방지**: `overflow: visible` 적용 시 텍스트 내용이 과도하게 길 경우 카드 밖으로 벗어날 가능성이 있으므로 카드 내부 여백 및 16:9 스테이지 바운딩 처리 유효성 확인.
- **기존 테스트 호환성**: 이전 CHG-028/CHG-029/CHG-031 등 기존 모니터링 관련 단위 테스트(`test_monitor_text_clip_autofit.py`, `test_monitor_transform_scaling.py` 등)의 회귀 실패 발생 여부 점검.
- **줄바꿈 및 stroke 렌더링 영향**: `line-height` 및 패딩 단일화 시 `webkitTextStroke` 테두리가 자르기 없이 바깥쪽으로 예쁘게 렌더링되는지 확인.
