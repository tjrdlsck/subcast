# Change Design: CHG-045 무대 모니터 및 텍스트 속성 설정 창 줄간격(Line Height) 기능 개편

## 1. 설계 개요
- **목적**: 캔버스 상에서 선택된 텍스트 객체(일반 슬라이드 텍스트 및 무대 모니터 CURRENT/NEXT 자막 박스)의 줄간격(`lineHeight`)을 우측 속성 설정 창(`inspector-text-section`)에서 직접 확인하고 정밀하게 조절할 수 있도록 설계 개편.

## 2. UI 구조 및 요소 설계 (`frontend/editor.html`)
- **위치**: 우측 Inspector 패널 내 텍스트 서식 섹션 (`#inspector-text-section`) 내 '서체 및 크기' Row 바로 아래 배치.
- **HTML 구조**:
  ```html
  <div class="property-col" style="max-width: 100px;">
      <label for="text-lineheight">줄간격 (배수)</label>
      <input type="number" id="text-lineheight" class="fontSize-input" value="1.35" min="0.8" max="3.0" step="0.05" disabled>
  </div>
  ```

---

## 3. UI 바인딩 및 이벤트 설계 (`frontend/js/modules/editor-ui.js`)

1. **Inspector UI 바인딩 (`updateInspectorUI`)**:
   - 캔버스에서 텍스트 객체 선택 시:
     - `const lh = activeObj.lineHeight !== undefined ? activeObj.lineHeight : 1.35;`
     - `#text-lineheight` 입력 필드 활성화(`disabled = false`) 및 `value = parseFloat(lh).toFixed(2)` 지정.
2. **줄간격 변경 이벤트 핸들러 (`#text-lineheight`)**:
   - `input` / `change` 이벤트 감지 시:
     - 입력된 숫자(`lhVal`) 유효 범위(`0.8` ~ `3.0`) 클램핑.
     - `activeObj.set({ lineHeight: lhVal })`
     - `canvas.renderAll()`
     - 무대 모니터 가이드박스인 경우 `window.subcastMonitorEditor.notifyMonitorChanged()` 호출하여 `monitorSettings` 갱신 및 미리보기 방송.

---

## 4. 무대 모니터 연동 정리 (`frontend/js/modules/editor-monitor.js`)

- 좌측 패널 슬라이더 제거 및 깔끔한 DOM 구성.
- `enterMonitorMode()` 시 `currentGuideBox` 및 `nextGuideBox` 객체 생성 시 `lineHeight` 적용 유지.
- `syncCanvasToMonitorSettings()` 시 `currentGuideBox.lineHeight` 및 `nextGuideBox.lineHeight` 값을 `monitorSettings`에 실시간 수집 및 백엔드 저장.

---

## 5. 다음 단계
- 본 기술 변경 설계 문서(`design.md`) 승인 후 Phase 4 태스크 분해 문서(`tasks.md`)를 작성합니다.
