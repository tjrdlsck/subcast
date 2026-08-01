# Change Request: CHG-007-fix-syntax-and-monitor-canvas-ops

## 1. 개요 (Overview)
에디터 무대 모니터 및 캔버스에서 발생하는 스크립트 구문/참조 에러를 해결하고, 무대 모니터 캔버스 내 요소들의 삭제, 잘라내기, 복사 동작 규칙을 정립합니다.

## 2. 변경 요청 내역 (Request Details)

### 2.1 콘솔 에러 해결
- `Uncaught SyntaxError: Unexpected end of input` (`editor-elements.js`)
- `Uncaught ReferenceError: addRect is not defined` (`editor-init.js:512`)
- `Uncaught ReferenceError: deleteElement is not defined` (`editor-clipboard.js:606`)

### 2.2 무대 모니터 캔버스 요소 조작 규칙
- 미리 생성된 현재용/다음용 가이드 텍스트 박스(`isMonitorGuide: true`)는 삭제, 잘라내기, 복사 대상에서 제외(보호).
- 가이드 텍스트 박스를 제외한 사용자가 무대 모니터 캔버스에 추가한 모든 나머지 요소(도형, 이미지, 일반 텍스트 등)는 삭제, 잘라내기, 복사/붙여넣기가 모두 가능해야 함.
