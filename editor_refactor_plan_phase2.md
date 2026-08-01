# 📋 [frontend/js/editor.js] 2차 모듈화 및 리팩토링 수행 지침서 (Phase 2)

> 본 문서는 `REFACTOR_PROMPT_TEMPLATE.md` 표준 규격에 맞추어 작성된 **`frontend/js/editor.js` (남은 2,968 라인)** 2차 분리 계획서입니다.  
> 2단계 실행 AI(Codex CLI, Claude Code, AGY CLI 등)가 본 지침서를 바탕으로 작업을 수행할 경우, **`editor.js`를 500 라인 미만의 순수 진입점(Entrypoint)으로 슬림화**하고 100% 성공적인 모듈 추출을 보장합니다.

---

## 🏗️ 2차 분리 아키텍처 요약 (Architecture Overview Phase 2)

| 모듈 파일명 | 담당 기능 및 영역 | 원본 줄 번호 (approx.) |
| :--- | :--- | :--- |
| **`frontend/js/modules/editor-canvas.js`** | Fabric.js 캔버스 생성, Zoom/Fit, 초기화 및 오브젝트 상태 선택 이벤트 | L133 ~ L286, L889 ~ L1152 |
| **`frontend/js/modules/editor-history.js`** | Undo / Redo 상태 기록, 요소 직렬화/역직렬화 및 히스토리 스택 | L533 ~ L609, L710 ~ L765, L1497 |
| **`frontend/js/modules/editor-sync.js`** | WebSocket 실시간 브로드캐스팅, AutoSave, 동시 편집 락(Lock) 제어 | L35 ~ L56, L527 ~ L532, L610 ~ L684, L1660 ~ L1891 |
| **`frontend/js/modules/editor-elements.js`** | 텍스트/도형/이미지 요소 추가, 레이어 순서 변경, 그룹화 및 개체 삭제 | L1153 ~ L1259, L1892 ~ L2034, L2882 ~ L2968 |
| **`frontend/js/modules/editor-template.js`** | 템플릿 저장/삭제, 템플릿 목록 렌더링 및 일괄 적용 모달 제어 | L1307 ~ L1496, L1506 ~ L1621 |

---

## 📌 [모듈 1] Fabric.js 캔버스 엔진 모듈 지침서

### 1. 작업 개요 (Overview)
- 원본 파일 (Source): `frontend/js/editor.js`
- 신규 모듈 파일 (Destination): `frontend/js/modules/editor-canvas.js`

### 2. 모듈 이관 대상 (Extraction Targets)
`editor.js`에서 다음 캔버스 엔진 함수군을 신규 모듈로 추출할 것:
1. `initCanvas()`
2. `setCanvasZoom(zoom)`
3. `fitCanvasToScreen()`
4. `loadSlideToCanvas(slide)`
5. `onObjectSelected(e)`
6. `onObjectCleared()`
7. `onObjectModified(e)`
8. `cancelEditing()`

### 3. 동반 이관 의존성 (Included Dependencies)
- Required Imports / External References: Fabric.js (`fabric.Canvas`), `BASE_WIDTH`, `BASE_HEIGHT`
- Global Variables / Constants: `canvas`, `currentZoom`
- Helper Functions: `updateInspectorCoords()`, `updateLayerList()`, `setControlsState()`

### 4. 아키텍처 및 인터페이스 규칙 (Strict Rules)
1. **[인터페이스 유지]**: 이관되는 함수 서명 및 캔버스 이벤트 리스너 파라미터를 보존할 것.
2. **[순환 참조 금지]**: `editor-canvas.js` 내부에서 전역 `canvas` 객체를 파라미터 전달 또는 전역 윈도우 스코프로 안전하게 공유할 것.
3. **[원본 파일 갱신]**: `editor.js` 내 대상 함수 코드를 제거하고 연동할 것.
4. **[코드 생략 금지]**: 생략 주석 없이 완전한 Full Code로 작성할 것.

