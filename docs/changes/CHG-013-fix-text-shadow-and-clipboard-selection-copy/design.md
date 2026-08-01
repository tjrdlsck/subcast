# Change Design: CHG-013-fix-text-shadow-and-clipboard-selection-copy

## 1. 기술적 해결 방안 (Technical Solution)

### 1.1 글자 그림자 효과 이벤트 및 조작 연동 (`editor-init.js`, `editor-history.js`)
- `editor-init.js`에서 `text-shadow-enabled` 체크박스 `onchange` 이벤트 수신기 등록:
  - 체크 시 `fabric.Shadow` 객체를 생성하여 현재 선택 텍스트 요소(`currentEditingElement`)의 `shadow` 속성에 대입.
  - 체크 해제 시 `shadow` 속성을 `null`로 지정.
  - `text-shadow-blur`, `text-shadow-offsetx`, `text-shadow-offsety` 실시간 조절 수신기 등록.
- `editor-history.js`의 `serializeElement` 및 `deserializeElement`에서 그림자 데이터(`color`, `blur`, `offsetX`, `offsetY`) 보존.

### 1.2 텍스트 선택 복사 가로채기 방지 (`editor-init.js`)
- `editor-init.js`의 global `keydown` 단축키 핸들러 상단에 텍스트 선택 여부 검사 추가:
  ```javascript
  const hasTextSelection = window.getSelection() && window.getSelection().toString().trim().length > 0;
  const isEditableElement = document.activeElement && (
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) ||
      document.activeElement.isContentEditable
  );
  if (hasTextSelection || isEditableElement) {
      return;
  }
  ```
- 이를 통해 화면 텍스트를 드래그하여 선택한 상태에서 Ctrl+C / Ctrl+X 누를 때 슬라이드 JSON 쓰기를 건너뛰고 브라우저 기본 순수 텍스트 복사 동작을 수행.
