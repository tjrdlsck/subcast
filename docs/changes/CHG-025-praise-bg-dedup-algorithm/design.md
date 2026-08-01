# Technical Design: CHG-025-praise-bg-dedup-algorithm

## 1. 주요 모듈 설계 및 데이터 흐름 (Architecture & Data Flow)

### 1.1 `matchStageBgForSong` 함수 확장
기존 Signature:
```javascript
function matchStageBgForSong(songMood)
```
개선된 Signature:
```javascript
function matchStageBgForSong(songMood, excludeBgIds = [])
```

#### 알고리즘 동작 로직:
1. **태그 추출 및 정문화 (Tag Normalization)**:
   - `songMood` (또는 배열 형태의 moods)에서 `#` 제거 및 소문자 정규화.
2. **현재 슬라이드 사용 중 배경 수집 (Exclude List Processing)**:
   - 호출 시점에 전달받은 `excludeBgIds` (프로젝트 내 기존 `overrideBgId` + 현재 작업 그룹 내 새로 할당된 `overrideBgId` 목록)을 제외 대상(Set 또는 Array)으로 지정.
3. **단계별 무작위 매칭 (Multi-tier Selection with Exclusion)**:
   - **Tier 1 (태그 일치 미사용 배경)**: `targetTags` 중 어느 하나라도 포함하며 `excludeBgIds`에 없는 배경 후보군 생성 -> 무작위 선택.
   - **Tier 2 (태그 후보 고갈 시 직전 배경 제외 폴백 - 구 Tier 4)**: 해당 태그의 모든 배경 영상이 이미 `excludeBgIds`에 포함되어 있어 미사용 배경이 0개인 경우:
     - 태그 일치 후보(`matchingCandidates`) 중 직전에 사용된 배경(`excludeBgIds`의 마지막 항목)과 다른 배경 영상 무작위 선택.
     - (만약 태그 일치 후보가 아예 0개인 경우에 한해 디폴트/전체 라이브러리 중 직전 배경 제외 선택)

### 1.2 찬양 곡 슬라이드 생성 시 적용 로직 (`editor-praise.js`)
- 슬라이드 생성 함수(`addPraiseSlidesToProject` 등)에서:
  1. 현재 `projectData.slides`를 순회하여 이미 설정된 `overrideBgId` 목록 수집 (`existingUsedBgIds`).
  2. 선택한 곡의 `songMood` 및 수집된 `existingUsedBgIds`를 전달하여 `matchStageBgForSong(songMood, existingUsedBgIds)` 호출.
  3. 리턴받은 `fixedBgId`를 해당 찬양 곡의 모든 슬라이드에 적용.

## 2. 인터페이스 변경안
- 기존 모듈 간 외부 호출 인터페이스 `window.matchStageBgForSong(songMood, excludeBgIds)`의 하위 호환성을 유지하여 second parameter 미전달 시 빈 배열 `[]`로 기본 동작 처리.
