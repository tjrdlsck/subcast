# Testing Strategy: CHG-007-fix-syntax-and-monitor-canvas-ops

## 1. 검증 전략 (Testing Strategy)

### 1.1 단위/통합 구문 검증
- Node.js 스크립트를 통한 `frontend/js/modules/editor-elements.js`, `editor-clipboard.js`, `editor-init.js` JS 구문 파싱 검증 (`node --check`).

### 1.2 수동 동작 시나리오 검증
1. 에디터 페이지 및 무대 모니터 탭 접속 시 브라우저 콘솔에 `SyntaxError` 및 `addRect`, `deleteElement` 관련 `ReferenceError`가 일어나지 않는지 확인.
2. 무대 모니터 캔버스에서:
   - 가이드 자막 박스(현재용/다음용) 선택 후 Delete 키 / 삭제 / 복사 / 잘라내기 시 변경이 차단되고 보호되는지 확인.
   - 사용자 추가 도형(사각형 등) 선택 후 Delete 키 / 삭제 / 복사 / 잘라내기 / 붙여넣기가 정상 작동하는지 확인.