### 5. 실행 결과 검증 (Verification)
- 캔버스 렌더링, 윈도우 리사이즈 시 화면 핏ting, 개체 클릭 시 인스펙터 좌표 동기화 검증.

---

## 📌 [모듈 2] Undo / Redo 히스토리 엔진 모듈 지침서

### 1. 작업 개요 (Overview)
- 원본 파일 (Source): `frontend/js/editor.js`
- 신규 모듈 파일 (Destination): `frontend/js/modules/editor-history.js`

### 2. 모듈 이관 대상 (Extraction Targets)
`editor.js`에서 다음 히스토리 관리 함수군을 신규 모듈로 추출할 것:
1. `saveStateToHistory()`
2. `undo()`
3. `redo()`
4. `applyStateToCanvas(state)`
5. `serializeElement(obj)`
6. `deserializeElement(data)`
7. `undoBulkAction()`

### 3. 동반 이관 의존성 (Included Dependencies)
- Required Imports / External References: `canvas`
- Global Variables / Constants: `undoStack`, `redoStack`, `MAX_HISTORY_LIMIT`
- Helper Functions: `setSlideDirty()`, `triggerAutoSave()`, `renderSlides()`

### 4. 아키텍처 및 인터페이스 규칙 (Strict Rules)
1. **[인터페이스 유지]**: `undo()`, `redo()`의 외부 인터페이스 변경 금지.
2. **[상태 격리]**: 스택 오버플로우 방지를 위한 `MAX_HISTORY_LIMIT` 캡슐화 유지.
3. **[코드 생략 금지]**: 실행 가능한 완전한 Full Code 작성.

### 5. 실행 결과 검증 (Verification)
- `Ctrl+Z` / `Ctrl+Y` 및 Undo/Redo 버튼 클릭 시 캔버스 요소 복원 및 렌더링 정상 작동 검증.

---

## 📌 [모듈 3] WebSocket & AutoSave 실시간 동기화 모듈 지침서

### 1. 작업 개요 (Overview)
- 원본 파일 (Source): `frontend/js/editor.js`
- 신규 모듈 파일 (Destination): `frontend/js/modules/editor-sync.js`

### 2. 모듈 이관 대상 (Extraction Targets)
`editor.js`에서 다음 동기화 및 자동저장 함수군을 신규 모듈로 추출할 것:
1. `connectWebSocket()`
2. `performAutoSave()`
3. `triggerAutoSave()`
4. `setSlideDirty()`
5. `updateAutoSaveStatus(status)`
6. `releaseActiveLock()`
7. `checkIsLockedByOthers(slideId)`
8. `handleOffline()`
9. `handleOnline()`

### 3. 동반 이관 의존성 (Included Dependencies)
- Required Imports / External References: WebSocket API (`ws`), Backend API (`/api/projects/save`)
- Global Variables / Constants: `isDirty`, `autoSaveTimer`, `myEditorId`, `activeLockInfo`
- Helper Functions: `serializeElement()`

### 4. 아키텍처 및 인터페이스 규칙 (Strict Rules)
1. **[인터페이스 유지]**: WebSocket 메시지 핸들러 및 AutoSave 트리거 서명 보존.
2. **[독립성 보장]**: 오프라인/온라인 상태 감지 및 재연결 로직 모듈 내부 관리.
3. **[코드 생략 금지]**: 생략 없이 완전한 Full Code 작성.

### 5. 실행 결과 검증 (Verification)
- 요소 수정 시 AutoSave 상단 상태 표시 변경 및 네트워크 브로드캐스트 검증.

---

## 📌 [모듈 4] 개체 생성 & 레이어 조작 모듈 지침서

### 1. 작업 개요 (Overview)
- 원본 파일 (Source): `frontend/js/editor.js`
- 신규 모듈 파일 (Destination): `frontend/js/modules/editor-elements.js`

