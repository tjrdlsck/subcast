# Testing Strategy: CHG-033-fix-monitor-text-overflow-truncation

## 1. 테스트 계획
- **자동화 테스트**: `tests/test_monitor_text_truncation_and_overflow.py` 생성 및 pytest / selenium / Playwright 또는 HTML CSS static assertion 테스트 실행.
- **수동 검증**: 브라우저에서 긴 성경 구절 / 찬양 가사 입력 후 `monitor.html`에서 텍스트가 박스 밖으로 가려지거나 무너지지 않고 말줄임표(`...`)로 깔끔하게 생략되는지 확인.

## 2. 성공 기준
- 텍스트가 긴 경우에도 모니터 박스를 벗어나 가려지지 않음.
- 기존 2줄 텍스트 렌더링 시 하단 잘림(bottom clipping) 미발생.
- automated test script pass (Exit Code 0).
