# Test Baseline

## 기준선 확인 정보

- 확인 날짜: 2026-08-02

## 실행 환경

- Runtime: Python 3.12.10 (Win32)
- Package Manager: `pip` (`requirements.txt`)
- Test Framework: `pytest-8.2.2`

## 검증 명령 및 현행 결과

| 검증 종류 | 표준 실행 명령 | 현재 결과 | 비고 |
|---|---|---|---|
| Main Test Suite | `venv\Scripts\python.exe -m pytest tests/ --ignore=tests/test_template_undo.py --basetemp test_results\chg035-baseline-20260802` | **97 passed, 26 failed** | 3.66초 소요; 모니터 프론트엔드 기대치 불일치 |
| WebSocket Undo Test | `venv\Scripts\python.exe -m pytest tests/test_template_undo.py` | **TIMEOUT / BLOCKING** | 웹소켓 수신 블로킹 이슈 존재 |

## 기존 실패 및 지연 항목 기록

현재 기준선 재실행 결과는 123개 수집, 97개 통과, 26개 실패이다. 26개 실패는 모니터 프론트엔드 관련 테스트에서 현재 파일과 기존 기대치가 불일치한 항목이다.

1. **`tests/test_template_undo.py`**:
   - 현상: WebSocket 수신(`ws.receive_json()`) 시 이벤트 응답 무한 대기 현상 발생
   - 판정: 기존 코드베이스의 알려진 수동 검증 대상 또는 웹소켓 테스트 타임아웃 이슈 (회귀 테스트 시 유의 항목)

## 기준선 종합 판정

- **기준선 불일치 존재 (123개 수집, 97개 통과, 26개 실패)**
- 이번 문서 정리 변경에서는 기존 26개 실패를 수정하지 않음.