### 2. 모듈 이관 대상 (Extraction Targets)
`editor.js`에서 다음 개체 생성/조작 함수군을 신규 모듈로 추출할 것:
1. `addTextTpl()`
2. `addRect()`
3. `addCircle()`
4. `addTriangle()`
5. `addLine()`
6. `insertImageToCanvas(url)`
7. `deleteElement()`
8. `layerUp()`
9. `layerDown()`
10. `layerFront()`
11. `layerBack()`
12. `groupObjects()`
13. `ungroupObjects()`

### 3. 동반 이관 의존성 (Included Dependencies)
- Required Imports / External References: Fabric.js 개체 생성자 (`fabric.IText`, `fabric.Rect`, `fabric.Group` 등)
- Global Variables / Constants: `canvas`
- Helper Functions: `saveStateToHistory()`, `updateLayerList()`, `setSlideDirty()`

### 4. 아키텍처 및 인터페이스 규칙 (Strict Rules)
1. **[인터페이스 유지]**: 도형 및 텍스트 추가 시 인자 구조 유지.
2. **[원본 파일 갱신]**: 원본 파일 내 관련 함수를 제거하고 모듈 연결.
3. **[코드 생략 금지]**: Full Code 작성.

### 5. 실행 결과 검증 (Verification)
- 툴바 텍스트/도형/이미지 버튼 클릭 시 캔버스 내 개체 추가, 레이어 순서 변경, 그룹화 동작 검증.

---

## 📌 [모듈 5] 템플릿 시스템 & 일괄 적용 모듈 지침서

### 1. 작업 개요 (Overview)
- 원본 파일 (Source): `frontend/js/editor.js`
- 신규 모듈 파일 (Destination): `frontend/js/modules/editor-template.js`

### 2. 모듈 이관 대상 (Extraction Targets)
`editor.js`에서 다음 템플릿 관리 함수군을 신규 모듈로 추출할 것:
1. `saveAsTemplate()`
2. `deleteTemplate(templateId)`
3. `renderTemplates()`
4. `renderModalSlides()`
5. `applyTemplateBulk()`
6. `confirmApplyTemplate()`
7. `closeApplyModal()`
8. `selectTemplate(templateId)`
9. `updateTemplateActionButtons()`

### 3. 동반 이관 의존성 (Included Dependencies)
- Required Imports / External References: LocalStorage / API 템플릿 데이터
- Global Variables / Constants: `userTemplates`, `selectedTemplateId`
- Helper Functions: `renderSlides()`, `loadSlideToCanvas()`

### 4. 아키텍처 및 인터페이스 규칙 (Strict Rules)
1. **[인터페이스 유지]**: 템플릿 렌더링 및 모달 확인 콜백 보존.
2. **[코드 생략 금지]**: 생략 주석 없이 Full Code 작성.

### 5. 실행 결과 검증 (Verification)
- 현재 슬라이드를 템플릿으로 저장, 템플릿 라이브러리 선택 및 다중 슬라이드 일괄 디자인 적용 검증.

---

## 🧪 6. 최종 2차 통합 후 스크립트 로딩 순서 (HTML Binding)

`frontend/editor.html` 내 스크립트 바인딩 순서:

```html
<!-- 1차 분리 기능 모듈 -->
<script src="js/modules/editor-clipboard.js"></script>
<script src="js/modules/editor-bible.js"></script>
<script src="js/modules/editor-praise.js"></script>
<script src="js/modules/editor-stage-bg.js"></script>
<script src="js/modules/editor-monitor.js"></script>

<!-- 2차 분리 코어 인프라 모듈 -->
<script src="js/modules/editor-canvas.js"></script>
<script src="js/modules/editor-history.js"></script>
<script src="js/modules/editor-sync.js"></script>
<script src="js/modules/editor-elements.js"></script>
<script src="js/modules/editor-template.js"></script>

<!-- 코어 메인 진입점 (약 300~500 라인으로 축소) -->
<script src="js/editor.js"></script>
```
