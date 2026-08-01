# Technical Design: CHG-020-fix-text-stroke-paint-first

## 1. 개요 및 목적
텍스트 렌더링 시 테두리(stroke)가 글자 내부 영역을 침범하지 않고 글꼴 외곽 바깥쪽에만 표출되도록 Fabric.js 텍스트 객체 렌더링 옵션 `paintFirst: 'stroke'`를 적용 및 보장함.

## 2. 세부 설계 (Technical Detail)

### A. Fabric.js 렌더링 매커니즘 (`paintFirst`)
- Fabric.js의 `fabric.Text`, `fabric.Textbox` 객체는 기본적으로 `paintFirst = 'fill'` 순서로 그려짐.
- `paintFirst = 'fill'`:
  1. `fill`(글씨 내부 색상) 렌더링
  2. `stroke`(테두리) 렌더링 (경계선 중심에서 안쪽/바깥쪽으로 50% 분산되어 fill 위를 덮음)
- `paintFirst = 'stroke'`:
  1. `stroke`(테두리) 렌더링 (전체 두께로 렌더링)
  2. `fill`(글씨 내부 색상) 렌더링 (stroke의 안쪽 50% 영역을 fill이 깨끗하게 덮음)
  => 결과적으로 폰트 바깥쪽 50% stroke만 외부 테두리로 남아 글씨 안쪽에 선이 침범하지 않고 깔끔한 외곽선이 형성됨.

### B. 변경 대상 코드
1. **`frontend/js/modules/editor-elements.js`**:
   - `addText()` 함수에서 `new fabric.Textbox` 생성 시 `paintFirst: 'stroke'` 속성 추가.
2. **`frontend/js/modules/editor-monitor.js`**:
   - `enterMonitorMode()` 및 `applyMonitorSnapshot()`에서 `currentGuideBox`, `nextGuideBox` 생성 시 `paintFirst: 'stroke'` 속성 추가.
3. **`frontend/js/modules/editor-init.js`**:
   - `updateTextStrokeColor()` 및 새로 추가하는 `text-strokewidth` 이벤트 핸들러에서 텍스트 속성 조작 시 `currentEditingElement.set('paintFirst', 'stroke')` 설정.
   - UI `#text-strokewidth` 요소의 `oninput` 및 `onchange` 이벤트 핸들러를 바인딩하여 두께 변경 시 `strokeWidth` 및 `paintFirst: 'stroke'`가 즉시 반영되도록 구현.

## 3. 검증 계획
- 단위/통합 테스트 작성 (`tests/test_text_stroke_paint_first.py`):
  - 무대 모니터 텍스트박스 및 일반 에디터 텍스트 요소 직렬화/역직렬화 및 옵션 객체에 `paintFirst: 'stroke'`가 정상 부여되는지 검증.
