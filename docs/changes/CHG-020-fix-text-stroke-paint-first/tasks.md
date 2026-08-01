# Tasks Breakdown: CHG-020-fix-text-stroke-paint-first

## Task 1: 텍스트 생성부 `paintFirst: 'stroke'` 기본값 적용
- [x] `frontend/js/modules/editor-elements.js`: `addText()`에 `paintFirst: 'stroke'` 추가
- [x] `frontend/js/modules/editor-monitor.js`: `currentGuideBox` 및 `nextGuideBox` 생성 시 `paintFirst: 'stroke'` 추가

## Task 2: 에디터 속성 조작 및 이벤트 핸들러 강화
- [x] `frontend/js/modules/editor-init.js`: `updateTextStrokeColor` 함수 내 `currentEditingElement.set('paintFirst', 'stroke')` 설정 보장
- [x] `frontend/js/modules/editor-init.js`: `#text-strokewidth` 요소 `oninput`/`onchange` 이벤트 핸들러 구현하여 두께 및 `paintFirst` 동기화

## Task 3: 회귀 테스트 작성 및 종합 검증
- [x] `tests/test_text_stroke_paint_first.py` 작성 및 파이썬 테스트 실행 (3/3 통과)
- [x] `docs/project-state.md` 갱신
