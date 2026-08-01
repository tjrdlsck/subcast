# Impact Analysis: CHG-014-fix-stage-bg-tag-matching

## 1. 영향 범위 (Scope)

### Allowed Scope (수정 허용 범위)
- `backend/services/mood_matching.py` (백엔드 배경 태그 매칭 로직 및 정규화, 곡 단위 배경 처리)
- `backend/main.py` (`SELECT_STAGE_BACKGROUND_BY_MOOD` 핸들러 및 곡별 배경 캐시)
- `frontend/js/modules/editor-praise.js` (`matchStageBgForSong` 함수 태그 정규화 및 곡 슬라이드 고정 배경 적용)
- `frontend/js/modules/editor-stage-bg.js` (현장 배경 라이브러리 태그 처리)
- `frontend/js/presenter.js` (슬라이드 송출 시 곡 식별자 전달 및 곡 단위 동일 배경 유지)
- `tests/test_mood_matching.py` (태그 매칭 및 정규화 테스트 사례 업데이트/추가)
- `tests/test_praise_fixed_background.py` (곡 단위 배경 유지 및 독립성 테스트 업데이트/추가)
- `docs/changes/CHG-014-fix-stage-bg-tag-matching/`
- `docs/project-state.md`

### Protected Scope (수정 금지 범위)
- `frontend/editor.html`
- `frontend/js/modules/editor-elements.js`
- `frontend/js/modules/editor-monitor.js`
- `run.py`
- 기타 언급되지 않은 백엔드/프론트엔드 모듈 및 설정 파일

## 2. 잠재적 리스크 및 대응책
- **기존 테스트 영향**: `test_anti_repetition_sequential_matching` 등 기존 테스트는 직전 사용 배경 중복 방지 큐를 테스트하므로, 곡 단위 배경 고정과 독립적인 순수 무작위 추출 시의 동작도 호환되도록 구성합니다.
- **태그 형태의 다양성**: 태그가 `#`으로 시작하는 경우, 공백이 있는 경우, 배열로 전달되는 경우 등 다양한 형태를 수용하도록 `normalize_tag`를 견고하게 구현합니다.
