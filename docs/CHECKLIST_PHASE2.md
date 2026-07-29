# 📋 Phase 2 JS 추출 기능 체크리스트 & 1:1 대조 결과

| HTML 파일명 | 추출된 JS 파일 | 원본 함수/이벤트 수 | 추출 JS 함수/이벤트 수 | 1:1 일치 여부 | 원본 코드 대조 |
|---|---|---|---|---|---|
| `editor.html` | `frontend/js/editor.js` | 155 | 155 | ✅ 100% 일치 | ✅ 원본 손실 0% |
| `index.html` | `frontend/js/index.js` | 17 | 17 | ✅ 100% 일치 | ✅ 원본 손실 0% |
| `presenter.html` | `frontend/js/presenter.js` | 16 | 16 | ✅ 100% 일치 | ✅ 원본 손실 0% |
| `viewer.html` | `frontend/js/viewer.js` | 14 | 14 | ✅ 100% 일치 | ✅ 원본 손실 0% |

## 🔍 세부 함수 및 이벤트 대조 목록

### 📄 `editor.html` -> `js/editor.js`
- 총 주요 함수 및 이벤트 식별 수: 155개
<details><summary>함수 및 이벤트 목록 보기</summary>

- `addEventListener('DOMContentLoaded')`
- `addEventListener('change')`
- `addEventListener('contextmenu')`
- `addEventListener('dragend')`
- `addEventListener('dragleave')`
- `addEventListener('dragover')`
- `addEventListener('dragstart')`
- `addEventListener('drop')`
- `addEventListener('keydown')`
- `addEventListener('mousedown')`
- `addEventListener('mousemove')`
- `addEventListener('mouseup')`
- `addEventListener('offline')`
- `addEventListener('online')`
- `addEventListener('paste')`
- `addEventListener('resize')`
- `addEventListener('wheel')`
- `const/let closeAddModal = fn`
- `const/let closeBibleModal = fn`
- `const/let exportPraiseAction = fn`
- `const/let handleAlign = fn`
- `const/let setAlign = fn`
- `const/let updateShapeFillColor = fn`
- `const/let updateShapeStrokeColor = fn`
- `const/let updateTextFillColor = fn`
- `const/let updateTextShadowColor = fn`
- `const/let updateTextStrokeColor = fn`
- `function addBibleSlidesToProject()`
- `function addCircle()`
- `function addCustomFont()`
- `function addLine()`
- `function addRect()`
- `function addSlide()`
- `function addTextTpl()`
- `function addTriangle()`
- `function adjustPraisePanelLayout()`
- `function applyStateToCanvas()`
- `function applyTemplateBulk()`
- `function attachBibleTableSelectionEvents()`
- `function autoGenerateThumbnail()`
- `function bindCanvasContextMenuEvents()`
- `function bindSlideContextMenuEvents()`
- `function cancelEditing()`
- `function checkIsLockedByOthers()`
- `function closeApplyModal()`
- `function closeDragElement()`
- `function colorToHex()`
- `function colorToOpacity()`
- `function confirmAddBibleSlides()`
- `function confirmApplyTemplate()`
- `function connectWebSocket()`
- `function convertToShortBookName()`
- `function copySelectedPraiseSongs()`
- `function copySelectedSlides()`
- `function createBibleSlideObject()`
- `function createPraiseSlideObject()`
- `function createSlideFromTemplateExplicit()`
- `function cutSelectedPraiseSongs()`
- `function cutSelectedSlides()`
- `function deleteElement()`
- `function deleteSelectedPraiseSongsWithConfirm()`
- `function deleteSelectedSlidesWithConfirm()`
- `function deleteSlides()`
- `function deleteTemplate()`
- `function deserializeElement()`
- `function dragMouseDown()`
- `function elementDrag()`
- `function engTypeToKor()`
- `function fetchBibleBooks()`
- `function fetchBibleCoordinates()`
- `function fetchPraiseSongs()`
- `function filterBibleBooks()`
- `function fitCanvasToScreen()`
- `function getGeometricLocationName()`
- `function getSelectedBibleVersion()`
- `function groupObjects()`
- `function handleCheckboxClick()`
- `function handleOffline()`
- `function handleOnline()`
- `function hexAndOpacityToRgba()`
- `function hideBibleLivePreview()`
- `function hideBibleMainViewer()`
- `function hideCanvasContextMenu()`
- `function hidePraiseContextMenu()`
- `function hidePraiseMainViewer()`
- `function hideSlideContextMenu()`
- `function initBibleFeature()`
- `function initBibleMainViewerEvents()`
- `function initCanvas()`
- `function initPraiseFeature()`
- `function insertImageToCanvas()`
- `function layerBack()`
- `function layerDown()`
- `function layerFront()`
- `function layerUp()`
- `function loadSlideToCanvas()`
- `function makeElementDraggable()`
- `function onBibleBookChange()`
- `function onMouseMove()`
- `function onMouseUp()`
- `function onObjectCleared()`
- `function onObjectModified()`
- `function onObjectSelected()`
- `function openAddPraiseModal()`
- `function openEditPraiseModal()`
- `function pastePraiseSongs()`
- `function pasteSlidesFromClipboardText()`
- `function performAutoSave()`
- `function redo()`
- `function releaseActiveLock()`
- `function renderBibleModalSlideGrid()`
- `function renderBibleResults()`
- `function renderModalSlides()`
- `function renderPraisePreview()`
- `function renderPraiseSongsList()`
- `function renderSlides()`
- `function renderTemplates()`
- `function saveAsTemplate()`
- `function saveSlideData()`
- `function saveStateToHistory()`
- `function searchBibleKeywords()`
- `function selectSlideForEdit()`
- `function selectTemplate()`
- `function serializeElement()`
- `function setBibleLoadingState()`
- `function setCanvasZoom()`
- `function setControlsState()`
- `function setSlideDirty()`
- `function showBibleLivePreview()`
- `function showBibleMainViewer()`
- `function showCanvasContextMenu()`
- `function showPraiseContextMenu()`
- `function showSlideContextMenu()`
- `function splitTextByLength()`
- `function switchBibleSearchMode()`
- `function switchLeftTab()`
- `function syncPresetValues()`
- `function syncSelectionFromViewer()`
- `function syncViewerFromLeftPanel()`
- `function toggleSelectAllBible()`
- `function triggerAutoSave()`
- `function undo()`
- `function undoBulkAction()`
- `function ungroupObjects()`
- `function updateAutoSaveStatus()`
- `function updateBibleExpectedSlides()`
- `function updateBibleViewerFontSize()`
- `function updateInspectorCoords()`
- `function updateLayerList()`
- `function updatePraiseExpectedCount()`
- `function updatePraiseSelectionUI()`
- `function updatePraiseTemplateOptions()`
- `function updatePraiseTextboxOptions()`
- `function updateSelectedVersesMemory()`
- `function updateTemplateActionButtons()`

