# Testing Strategy: CHG-025-praise-bg-dedup-algorithm

## 1. 유닛/통합 테스트 (Automated Testing)
- **테스트 파일**: `tests/test_praise_bg_matching.py` (Pytest 기반)
- **검증 항목**:
  1. 동일 태그(#경배/찬양)를 가진 곡을 여러 개 추가할 때 배경 영상 ID가 겹치지 않게 서로 다른 영상이 매칭되는지 확인.
  2. 이미 `projectData.slides`에 특정 `overrideBgId`가 할당된 경우, 해당 배경을 제외하고 매칭되는지 확인.
  3. 모든 후보 배경 영상이 이미 사용된 경우(후보 고갈), 무한 루프/에러 없이 최선의 영상(직전 배경 제외)이 선택되는지 확인.

## 2. 수동 검증 (Manual Verification)
- 에디터 UI에서 찬양 탭에서 동일 태그 곡 2~3개를 슬라이드 목록에 추가 후 각 슬라이드 썸네일/속성의 `overrideBgId`가 다르게 설정되는지 확인.
