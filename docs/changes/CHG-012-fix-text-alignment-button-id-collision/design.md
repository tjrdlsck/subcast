# Change Design: CHG-012-fix-text-alignment-button-id-collision

## 1. 기술적 해결 방안 (Technical Solution)

### 1.1 HTML DOM ID 충돌 분리 (`frontend/editor.html`)
- "스타일 및 정렬" 패널의 텍스트 글자 정렬 버튼 ID:
  - `btn-align-left` (왼쪽 정렬)
  - `btn-align-center` (가운데 정렬)
  - `btn-align-right` (오른쪽 정렬)
- "정렬 및 배치" 패널의 캔버스 요소 배치 정렬 버튼 ID:
  - `btn-align-element-left` (캔버스 좌측 밀착)
  - `btn-align-center-h` (수평 중앙)
  - `btn-align-element-right` (캔버스 우측 밀착)
  - `btn-align-top`, `btn-align-center-v`, `btn-align-bottom`

### 1.2 모듈별 참조 ID 수정 (`editor-canvas.js`, `editor-init.js`)
- `editor-canvas.js`: `alignBtnIds` 배열에서 `btn-align-left` -> `btn-align-element-left`, `btn-align-right` -> `btn-align-element-right`로 갱신.
- `editor-init.js`: 캔버스 위치 정렬 `handleAlign` 등록 시 `btn-align-element-left` 및 `btn-align-element-right`를 조회하도록 수정하여 텍스트 정렬 이벤트(`setAlign`) 덮어쓰기 문제 해결.
