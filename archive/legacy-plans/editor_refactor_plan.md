# 📋 [frontend/js/editor.js] 모듈화 및 리팩토링 수행 지침서

> 본 문서는 `REFACTOR_PROMPT_TEMPLATE.md` 표준 규격에 맞추어 작성된 **`frontend/js/editor.js` (7,401 라인)** 거대 거대 모듈의 단계별 분리 및 리팩토링 계획서입니다.  
> 2단계 실행 AI(Codex CLI, Claude Code, AGY CLI 등)가 본 지침서를 바탕으로 작업을 수행할 경우, **100% 성공률과 오류 없는 모듈 추출**을 보장합니다.

---

## 🏗️ 총괄 분리 아키텍처 요약 (Architecture Overview)

`frontend/js/editor.js`는 대규모 프론트엔드 편집기 로직이 단일 파일에 밀집되어 있습니다. 관심사 분리(Separation of Concerns, SoC) 원칙에 따라 다음과 같이 5개의 독립된 도메인 모듈로 분할합니다.

| 모듈 파일명 | 담당 기능 및 영역 | 원본 줄 번호 (approx.) |
| :--- | :--- | :--- |
| **`frontend/js/modules/editor-clipboard.js`** | 슬라이드 복사/잘라내기/붙여넣기/복제 및 컨텍스트 메뉴 | L2969 ~ L3577 |
| **`frontend/js/modules/editor-bible.js`** | 성경 구절 검색, 메인 뷰어 및 슬라이드 동적 생성 연동 | L3578 ~ L4708 |
| **`frontend/js/modules/editor-praise.js`** | 찬양 가사 라이브러리 검색, DB 관리 및 슬라이드 생성 | L4709 ~ L6082 |
| **`frontend/js/modules/editor-stage-bg.js`** | 현장 모니터 배경 연출, 무드 카테고리, PiP 미리보기 | L6083 ~ L6996 |
| **`frontend/js/modules/editor-monitor.js`** | 현장 모니터 전용 레이아웃 편집기 & Fabric 캔버스 동기화 | L6997 ~ L7401 |

---

## 📌 [모듈 1] 슬라이드 클립보드 & 컨텍스트 메뉴 지침서

### 1. 작업 개요 (Overview)
- 원본 파일 (Source): `frontend/js/editor.js`
- 신규 모듈 파일 (Destination): `frontend/js/modules/editor-clipboard.js`

### 2. 모듈 이관 대상 (Extraction Targets)
`editor.js`에서 다음 함수 및 이벤트 핸들러를 신규 모듈로 추출할 것:
1. `copySelectedSlides()`
2. `cutSelectedSlides()`
3. `pasteSlidesFromClipboard()`
4. `duplicateSelectedSlides()`
5. `deleteSelectedSlidesWithConfirm()`
6. `showSlideContextMenu(x, y)`
7. `hideSlideContextMenu()`

### 3. 동반 이관 의존성 (Included Dependencies)
- **전역 변수 / 상태 (Global Variables)**:
  - `slideClipboard` (클립보드 데이터 임시 저장용)
- **외부 참조 (External Dependencies)**:
  - `projectData`, `selectedSlideIds`, `activeSlideId`, `myEditorId`, `ws`
  - `renderSlides()`, `selectSlideForEdit()`, `setSlideDirty()`, `triggerAutoSave()`

### 4. 아키텍처 및 인터페이스 규칙 (Strict Rules)
1. **[인터페이스 유지]**: 이관되는 함수명의 서명(Signature)과 매개변수 타입을 변경하지 말 것.
2. **[순환 참조 금지]**: `editor-clipboard.js`에서 `editor.js`를 역 참조(`import`)하지 않고, 필요한 전역 객체(`projectData`, `ws` 등)는 `window` 스코프 또는 모듈 파라미터 전달 방식을 활용할 것.
3. **[원본 파일 갱신]**: `editor.js` 상단에 `<script src="js/modules/editor-clipboard.js"></script>` 형태로 바인딩하거나 ES Module `import`를 적용하고 기존 바디 코드는 제거할 것.
4. **[코드 생략 금지]**: `...`이나 생략 주석 없이 실행 가능한 완전한 Full Code로 이관할 것.

### 5. 실행 결과 검증 (Verification)
- 우클릭 메뉴 호출 및 `Ctrl+C / Ctrl+V` 키 조합을 통한 슬라이드 복사/붙여넣기 기능 정상 동작 검증.

---

## 📌 [모듈 2] 성경 통합 모듈 지침서

### 1. 작업 개요 (Overview)
- 원본 파일 (Source): `frontend/js/editor.js`
- 신규 모듈 파일 (Destination): `frontend/js/modules/editor-bible.js`

