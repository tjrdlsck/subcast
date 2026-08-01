# Tasks Breakdown: CHG-025-praise-bg-dedup-algorithm

## Task 1: `matchStageBgForSong` 함수 중복 방지 알고리즘 구현
- **파일**: `frontend/js/modules/editor-praise.js`
- **내용**:
  - `excludeBgIds` 파라미터 추가
  - Tier 1~4 매칭 및 필터링 알고리즘 적용
  - 하위 호환성 유지 (`window.matchStageBgForSong`)

## Task 2: 찬양 곡 슬라이드 생성 시 `existingUsedBgIds` 연동
- **파일**: `frontend/js/modules/editor-praise.js`
- **내용**:
  - `projectData.slides`에서 사용 중인 `overrideBgId` 목록 추출 로직 추가
  - `matchStageBgForSong` 호출 시 `existingUsedBgIds` 전달

## Task 3: 배경 중복 방지 검증 테스트 작성 및 검증
- **파일**: `tests/test_praise_bg_matching.py`
- **내용**:
  - 동일 태그 곡 연속 생성 시 배경 중복 필터링 테스트
  - 후보군 고갈 시 폴백 작동 검증
