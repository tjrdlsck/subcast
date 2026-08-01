# Tasks Breakdown: CHG-033-fix-monitor-text-overflow-truncation

## Task List

- [ ] **Task 1: CSS Truncation 규칙 및 Overflow 경계 재정의** (`frontend/css/viewer.css`)
  - `.monitor-card` 및 `#monitor-current-text`, `#monitor-next-text`에 오버플로우 가려짐 방지 및 안전 생략(`text-overflow: ellipsis`, `-webkit-line-clamp`, `overflow: hidden`) 구조 도입.

- [ ] **Task 2: JS Layout Renderer 수정 및 안전 텍스트 렌더링** (`frontend/js/viewer.js`)
  - `renderMonitorViewerLayout()` 내 텍스트 스타일 동적 할당 시 `overflow`, `text-overflow`, `-webkit-line-clamp` 속성 연동.

- [ ] **Task 3: 단위 및 통합 검증 테스트 작성** (`tests/test_monitor_text_truncation_and_overflow.py`)
  - 긴 텍스트 입력 시 가려짐 현상이 발생하지 않고 말줄임표 또는 박스 내 정합성이 유지되는지 검증.