</details>

### 📄 `index.html` -> `js/index.js`
- 총 주요 함수 및 이벤트 식별 수: 17개
<details><summary>함수 및 이벤트 목록 보기</summary>

- `addEventListener('DOMContentLoaded')`
- `addEventListener('change')`
- `addEventListener('click')`
- `addEventListener('input')`
- `addEventListener('keydown')`
- `const/let saveRename = fn`
- `function deleteSelectedProjects()`
- `function duplicateClipboardProjects()`
- `function escapeHtml()`
- `function fetchProjects()`
- `function handleCreateProject()`
- `function hardReload()`
- `function pollUntilServerReady()`
- `function renderProjects()`
- `function showToast()`
- `function showUpdateOverlay()`
- `function updateSelectedUI()`

</details>

### 📄 `presenter.html` -> `js/presenter.js`
- 총 주요 함수 및 이벤트 식별 수: 16개
<details><summary>함수 및 이벤트 목록 보기</summary>

- `addEventListener('change')`
- `addEventListener('resize')`
- `addEventListener('wheel')`
- `function applyBibleMode()`
- `function autoGenerateThumbnail()`
- `function changeSlide()`
- `function connectWebSocket()`
- `function deserializeElement()`
- `function extractText()`
- `function initCanvas()`
- `function navigateSlide()`
- `function renderCurrentLiveSlide()`
- `function renderDeck()`
- `function traverse()`
- `function updateCanvasDimensions()`
- `function updateMonitorPreview()`

</details>

### 📄 `viewer.html` -> `js/viewer.js`
- 총 주요 함수 및 이벤트 식별 수: 14개
<details><summary>함수 및 이벤트 목록 보기</summary>

- `addEventListener('beforeunload')`
- `addEventListener('pagehide')`
- `addEventListener('wheel')`
- `function connectWebSocket()`
- `function deserializeElement()`
- `function extractSlideText()`
- `function initCanvas()`
- `function renderCurrentSlide()`
- `function renderMonitorView()`
- `function saveCurrentMonitorFontSize()`
- `function showFontToast()`
- `function traverse()`
- `function updateCanvasDimensions()`
- `function updateMonitorFontSize()`

</details>

