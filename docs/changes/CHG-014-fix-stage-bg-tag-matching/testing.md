# Testing Strategy: CHG-014-fix-stage-bg-tag-matching

## 1. 테스트 목표
- 태그 정규화로 다양한 포맷(`#태그`, `태그 `, 대소문자 등)의 현장 배경 태그 매칭이 정상 작동하는지 검증합니다.
- 지정된 태그 일치 배경이 존재하는 경우 반드시 해당 태그 배경만 추출되며 fallback 배경이 선택되지 않음을 보장합니다.
- 동일한 곡(동일 `praiseGroupId` 또는 `songTitle`)의 슬라이드를 임의 이동 시 매번 동일한 배경이 유지됨을 검증합니다.

## 2. 검증 항목
- `pytest tests/test_mood_matching.py` 실행
- `pytest tests/test_praise_fixed_background.py` 실행
- `pytest` 전체 테스트 스위트 회귀 검증

## 3. 통과 기준
- 신규 및 기존 백엔드 단위 테스트 100% 통과 (Exit Code 0).
