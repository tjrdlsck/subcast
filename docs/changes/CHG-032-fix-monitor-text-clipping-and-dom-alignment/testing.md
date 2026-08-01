# Testing Strategy: CHG-032-fix-monitor-text-clipping-and-dom-alignment

## 1. 검증 목표
- 무대 모니터링 페이지(`monitor.html`, `viewer.html`) 및 에디터 무대 모니터 미리보기 화면에서 2번째 줄 글씨 및 받침 획(Descender) 잘림이 100% 해소되었는지 검증.
- 캔버스(Fabric.js Textbox)의 2줄 높이 렌더링 상태와 DOM 미리보기의 렌더링 상태 간 수직 정합성 및 행간(`line-height: 1.20`) 일치성 검증.

## 2. 테스트 스크립트 작성 계획
- `tests/test_monitor_text_clipping_and_alignment.py`
  - `viewer.css`, `monitor.html`, `viewer.html`, `viewer.js`, `editor-monitor.js` 파일 검사를 실시하여 `overflow: visible`, `max-height: none`, `-webkit-line-clamp: unset`, `line-height: 1.20` 적용 여부 검증.

## 3. 회귀 테스트 수순
- `pytest tests/` 전체 스위트 실행하여 기존 백엔드/프론트엔드 테스트 성공 유지 확인.
