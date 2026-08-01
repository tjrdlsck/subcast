# Tasks: CHG-014-fix-stage-bg-tag-matching

- [ ] **Task 1**: `backend/services/mood_matching.py` 태그 정규화 (`normalize_tag`) 및 엄격한 태그 후보 선택 로직 개편
- [ ] **Task 2**: `backend/main.py` 내 `SELECT_STAGE_BACKGROUND_BY_MOOD` 핸들러의 곡 식별자(`praiseGroupId`/`songTitle`) 기반 배경 고정 캐시 적용
- [ ] **Task 3**: `frontend/js/modules/editor-praise.js` 내 `matchStageBgForSong` 정규화 및 곡 슬라이드 고정 배경 적용 개선
- [ ] **Task 4**: `frontend/js/presenter.js` 슬라이드 송출 시 곡 식별자 전송 및 곡 단위 배경 유지를 위한 연동 강화
- [ ] **Task 5**: `tests/test_mood_matching.py` 및 `tests/test_praise_fixed_background.py` 단위 테스트 확장 및 검증 실행
