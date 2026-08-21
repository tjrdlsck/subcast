// ==========================================================================
// Subcast Module: editor-shortcuts.js (Keyboard & Clipboard Shortcuts)
// ==========================================================================

function initKeyboardShortcuts() {
    // Delete 키 단축키로 삭제 처리 및 Ctrl+Z/Ctrl+Shift+Z 되돌리기/다시실행
    window.addEventListener('keydown', (e) => {
        const hasTextSelection = window.getSelection() && window.getSelection().toString().trim().length > 0;
        const isEditableElement = document.activeElement && (
            ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) ||
            document.activeElement.isContentEditable
        );

        if (isEditableElement) {
            return;
        }

        // Ctrl+G: 슬라이드 모아보기(Slide Sorter) 토글
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
            e.preventDefault();
            if (window.subcastSlideSorter && typeof window.subcastSlideSorter.toggle === 'function') {
                window.subcastSlideSorter.toggle();
            }
            return;
        }

        // Escape: 슬라이드 모아보기가 열려있을 때 닫고 에디터 복귀
        if (e.key === 'Escape') {
            if (window.subcastSlideSorter && typeof window.subcastSlideSorter.isOpen === 'function' && window.subcastSlideSorter.isOpen()) {
                e.preventDefault();
                window.subcastSlideSorter.close();
                return;
            }
        }

        // Ctrl+C / Ctrl+X 사용 시 드래그된 화면 텍스트 선택이 존재하는 경우 캔버스/슬라이드 복사를 우회하여 순수 텍스트 복사 허용
        if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'x')) {
            if (hasTextSelection) {
                return;
            }
        }

        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            const activeObj = canvas.getActiveObject();
            if (activeObj) {
                e.preventDefault();
                const step = e.shiftKey ? 10 : 1;
                switch (e.key) {
                    case 'ArrowUp':
                        activeObj.set('top', activeObj.top - step);
                        break;
                    case 'ArrowDown':
                        activeObj.set('top', activeObj.top + step);
                        break;
                    case 'ArrowLeft':
                        activeObj.set('left', activeObj.left - step);
                        break;
                    case 'ArrowRight':
                        activeObj.set('left', activeObj.left + step);
                        break;
                }
                activeObj.setCoords();
                canvas.renderAll();
                updateInspectorCoords();
                saveStateToHistory();
                if (window.subcastMonitorEditor && window.subcastMonitorEditor.isMonitorMode && window.subcastMonitorEditor.isMonitorMode()) {
                    if (typeof window.subcastMonitorEditor.notifyMonitorChanged === 'function') {
                        window.subcastMonitorEditor.notifyMonitorChanged();
                    }
                }
                return;
            }
        }

        if (e.key === 'Delete') {
            const isSorterActive = !!(window.subcastSlideSorter && typeof window.subcastSlideSorter.isOpen === 'function' && window.subcastSlideSorter.isOpen());
            if (isSorterActive) {
                if (selectedSlideIds && selectedSlideIds.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    deleteSelectedSlidesWithConfirm();
                }
                return;
            }

            const activeObj = canvas.getActiveObject();
            const isMonitorMode = !!(window.subcastMonitorEditor && window.subcastMonitorEditor.isMonitorMode && window.subcastMonitorEditor.isMonitorMode());
            const isMonitorTabActive = document.getElementById('panel-monitor')?.classList.contains('active');
            const isTemplateTabActive = document.getElementById('panel-templates')?.classList.contains('active');
            const isPraiseTabActive = document.getElementById('panel-praise')?.classList.contains('active');
            const isStageBgTabActive = document.getElementById('panel-stage-bg')?.classList.contains('active');
            const isStageBgVisible = document.getElementById('stage-bg-main-viewer-overlay')?.style.display !== 'none';
            const isBibleVisible = document.getElementById('bible-main-viewer-overlay')?.style.display !== 'none';

            if (isMonitorMode || isMonitorTabActive) {
                if (activeObj || currentEditingElement) {
                    deleteElement();
                }
                return;
            }

            if (isStageBgTabActive || isStageBgVisible) {
                if (selectedStageBgFiles && selectedStageBgFiles.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof deleteSelectedStageBgFilesWithConfirm === 'function') {
                        deleteSelectedStageBgFilesWithConfirm();
                    }
                    return;
                }
            }

            if (isBibleVisible) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            if (isPraiseTabActive || (selectedPraiseSongs && selectedPraiseSongs.length > 0)) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof deleteSelectedPraiseSongsWithConfirm === 'function') {
                    deleteSelectedPraiseSongsWithConfirm();
                }
            } else if (activeObj || currentEditingElement) {
                deleteElement();
            } else if (isTemplateTabActive && selectedTemplateIds.length > 0) {
                deleteTemplate();
            } else if (selectedSlideIds.length > 0) {
                deleteSelectedSlidesWithConfirm();
            }
        } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            undo();
        } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            redo();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
            // 잘라내기 (Ctrl+X)
            const isSorterActive = !!(window.subcastSlideSorter && typeof window.subcastSlideSorter.isOpen === 'function' && window.subcastSlideSorter.isOpen());
            if (isSorterActive) {
                if (selectedSlideIds && selectedSlideIds.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    cutSelectedSlides();
                }
                return;
            }

            const isPraiseTabActive = document.getElementById('panel-praise')?.classList.contains('active');
            if (isPraiseTabActive && selectedPraiseSongs && selectedPraiseSongs.length > 0) {
                e.preventDefault();
                if (typeof cutSelectedPraiseSongs === 'function') cutSelectedPraiseSongs();
                return;
            }
            const activeObj = canvas.getActiveObject();
            if (activeObj) {
                if (activeObj.type === 'activeSelection') {
                    const serializedList = [];
                    const groupLeft = activeObj.left || 0;
                    const groupTop = activeObj.top || 0;
                    const groupWidth = activeObj.width || 0;
                    const groupHeight = activeObj.height || 0;
                    activeObj.forEachObject((obj) => {
                        const absLeft = groupLeft + obj.left + groupWidth / 2;
                        const absTop = groupTop + obj.top + groupHeight / 2;
                        const originalLeft = obj.left;
                        const originalTop = obj.top;
                        obj.set({ left: absLeft, top: absTop });
                        serializedList.push(serializeElement(obj, BASE_WIDTH, BASE_HEIGHT));
                        obj.set({ left: originalLeft, top: originalTop });
                    });
                    navigator.clipboard.writeText(JSON.stringify({ subcastType: "multipleElements", data: serializedList }));
                    activeObj.forEachObject(obj => canvas.remove(obj));
                    canvas.discardActiveObject();
                } else {
                    const serialized = serializeElement(activeObj, BASE_WIDTH, BASE_HEIGHT);
                    navigator.clipboard.writeText(JSON.stringify({ subcastType: "element", data: serialized }));
                    canvas.remove(activeObj);
                }
                canvas.renderAll();
                saveStateToHistory();
            } else if (selectedSlideIds.length > 0) {
                const isStageBgTabActive = document.getElementById('panel-stage-bg')?.classList.contains('active');
                const isStageBgVisible = document.getElementById('stage-bg-main-viewer-overlay')?.style.display !== 'none';
                if (!isStageBgTabActive && !isStageBgVisible) {
                    cutSelectedSlides();
                }
            }
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
            // 복사 (Ctrl+C)
            const isSorterActive = !!(window.subcastSlideSorter && typeof window.subcastSlideSorter.isOpen === 'function' && window.subcastSlideSorter.isOpen());
            if (isSorterActive) {
                if ((selectedSlideIds && selectedSlideIds.length > 0) || (typeof activeSlideId !== 'undefined' && activeSlideId)) {
                    e.preventDefault();
                    e.stopPropagation();
                    copySelectedSlides();
                }
                return;
            }

            const isStageBgTabActive = document.getElementById('panel-stage-bg')?.classList.contains('active');
            const isStageBgVisible = document.getElementById('stage-bg-main-viewer-overlay')?.style.display !== 'none';
            if ((isStageBgTabActive || isStageBgVisible) && selectedStageBgFiles && selectedStageBgFiles.length > 0) {
                e.preventDefault();
                if (typeof copySelectedStageBgFiles === 'function') copySelectedStageBgFiles();
                return;
            }

            const isPraiseTabActive = document.getElementById('panel-praise')?.classList.contains('active');
            if (isPraiseTabActive && selectedPraiseSongs && selectedPraiseSongs.length > 0) {
                e.preventDefault();
                if (typeof copySelectedPraiseSongs === 'function') copySelectedPraiseSongs();
                return;
            }
            const activeObj = canvas.getActiveObject();
            if (activeObj) {
                if (activeObj.type === 'activeSelection') {
                    const serializedList = [];
                    const groupLeft = activeObj.left || 0;
                    const groupTop = activeObj.top || 0;
                    const groupWidth = activeObj.width || 0;
                    const groupHeight = activeObj.height || 0;

                    activeObj.forEachObject((obj) => {
                        const absLeft = groupLeft + obj.left + groupWidth / 2;
                        const absTop = groupTop + obj.top + groupHeight / 2;
                        const originalLeft = obj.left;
                        const originalTop = obj.top;

                        obj.set({ left: absLeft, top: absTop });
                        const serialized = serializeElement(obj, BASE_WIDTH, BASE_HEIGHT);
                        serializedList.push(serialized);

                        obj.set({ left: originalLeft, top: originalTop });
                    });

                    const payload = { subcastType: "multipleElements", data: serializedList };
                    navigator.clipboard.writeText(JSON.stringify(payload)).catch(err => {
                        console.error("시스템 클립보드 쓰기 실패:", err);
                    });
                } else {
                    const serialized = serializeElement(activeObj, BASE_WIDTH, BASE_HEIGHT);
                    const payload = { subcastType: "element", data: serialized };
                    navigator.clipboard.writeText(JSON.stringify(payload)).catch(err => {
                        console.error("시스템 클립보드 쓰기 실패:", err);
                    });
                }
            } else if ((selectedSlideIds && selectedSlideIds.length > 0) || (typeof activeSlideId !== 'undefined' && activeSlideId)) {
                if (!isStageBgTabActive && !isStageBgVisible) {
                    copySelectedSlides();
                }
            }
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
            // 붙여넣기 (Ctrl+V)
            const isStageBgTabActive = document.getElementById('panel-stage-bg')?.classList.contains('active');
            const isStageBgVisible = document.getElementById('stage-bg-main-viewer-overlay')?.style.display !== 'none';
            if ((isStageBgTabActive || isStageBgVisible) && stageBgClipboardFiles && stageBgClipboardFiles.length > 0) {
                e.preventDefault();
                if (typeof pasteStageBgFiles === 'function') pasteStageBgFiles();
                return;
            }

            const isPraiseTabActive = document.getElementById('panel-praise')?.classList.contains('active');
            if (isPraiseTabActive) {
                e.preventDefault();
                if (typeof pastePraiseSongs === 'function') pastePraiseSongs();
                return;
            }
        }
    });
}

