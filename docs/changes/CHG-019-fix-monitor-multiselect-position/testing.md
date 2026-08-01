# Testing Strategy: CHG-019-fix-monitor-multiselect-position

## 1. Unit & Integration Test Plan
- **테스트 파일**: `tests/test_monitor_multiselect.py`
- **테스트 항목**:
  1. `getAbsoluteObjectBounds` 연산 로직 수학적 검증:
     - `obj.group`이 있을 때 상대 오프셋 좌표와 그룹 위치를 결합한 Matrix 연산을 통해 `left`, `top`이 두 객체 간에 서로 다르고 정확하게 분리 계산되는지 검증.
  2. 다중 선택 상태에서 객체 이동 시 `currentBox`와 `nextBox`의 위치(`leftPct`, `topPct`)가 동일하게 겹치지 않는지 확인.

## 2. Regression Risk & Verification Baseline
- 기존 단일 선택 및 기존 무대 모니터 뷰어 동기화 로직에 부정적 영향이 없는지 기존 검증 스크립트 실행.
