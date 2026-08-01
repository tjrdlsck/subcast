# Technical Design: CHG-021-fix-monitor-properties-sync-and-rendering

## 1. 개요 및 목적
무대 모니터 탭에서 텍스트 속성 설정 변경 시, 에디터 미리보기 및 외부 모니터링 페이지(`monitor.html`)로 텍스트 테두리 색상, 테두리 두께, 글꼴 스타일, 투명도 등의 모든 속성이 실시간으로 완벽하게 동기화되고 렌더링되도록 개선함.

## 2. 세부 설계 (Technical Detail)

### A. 에디터 속성 설정 핸들러 연동 (`editor-history.js`)
- `saveStateToHistory()` 호출 시:
  ```javascript
  if (window.subcastMonitorEditor && window.subcastMonitorEditor.isMonitorMode && window.subcastMonitorEditor.isMonitorMode()) {
      if (typeof window.subcastMonitorEditor.saveMonitorStateToHistory === 'function') {
          window.subcastMonitorEditor.saveMonitorStateToHistory();
      }
      return;
  }
  ```
- 이렇게 변경하여 에디터 속성 패널에서 색상, 테두리, 두께 등을 변경할 때 호출되는 `saveStateToHistory()`가 무대 모니터 모드에서도 `saveMonitorStateToHistory()`를 정상 작동시켜 캔버스 동기화 및 실시간 브로드캐스트 메시지(`MONITOR_PREVIEW_UPDATE`)를 발송함.

### B. 무대 모니터 속성 직렬화/복원 확장 (`editor-monitor.js`)
- `syncCanvasToMonitorSettings()` 내 `updateBox`:
  - `strokeColor`: `colorToHex(boxObj.stroke)` 또는 `boxObj.stroke || 'transparent'`
  - `strokeWidth`: `boxObj.strokeWidth || 0`
  - `fontStyle`: `boxObj.fontStyle || 'normal'`
  - `opacity`: `boxObj.opacity !== undefined ? boxObj.opacity : 1.0`
- `currentGuideBox` 및 `nextGuideBox` 생성 시:
  - `stroke`: `cur.strokeColor || 'transparent'`
  - `strokeWidth`: `cur.strokeWidth || 0`
  - `fontStyle`: `cur.fontStyle || 'normal'`
  - `opacity`: `cur.opacity !== undefined ? cur.opacity : 1.0`
  - `paintFirst: 'stroke'`

### C. 모니터링 뷰어 CSS 파이프라인 확장 (`viewer.js`)
- `renderMonitorViewerLayout()`:
  - `curText` 및 `nxtText` 스타일 렌더링 시:
    ```javascript
    if (box.strokeColor && box.strokeColor !== 'transparent' && box.strokeWidth > 0) {
        const scaledStroke = box.strokeWidth * scale;
        elText.style.webkitTextStroke = `${scaledStroke}px ${box.strokeColor}`;
        elText.style.paintOrder = 'stroke fill';
    } else {
        elText.style.webkitTextStroke = '0px transparent';
    }
    if (box.fontStyle) elText.style.fontStyle = box.fontStyle;
    if (box.opacity !== undefined) elText.style.opacity = box.opacity;
    ```

## 3. 검증 계획
- 자동화 단위 테스트 작성 (`tests/test_monitor_properties_sync.py`):
  - 무대 모니터 설정 객체의 `strokeColor`, `strokeWidth`, `fontStyle`, `opacity` 직렬화 및 `saveStateToHistory` 연동 정적/로직 검증.
