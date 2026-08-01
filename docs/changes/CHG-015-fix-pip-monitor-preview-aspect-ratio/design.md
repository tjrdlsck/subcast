# Design: PIP 미리보기 박스 비율 계산 및 줄바꿈 일치 수정 (CHG-015)

## 1. 기술적 변경 설계

### 1) 폰트 크기 비율 계산 정밀도 개선 (Floating Point Font Scale)
- `frontend/js/viewer.js` 내 `renderMonitorViewerLayout()`:
  - 기존:
    ```javascript
    const fontSize = Math.round((cur.fontSize || 28) * (screenW / 768));
    ```
  - 변경:
    ```javascript
    const fontScale = screenW / 768;
    const fontSize = (cur.fontSize || 28) * fontScale;
    curText.style.fontSize = `${fontSize}px`;
    ```
  - 반올림(`Math.round`)으로 인해 약 280~320px 너비의 PIP 박스에서 폰트 크기가 너비 축소율 대비 커지는 오차 제거.

### 2) 글자 단위 줄바꿈 규칙 통일 (Word Break Rule Alignment)
- 에디터 메인 캔버스 Fabric.js Textbox의 `splitByGrapheme: true` 옵션과 부합되도록, `viewer.js`의 DOM 요소에 `word-break: break-all` 및 `overflow-wrap: anywhere` 적용:
  - `#monitor-current-text`, `#monitor-next-text`:
    ```javascript
    curText.style.wordBreak = 'break-all';
    curText.style.overflowWrap = 'anywhere';
    ```
  - `renderMonitorCustomElements()` 내 text 타입 element:
    ```javascript
    el.style.fontSize = `${(parseFloat(elem.style?.fontSize) || 20) * (screenW / 768)}px`;
    el.style.wordBreak = 'break-all';
    el.style.overflowWrap = 'anywhere';
    ```

### 3) DOM HTML 스타일 보장 (`frontend/monitor.html`)
- `#monitor-current-text` 및 `#monitor-next-text`에 기본 inline style로 `word-break: break-all; overflow-wrap: anywhere;` 추가.
