# Testing Strategy: CHG-037-fix-monitor-textbox-height-resizing

## 1. 검증 목적

모니터 에디터(`editor-monitor.js`) 가이드 박스의 세로 수동 조작 및 높이 비율(`heightPct`) 계산 교정이 정상 작동하며, 1줄/빈 슬라이드 텍스트 상태에서도 영역 수축이 발생하지 않음을 확인한다.

## 2. 검증 항목 및 시나리오

### 시나리오 1: 1줄 텍스트 수직 리사이즈 및 `heightPct` 갱신 검증
- **절차**:
  1. 모니터 에디터 탭 진입.
  2. 1줄짜리 슬라이드 내용 선택.
  3. `nextBox` 세로 리사이즈 핸들(`scaleY`)을 잡아 아래로 끌어 상자 높이 변경.
- **기대 결과**:
  - `monitor-layout-info` UI의 `NEXT: H: xx%` 수치가 쪼그라들지 않고 늘어난 비율로 즉시 업데이트됨.
  - 마우스를 놓았을 때 텍스트 1줄 높이로 도로 원상복구(Auto-shrink)되지 않음.

### 시나리오 2: 슬라이드 전환 및 탭 재진입 시 높이 보존 검증
- **절차**:
  1. 변경된 모니터 레이아웃 '저장' 버튼 클릭.
  2. 다른 슬라이드(빈 슬라이드/긴 슬라이드)로 전환 후 다시 돌아옴.
- **기대 결과**:
  - `heightPct`가 텍스트 길이에 의존해 축소되지 않고 이전에 설정된 높이 비율을 유지함.

### 시나리오 3: 백엔드 API & DB 저장 영속성 검증
- **절차**:
  1. `POST /api/v1/monitor/settings` 호출 후 저장된 JSON 응답 확인.
- **기대 결과**:
  - `nextBox.heightPct` 및 `currentBox.heightPct`에 수동 조정된 float 값이 정상 영속화됨.

## 3. 자동화 테스트 계획

- `pytest tests/test_monitor_api.py`
- `pytest tests/test_monitor_backend_persistence.py`
- `pytest tests/test_monitor_responsive_text_overflow.py`
- `pytest tests/test_monitor_text_occlusion_and_live_sync.py`

모든 모니터 관련 pytest 실행 결과 통과(Exit Code 0)를 검증 기준으로 삼음.