### 2. 모듈 이관 대상 (Extraction Targets)
`editor.js`에서 다음 성경 관련 함수군을 신규 모듈로 추출할 것:
1. `initBibleFeature()`
2. `fetchBibleBooks()`
3. `searchBibleVerses()`
4. `renderBibleSearchResults()`
5. `showBibleMainViewer()`
6. `hideBibleMainViewer()`
7. `renderBibleMainViewerContent()`
8. `insertBibleSlides()`
9. `updateBibleExpectedCount()`
10. `toggleSelectAllBibleVerses()`

### 3. 동반 이관 의존성 (Included Dependencies)
- **전역 변수 / 상태 (Global Variables)**:
  - `selectedBibleVerses`
  - `bibleBooksList`
  - `lastFilteredBooks`
  - `tempBibleSlidesToAdd`
  - `targetInsertAfterSlideId`
- **외부 참조 (External Dependencies)**:
  - API 엔드포인트: `/api/bible/books`, `/api/bible/search`
  - DOM 요소: `#panel-bible`, `#select-bible-version`, `#input-bible-search` 등
  - UI 렌더러: `renderSlides()`, `selectSlideForEdit()`

### 4. 아키텍처 및 인터페이스 규칙 (Strict Rules)
1. **[인터페이스 유지]**: 성경 검색 및 슬라이드 삽입 함수의 시그니처와 데이터 반환 포맷을 엄격 유지할 것.
2. **[순환 참조 금지]**: 신규 성경 모듈이 `editor.js` 내부 상태를 변경할 때는 공개된 상태 변경 함수(`renderSlides()`)만 호출할 것.
3. **[코드 생략 금지]**: 생략 주석 없이 실행 가능한 Full Code로 작성할 것.

### 5. 실행 결과 검증 (Verification)
- 성경 탭 전환, 번역본/성경책 검색 및 선택한 절들의 캔버스 슬라이드 자동 생성 동작 검증.

---

## 📌 [모듈 3] 찬양 가사통합 모듈 지침서

### 1. 작업 개요 (Overview)
- 원본 파일 (Source): `frontend/js/editor.js`
- 신규 모듈 파일 (Destination): `frontend/js/modules/editor-praise.js`

### 2. 모듈 이관 대상 (Extraction Targets)
`editor.js`에서 다음 찬양 가사 관련 함수군을 신규 모듈로 추출할 것:
1. `initPraiseFeature()`
2. `searchPraiseSongs()`
3. `renderPraiseSongList()`
4. `showPraiseMainViewer()`
5. `hidePraiseMainViewer()`
6. `generatePraiseSlides()`
7. `updatePraiseExpectedCount()`
8. `toggleSelectAllPraiseSongs()`
9. `savePraiseSongToLibrary()`
10. `deletePraiseSongFromLibrary()`

### 3. 동반 이관 의존성 (Included Dependencies)
- **전역 변수 / 상태 (Global Variables)**:
  - `tempPraiseSlidesToAdd`
  - `activeSelectedPraiseSong`
  - `selectedPraiseSongs`
  - `currentPraiseSongsList`
  - `lastSelectedPraiseIndex`
  - `currentEditingPraiseSong`
  - `praiseClipboardData`
- **외부 참조 (External Dependencies)**:
  - `colorToHex()`, `projectData`, `ws`, `renderSlides()`

### 4. 아키텍처 및 인터페이스 규칙 (Strict Rules)
1. **[인터페이스 유지]**: 가사 분할 및 세트리스트 슬라이드 생성 로직의 파라미터 구조 보존.
2. **[독립성 보장]**: 찬양 모듈 내부 데이터 파싱 로직을 캡슐화(Encapsulation)하여 메인 캔버스 렌더러와 독립시킬 것.
3. **[코드 생략 금지]**: 완전한 Full Code로 작성할 것.

### 5. 실행 결과 검증 (Verification)
- 찬양 검색, 악보/가사 미리보기 및 템플릿 기반 슬라이드 일괄 생성 검증.

---

## 📌 [모듈 4] 현장 배경 연출 & PiP 미리보기 모듈 지침서

### 1. 작업 개요 (Overview)
- 원본 파일 (Source): `frontend/js/editor.js`
- 신규 모듈 파일 (Destination): `frontend/js/modules/editor-stage-bg.js`

### 2. 모듈 이관 대상 (Extraction Targets)
`editor.js`에서 다음 배경 처리 및 PiP 관련 함수군을 신규 모듈로 추출할 것:
1. `updateStageBgGridColumns()`
2. `saveStageBgLibraryData()`
3. `initStageBgMoodModalEvents()`
4. `showStageBgMainViewer()`
5. `hideStageBgMainViewer()`
6. `filterAndRenderStageBgLibrary()`
7. `applyAndBroadcastStageBg()`
8. `initPipPreview()`
9. `initPipDragging()`
10. `initPipResizing()`
11. `updatePipCanvasDimensions()`
12. `updatePipBgLayer()`
13. `startPipAmbientLoop()`
14. `updatePipSlideOverlay()`

