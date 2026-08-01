# Testing Strategy: CHG-021-fix-monitor-properties-sync-and-rendering

## 1. 자동화 테스트 계획
- `tests/test_monitor_properties_sync.py`
  - `editor-history.js`에서 `saveMonitorStateToHistory()` 호출 포함 검증
  - `editor-monitor.js`에서 `strokeColor`, `strokeWidth`, `fontStyle`, `opacity` 속성 동기화 포함 검증
  - `viewer.js`에서 `-webkit-text-stroke`, `paint-order`, `fontStyle`, `opacity` CSS 적용 포함 검증

## 2. 수동 검증 계획
- 무대 모니터 탭 클릭 후 CURRENT / NEXT 가이드 텍스트 박스 선택
- 속성 패널에서 글꼴 색상, 테두리 색상, 테두리 두께, 기울임꼴(Italic), 투명도 등 변경
- 실시간 미리보기 및 외부 모니터링 페이지(`monitor.html`) 창을 새로 열어 동기화 여부 확인
