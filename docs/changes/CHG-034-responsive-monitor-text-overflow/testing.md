# Testing Strategy: CHG-034-responsive-monitor-text-overflow

## 1. 자동화 테스트

- `tests/test_monitor_responsive_text_overflow.py`를 작성한다.
- 다음 항목을 정적 검증한다.
  - 모니터 카드의 `overflow: hidden` 정책
  - 텍스트 요소의 `text-overflow: ellipsis`
  - 텍스트 요소의 `-webkit-box` 및 `-webkit-box-orient`
  - 카드 내부 너비·높이 제한
  - `viewer.js`에서 overflow visible/unset을 재적용하지 않는지 여부
  - `monitor.html`과 `viewer.html`의 동일한 초기 정책

## 2. 회귀 검증

- 표준 기준선 명령을 실행한다.
  - `venv\Scripts\python.exe -m pytest tests/ --ignore=tests/test_template_undo.py`
- 기존 모니터 텍스트 관련 테스트를 함께 실행한다.
- `tests/test_template_undo.py`는 기존 WebSocket 블로킹 기준에 따라 별도 판정한다.

## 3. 수동 검증

- 작은 카드에 긴 한글 텍스트를 입력한다.
- 줄바꿈이 많은 성경 구절과 찬양 가사를 각각 확인한다.
- Current/Next 카드의 우측·하단으로 텍스트가 튀어나오지 않는지 확인한다.
- 브라우저 창 크기를 변경하고 카드 스케일링 후에도 텍스트가 카드 안에 남는지 확인한다.
- 1줄 및 2줄 일반 텍스트의 하단 글자와 정렬이 기존과 동일한지 확인한다.

## 4. 성공 기준

- 긴 텍스트가 카드 밖으로 렌더링되지 않는다.
- 표시 영역을 초과한 텍스트가 말줄임 처리된다.
- 창 크기 및 카드 크기 변경 후에도 오버플로우가 재발하지 않는다.
- 기준선 테스트에서 새로운 회귀 실패가 발생하지 않는다.