### 3. 동반 이관 의존성 (Included Dependencies)
- **전역 변수 / 상태 (Global Variables)**:
  - `currentStageBg`, `allStageBgFiles`, `selectedStageBgFiles`, `stageBgClipboardFiles`
  - `lastSelectedStageBgIndex`, `_renderedStageBgFiles`, `pipAmbientAnimId`
  - `stageBgGridMinSize`, `_stageBgMoodTargets`, `pipTempCanvas`, `isPipUpdating`
- **외부 참조 (External Dependencies)**:
  - Fabric.js (`fabric.StaticCanvas`), `BASE_WIDTH`, `BASE_HEIGHT`, `ws`

### 4. 아키텍처 및 인터페이스 규칙 (Strict Rules)
1. **[인터페이스 유지]**: PiP 캔버스 업데이트 및 무드 배경 브로드캐스팅 함수 서명 변경 금지.
2. **[순환 참조 금지]**: 메인 Fabric 캔버스와 PiP 캔버스 간 루프가 발생하지 않도록 렌더링 동기화 플래그(`isPipUpdating`) 유지.
3. **[코드 생략 금지]**: 완전한 Full Code 이관.

### 5. 실행 결과 검증 (Verification)
- 현장 배경 설정 변경 브로드캐스팅 및 실시간 PiP 화면 드래그/리사이즈 동작 검증.

---

## 📌 [모듈 5] 현장 모니터 레이아웃 편집기 모듈 지침서

### 1. 작업 개요 (Overview)
- 원본 파일 (Source): `frontend/js/editor.js`
- 신규 모듈 파일 (Destination): `frontend/js/modules/editor-monitor.js`

### 2. 모듈 이관 대상 (Extraction Targets)
`editor.js`에서 다음 모니터 편집기 함수군을 신규 모듈로 추출할 것:
1. `syncMonitorNumericInputs()`
2. `bindMonitorCanvasEvents()`
3. `createMonitorBox()`
4. `loadMonitorCanvasToEditor()`
5. `updateMonitorEditorSettings()`
6. `applyMonitorNumericInputs()`
7. `alignMonitorCanvasBoxes()`
8. `saveMonitorSettingsFromEditor()`
9. `resetMonitorCanvasLayout()`
10. `restoreNormalCanvas()`

### 3. 동반 이관 의존성 (Included Dependencies)
- **전역 변수 / 상태 (Global Variables)**:
  - `isMonitorEditMode`
- **외부 참조 (External Dependencies)**:
  - `canvas`, `BASE_WIDTH`, `BASE_HEIGHT`, `fitCanvasToScreen()`, `setControlsState()`, `ws`

### 4. 아키텍처 및 인터페이스 규칙 (Strict Rules)
1. **[인터페이스 유지]**: 모니터 박스 생성 및 좌표 동기화 인터페이스 보존.
2. **[상태 격리]**: 일반 슬라이드 편집 모드와 모니터 레이아웃 편집 모드 전환 플래그(`isMonitorEditMode`)의 정확한 롤백 보장.
3. **[코드 생략 금지]**: 완전한 Full Code 작성.

### 5. 실행 결과 검증 (Verification)
- 모니터 탭 클릭 시 전용 캔버스 전환, 요소 위치/크기 조정 및 저장/원복 기능 검증.

---

## 🧪 6. 통합 검증 및 원본(Source) 파일 리팩토링 규칙 (Post-Verification)

1. **`editor.js` 주 모듈의 역할 전환**:
   - `editor.js`는 이제 핵심 Fabric.js 캔버스 초기화(`initCanvas`), Undo/Redo (`saveStateToHistory`), WebSocket 데이터 동기화(`performAutoSave`) 및 이벤트 루프 제어만 담당하는 코어 파일로 축소됩니다. (7,401 라인 ➔ 약 1,500 라인으로 대폭 축소)
2. **스크립트 로딩 순서 지정 (HTML 또는 ES Modules)**:
   ```html
   <!-- 의존성 모듈 선 로딩 -->
   <script src="js/modules/editor-clipboard.js"></script>
   <script src="js/modules/editor-bible.js"></script>
   <script src="js/modules/editor-praise.js"></script>
   <script src="js/modules/editor-stage-bg.js"></script>
   <script src="js/modules/editor-monitor.js"></script>
   <!-- 코어 편집기 엔진 -->
   <script src="js/editor.js"></script>
   ```
3. **구문 검증 (Syntax Verification)**:
   - `node --check frontend/js/editor.js` 및 분리된 5개 모듈 파일에 대해 JavaScript 구문 오류(SyntaxError) 없는지 자동 검사 수행.
