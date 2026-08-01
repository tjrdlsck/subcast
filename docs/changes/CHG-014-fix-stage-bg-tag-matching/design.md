# Design: CHG-014-fix-stage-bg-tag-matching

## 1. 개요
현장 배경 태그 매칭 정확도 향상 및 한 곡 내 슬라이드 간 동일한 현장 배경 유지 보장 설계.

## 2. 세부 설계

### A. 태그 정규화 (Tag Normalization)
- 백엔드(`mood_matching.py`) 및 프론트엔드(`editor-praise.js`)에 태그 정규화 공통 알고리즘 적용:
  - 문자열/배열/None 타입 지원.
  - `#` 접두사 제거, `.strip()`, 소문자 변환 (`.lower()`).
  - 예: `"#경배/찬양 "` -> `"경배/찬양"`.

### B. 엄격한 태그 매칭 및 Fallback 제어
- `slide_moods`에서 정규화된 태그 목록 `target_tags` 추출.
- 배경 항목의 `mood`, `moods`, `tag`에서 정규화된 태그 목록 `bg_tags` 추출.
- `bg_tags`에 `target_tags` 중 하나라도 일치하는 배경 항목을 `tag_candidates`로 수집.
- `tag_candidates`가 1개 이상 존재하는 경우:
  - **무조건 `tag_candidates` 내부에서만 무작위/이력큐 기반 선택**.
  - 절대로 2차(기본/일반) 또는 3차(전체 무작위) fallback으로 진행하지 않음.

### C. 한 곡 전체 슬라이드 동일 배경 고정 (Song-level BG Persistence)
- 백엔드 WebSocket 메시지 (`SELECT_STAGE_BACKGROUND_BY_MOOD`):
  - `praiseGroupId`, `songTitle`, `overrideBgId` 필드 수신.
  - 슬라이드에 `overrideBgId`가 지정되어 있으면 해당 배경 고정 반환.
  - `overrideBgId`가 없고 `praiseGroupId` 또는 `songTitle`이 제공되면, 서버 메모리의 `song_bg_cache`에서 해당 곡의 매칭 배경이 있는지 조회.
  - 이미 매칭된 배경이 있으면 그대로 반환하고, 없으면 정규화 태그 매칭으로 무작위 매칭 후 `song_bg_cache`에 저장하여 동일 곡 내 슬라이드 이동 시 배경이 유지되도록 함.
- 프론트엔드 (`editor-praise.js`, `presenter.js`):
  - 찬양 곡 생성 시 모든 슬라이드 객체에 무작위 선정된 `overrideBgId`를 명시적으로 부여.
  - `presenter.js`에서 슬라이드 이동 시 `praiseGroupId` 및 `songTitle`을 함께 백엔드로 전달하고, 로컬에서도 곡 단위 배경을 고정 관리.

