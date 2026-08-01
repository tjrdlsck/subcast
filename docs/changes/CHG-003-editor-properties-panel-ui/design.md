# Technical Design: CHG-003-editor-properties-panel-ui

## 1. 변경 대상 파일
- `frontend/editor.html`
- `frontend/css/editor.css`
- `frontend/js/modules/editor-canvas.js`
- `frontend/js/modules/editor-init.js`

## 2. 세부 설계
1. **`editor.html` & `editor.css`**:
   - `label` 텍스트 수정: `크기 (vw)` -> `크기 (px)`
   - `input#fontsize-editor`: `min="8" max="300" step="1" value="24"`
   - `property-row` 및 `color-picker-wrapper` 내의 테두리/그림자/블러 너비 배치 정돈
   - 패널 헤더에 `#btn-minimize-inspector` 닫기 버튼 추가
   - 화면 우측 상단에 `#btn-restore-inspector` 플로팅 동그라미 아이콘 버튼 추가
2. **`editor-canvas.js` & `editor-init.js`**:
   - 텍스트 선택 및 크기 조절 시 `activeObj.fontSize` 값을 px 단위로 표시 및 설정
   - 접기/펼치기 버튼 클릭 이벤트 핸들러 바인딩
