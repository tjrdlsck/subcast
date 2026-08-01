# Change Design: CHG-007-fix-syntax-and-monitor-canvas-ops

## 1. 기술적 해결 방안 (Technical Solution)

### 1.1 `editor-elements.js` 스크립트 구문 에러 및 전역 바인딩 수정
- `insertImageToCanvas` 함수 블록 끝 중괄호 `}` 누락 보완:
  ```javascript
  function insertImageToCanvas(file, x = null, y = null) {
      ...
  }
  ```
- 전역 스코프 바인딩 추가:
  ```javascript
  window.deleteElement = deleteElement;
  ```

### 1.2 무대 모니터 요소 조작(삭제, 잘라내기, 복사) 규칙 적용
- **가이드 텍스트 박스 보호**:
  - `isMonitorGuide: true` 인 객체는 삭제(`deleteElement`), 복사(`copy`), 잘라내기(`cut`) 대상에서 제외.
- **일반 사용자 객체 허용**:
  - 무대 모니터 캔버스에 추가된 일반 객체(도형, 이미지, 텍스트 등)는 슬라이드 캔버스와 동일하게 삭제(`deleteElement`), 잘라내기, 복사/붙여넣기가 모두 가능하도록 보장.
