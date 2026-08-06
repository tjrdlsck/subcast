# Testing Strategy: CHG-038 찬양 슬라이드 2분할 레이아웃 적용 및 성경/일반 슬라이드 1분할 단일 레이아웃 자동 분기

## 1. 테스트 목표
- 찬양 탭 슬라이드 송출 시에만 무대 모니터에 2분할(현재/다음 자막) 레이아웃이 적용되고, 성경 및 일반 슬라이드에는 1분할(현재 자막 단일 대형) 레이아웃이 정확히 분기되는지 검증.

## 2. 검증 절차
1. **단위 테스트 (Unit Test)**:
   - `pytest tests/test_stage_monitor_conditional_split.py` 실행하여 `isPraiseSlide()` 식별 분기 및 렌더링 스위칭 로직 통과 확인.
2. **기존 테스트 검증**:
   - `pytest tests/test_stage_monitor_guide_box.py` 실행하여 이전 변경 사항 통과 유지 확인.
