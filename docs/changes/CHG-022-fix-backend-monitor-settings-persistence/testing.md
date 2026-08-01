# Testing Strategy: CHG-022-fix-backend-monitor-settings-persistence

## 1. 자동화 테스트 계획
- `tests/test_monitor_backend_persistence.py`
  - DB 초기화 및 마이그레이션 정상 작동 검증
  - `update_monitor_settings` 실행 시 `strokeColor`, `strokeWidth`, `fontStyle`, `opacity`가 DB에 오차 없이 저장되고 `get_monitor_settings`로 정확히 리트리브되는지 확인

## 2. 수동 검증 계획
- 무대 모니터 탭에서 텍스트 상자의 색상, 테두리 색상, 테두리 두께, 기울임꼴 등 속성 수정
- 상단 "저장" 버튼 클릭 후 페이지 새로고침(F5)
- 설정한 색상/테두리/두께 값이 유지되는지 및 외부 모니터링 페이지(`monitor.html`)에서도 100% 동일하게 나타나는지 확인
