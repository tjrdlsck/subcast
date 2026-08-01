# Test Baseline

## 실행 환경

- Runtime: Python 3.12.10 (Win32)
- Package Manager: `pip` (`requirements.txt`)
- Test Framework: `pytest-8.2.2`

## 검증 명령 및 현행 결과

| 검증 종류 | 표준 실행 명령 | 현재 결과 | 비고 |
|---|---|---|---|
| Main Test Suite | `venv\Scripts\python.exe -m pytest tests/ --ignore=tests/test_template_undo.py` | **PASS (73/73 passed)** | 3.41초 소요, 100% 통과 |
| WebSocket Undo Test | `venv\Scripts\python.exe -m pytest tests/test_template_undo.py` | **TIMEOUT / BLOCKING** | 웹소켓 수신 블로킹 이슈 존재 |

## 기존 실패 및 지연 항목 기록

1. **`tests/test_template_undo.py`**:
   - 현상: WebSocket 수신(`ws.receive_json()`) 시 이벤트 응답 무한 대기 현상 발생
   - 판정: 기존 코드베이스의 알려진 수동 검증 대상 또는 웹소켓 테스트 타임아웃 이슈 (회귀 테스트 시 유의 항목)

## 기준선 종합 판정

- **부분적으로 매우 안정적 (73개 자동화 테스트 100% PASS)**
- 변경 작업 진행 시 `test_template_undo.py` 외 73개 테스트 스위트의 성공 상태를 유지해야 함.
