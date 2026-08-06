# Tasks Breakdown: CHG-038 찬양 슬라이드 2분할 레이아웃 적용 및 성경/일반 슬라이드 1분할 단일 레이아웃 자동 분기

## Task 1: 찬양 슬라이드 속성 명시화
- **목표**: `editor-praise.js`에서 생성되는 슬라이드 객체에 `slideType: 'praise'`, `isPraise: true` 식별 필드 부여.
- **대상 파일**: `frontend/js/modules/editor-praise.js`

## Task 2: 슬라이드 종류에 따른 2분할 vs 1분할 조건부 모니터 렌더링 분기
- **목표**: `viewer.js` (무대 모니터 렌더링 모듈)에서 `isPraiseSlide(slide)` 판별 결과에 따라 찬양 슬라이드는 2분할(CURRENT + NEXT), 그 외 슬라이드는 1분할(CURRENT 단일)로 조건부 렌더링.
- **대상 파일**: `frontend/js/viewer.js` 및 관련 무대 모니터 모듈

## Task 3: 조건부 분기 단위 테스트 작성 및 검증
- **목표**: 찬양 슬라이드와 성경/일반 슬라이드의 분기 처리 판별 헬퍼 및 렌더링 조건을 검증하는 테스트 작성.
- **대상 파일**: `tests/test_stage_monitor_conditional_split.py`