function initPasteListener() {
    window.addEventListener('paste', (e) => {
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
            return;
        }

        const items = (e.clipboardData || e.originalEvent.clipboardData)?.items;
        if (!items) return;

        let hasImageFile = false;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                const file = items[i].getAsFile();
                if (file) {
                    e.preventDefault();
                    hasImageFile = true;
                    insertImageToCanvas(file);
                    break;
                }
            }
        }

        if (!hasImageFile) {
            const textData = (e.clipboardData || e.originalEvent.clipboardData).getData("text");
            if (textData) {
                try {
                    const payload = JSON.parse(textData);
                    if (payload && payload.subcastType === "element") {
                        e.preventDefault();
                        const elem = payload.data;
                        const obj = deserializeElement(elem, BASE_WIDTH, BASE_HEIGHT);
                        if (obj) {
                            obj.set({
                                left: (obj.left || 0) + 20,
                                top: (obj.top || 0) + 20,
                                originalId: `elem_${Math.random().toString(36).substr(2, 9)}`
                            });
                            canvas.add(obj);
                            canvas.setActiveObject(obj);
                            canvas.renderAll();
                            saveStateToHistory();
                        }
                    } else if (payload && payload.subcastType === "multipleElements") {
                        e.preventDefault();
                        const elemList = payload.data;
                        const newObjects = [];

                        elemList.forEach((elem) => {
                            const obj = deserializeElement(elem, BASE_WIDTH, BASE_HEIGHT);
                            if (obj) {
                                obj.set({
                                    left: (obj.left || 0) + 20,
                                    top: (obj.top || 0) + 20,
                                    originalId: `elem_${Math.random().toString(36).substr(2, 9)}`
                                });
                                canvas.add(obj);
                                newObjects.push(obj);
                            }
                        });

                        if (newObjects.length > 0) {
                            const activeSelection = new fabric.ActiveSelection(newObjects, {
                                canvas: canvas
                            });
                            canvas.setActiveObject(activeSelection);
                            canvas.requestRenderAll();
                        }
                        saveStateToHistory();
                    } else if (payload && (payload.subcastType === "slide" || payload.subcastType === "slides")) {
                        e.preventDefault();
                        pasteSlidesFromClipboardText(textData);
                    }
                } catch (err) {
                    // 일반 텍스트 등 무시
                }
            }
        }
    });
}
