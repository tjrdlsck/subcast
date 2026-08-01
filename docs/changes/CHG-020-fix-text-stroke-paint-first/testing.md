# Testing Strategy: CHG-020-fix-text-stroke-paint-first

## 1. 자동화 테스트 계획
- `tests/test_text_stroke_paint_first.py`
  - 에디터 모듈 JS 소스파일 내 `paintFirst: 'stroke'` 옵션 명시 여부 정적 검증
  - `editor-elements.js`, `editor-monitor.js`, `editor-init.js` 파일 내 `paintFirst` 및 `text-strokewidth` 이벤트 바인딩 검증

## 2. 수동 검증 계획
- 에디터 실행 후 무대 모니터 탭 클릭
- 무대 모니터 CURRENT/NEXT 텍스트 선택 후 속성 설정 패널에서 테두리 색상 및 두께 설정
- 캔버스 상에서 글씨 내부를 가리지 않고 글꼴 외곽 바깥쪽에만 깔끔하게 테두리가 생기는지 시각적 확인
