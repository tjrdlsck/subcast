# Testing Strategy: CHG-037 무대 모니터 가이드 박스 고정 더미 텍스트화 및 PiP 실시간 연동 UX 개선

## 1. 테스트 목표
- 메인 캔버스 텍스트 박스가 글자 수 영향 없이 항상 일정하고 손쉽게 드래그 및 리사이즈가 가능한지 검증.
- 더미 텍스트 내용이 `monitor.html` 또는 백엔드 모니터 설정 영속화(`monitorSettings`)에 영향을 주지 않고 레이아웃 위치/크기/폰트만 올바르게 저장/전달되는지 확인.

## 2. 검증 절차
1. **단위 테스트 (Unit Test)**:
   - `tests/test_stage_monitor_guide_box.py` 실행.
   - `monitorSettings` 딕셔너리 구조 및 위치 비율(`leftPct`, `widthPct` 등) 산출 검증.
2. **기존 테스트 검증**:
   - `pytest tests/test_monitor_transform_scaling.py`, `tests/test_monitor_aspect_ratio.py` 실행하여 회귀 실패 없는지 확인.
3. **수동/동작 검증**:
   - 에디터 실행 후 '무대 모니터' 탭으로 전환.
   - 메인 캔버스의 `🔴 CURRENT` 및 `🔵 NEXT` 영역 드래그 & 핸들 조절 시 측면 PiP 미니 미리보기 박스에서 즉시 실시간 렌더링 확인.
