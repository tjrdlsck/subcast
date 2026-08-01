# Technical Design: CHG-005-monitor-guide-protection-and-font-width-fix

## 1. 세부 수정 설계
1. **`editor-monitor.js`**:
   - `currentGuideBox`, `nextGuideBox` 생성 시 `splitByGrapheme: true` 옵션 추가
   - `syncCanvasToMonitorSettings()`에서 `boxObj.set({ width: (widthPct / 100) * BASE_W, scaleX: 1, scaleY: 1 })`로 스케일 및 너비 정규화
2. **`editor-init.js`**:
   - `fontsize-editor` 조작 시 `isMonitorGuide` 요소는 원래 설정된 너비(`widthPct`)를 유지하도록 폭 고정
3. **`editor-elements.js` & `editor-clipboard.js`**:
   - `deleteElement()`에 `if (activeObj && activeObj.isMonitorGuide) return;` 추가
   - 복사/잘라내기 이벤트 시 `isMonitorGuide` 요소는 복사/잘라내기 금지
4. **`editor.html`**:
   - `#btn-delete` (개체 삭제 버튼) HTML 요소 제거
