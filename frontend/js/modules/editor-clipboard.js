        // ==========================================================================
        // Slide Clipboard & Context Menu Helper Logic
        // ==========================================================================
        async function copySelectedSlides() {
            if (!selectedSlideIds || selectedSlideIds.length === 0) return;
            const slidesToCopy = projectData.slides.filter(s => selectedSlideIds.includes(s.id));
            if (slidesToCopy.length === 0) return;

            let payload;
            if (slidesToCopy.length === 1) {
                const targetSlide = slidesToCopy[0];
                payload = {
                    subcastType: "slide",
                    data: {
                        name: targetSlide.name + " (사본)",
                        elements: JSON.parse(JSON.stringify(targetSlide.elements)),
                        thumbnail: targetSlide.thumbnail
                    }
                };
            } else {
                payload = {
                    subcastType: "slides",
                    data: slidesToCopy.map(slide => ({
                        name: slide.name + " (사본)",
                        elements: JSON.parse(JSON.stringify(slide.elements)),
                        thumbnail: slide.thumbnail
                    }))
                };
            }

            try {
                await navigator.clipboard.writeText(JSON.stringify(payload));
            } catch (err) {
                console.error("시스템 클립보드 쓰기 실패:", err);
            }
        }

        async function cutSelectedSlides() {
            if (!selectedSlideIds || selectedSlideIds.length === 0) return;
            await copySelectedSlides();
            deleteSlides(selectedSlideIds);
        }

        function pasteSlidesFromClipboardText(textData) {
            if (!textData) return false;

            try {
                const payload = JSON.parse(textData);
                if (!payload || !payload.subcastType) return false;

                let slidesToAdd = [];
                if (payload.subcastType === "slide" && payload.data) {
                    slidesToAdd.push(payload.data);
                } else if (payload.subcastType === "slides" && Array.isArray(payload.data)) {
                    slidesToAdd = payload.data;
                } else {
                    return false;
                }

                if (slidesToAdd.length === 0) return false;

                // 선택된 슬라이드들 중 가장 마지막 위치(인덱스)의 슬라이드 뒤에 삽입
                let insertIndex = -1;
                if (selectedSlideIds && selectedSlideIds.length > 0) {
                    const indices = selectedSlideIds
                        .map(id => projectData.slides.findIndex(s => s.id === id))
                        .filter(idx => idx !== -1);
                    if (indices.length > 0) {
                        insertIndex = Math.max(...indices);
                    }
                }

                if (insertIndex === -1) {
                    insertIndex = projectData.slides.findIndex(s => s.id === activeSlideId);
                }
                if (insertIndex === -1) {
                    insertIndex = projectData.slides.length - 1;
                }

                const newCreatedSlides = [];
                slidesToAdd.forEach((slideData, idx) => {
                    const newId = `slide_${Math.random().toString(36).substr(2, 8)}`;
                    const newSlide = {
                        id: newId,
                        name: slideData.name || "복사된 슬라이드",
                        thumbnail: slideData.thumbnail || "",
                        elements: JSON.parse(JSON.stringify(slideData.elements || []))
                    };
                    projectData.slides.splice(insertIndex + 1 + idx, 0, newSlide);
                    ws.send(JSON.stringify({ type: "SAVE_SLIDE", slide: newSlide }));
                    newCreatedSlides.push(newSlide);
                });

                const updatedSlideIds = projectData.slides.map(s => s.id);
                ws.send(JSON.stringify({ type: "REORDER_SLIDES", slideIds: updatedSlideIds }));

                if (newCreatedSlides.length > 0) {
                    selectSlideForEdit(newCreatedSlides[0].id);
                }
                renderSlides();
                return true;
            } catch (err) {
                return false;
            }
        }

        function deleteSelectedSlidesWithConfirm() {
            if (!selectedSlideIds || selectedSlideIds.length === 0) return;
            if (confirm(`선택한 ${selectedSlideIds.length}개의 슬라이드를 삭제하시겠습니까?`)) {
                deleteSlides(selectedSlideIds);
            }
        }

        function showSlideContextMenu(x, y) {
            const menu = document.getElementById("slide-context-menu");
            const pasteBtn = document.getElementById("menu-slide-paste");
            if (!menu || !pasteBtn) return;

            // 붙여넣기 메뉴 항시 활성화
            pasteBtn.classList.remove("disabled");

            menu.style.display = "block";
            const menuWidth = menu.offsetWidth;
            const menuHeight = menu.offsetHeight;
            const winWidth = window.innerWidth;
            const winHeight = window.innerHeight;

            let posX = x;
            let posY = y;
            if (x + menuWidth > winWidth) posX = winWidth - menuWidth - 10;
            if (y + menuHeight > winHeight) posY = winHeight - menuHeight - 10;

            menu.style.left = `${posX}px`;
            menu.style.top = `${posY}px`;
        }

        function hideSlideContextMenu() {
            const menu = document.getElementById("slide-context-menu");
            if (menu) menu.style.display = "none";
        }

        function showCanvasContextMenu(x, y) {
            hideSlideContextMenu();
            const menu = document.getElementById("canvas-context-menu");
            if (!menu) return;

            menu.style.display = "block";
            const menuWidth = menu.offsetWidth;
            const menuHeight = menu.offsetHeight;
            const winWidth = window.innerWidth;
            const winHeight = window.innerHeight;

            let posX = x;
            let posY = y;
            if (x + menuWidth > winWidth) posX = winWidth - menuWidth - 10;
            if (y + menuHeight > winHeight) posY = winHeight - menuHeight - 10;

            menu.style.left = `${posX}px`;
            menu.style.top = `${posY}px`;
        }

        function hideCanvasContextMenu() {
            const menu = document.getElementById("canvas-context-menu");
            if (menu) menu.style.display = "none";
        }

        function showPraiseContextMenu(x, y) {
            hideSlideContextMenu();
            hideCanvasContextMenu();
            hideStageBgContextMenu();
            const menu = document.getElementById("praise-context-menu");
            if (!menu) return;

            const editBtn = document.getElementById("menu-praise-edit");
            if (editBtn) {
                if (selectedPraiseSongs.length === 1) {
                    editBtn.classList.remove("disabled");
                    editBtn.style.opacity = "1";
                    editBtn.style.pointerEvents = "auto";
                } else {
                    editBtn.classList.add("disabled");
                    editBtn.style.opacity = "0.5";
                    editBtn.style.pointerEvents = "none";
                }
            }

            const pasteBtn = document.getElementById("menu-praise-paste");
            if (pasteBtn) {
                if (praiseClipboardData && praiseClipboardData.length > 0) {
                    pasteBtn.classList.remove("disabled");
                    pasteBtn.style.opacity = "1";
                    pasteBtn.style.pointerEvents = "auto";
                } else {
                    pasteBtn.classList.add("disabled");
                    pasteBtn.style.opacity = "0.5";
                    pasteBtn.style.pointerEvents = "none";
                }
            }

            menu.style.display = "block";
            const menuWidth = menu.offsetWidth;
            const menuHeight = menu.offsetHeight;
            const winWidth = window.innerWidth;
            const winHeight = window.innerHeight;

            let posX = x;
            let posY = y;
            if (x + menuWidth > winWidth) posX = winWidth - menuWidth - 10;
            if (y + menuHeight > winHeight) posY = winHeight - menuHeight - 10;

            menu.style.left = `${posX}px`;
            menu.style.top = `${posY}px`;
        }

        function hidePraiseContextMenu() {
            const menu = document.getElementById("praise-context-menu");
            if (menu) menu.style.display = "none";
        }

        function showStageBgContextMenu(x, y) {
            hideSlideContextMenu();
            hideCanvasContextMenu();
            hidePraiseContextMenu();

            const menu = document.getElementById("stage-bg-context-menu");
            if (!menu) return;

            const copyBtn = document.getElementById("menu-stage-bg-copy");
            if (copyBtn) {
                if (selectedStageBgFiles && selectedStageBgFiles.length > 0) {
                    copyBtn.classList.remove("disabled");
                    copyBtn.style.opacity = "1";
                    copyBtn.style.pointerEvents = "auto";
                } else {
                    copyBtn.classList.add("disabled");
                    copyBtn.style.opacity = "0.5";
                    copyBtn.style.pointerEvents = "none";
                }
            }

            const pasteBtn = document.getElementById("menu-stage-bg-paste");
            if (pasteBtn) {
                if (stageBgClipboardFiles && stageBgClipboardFiles.length > 0) {
                    pasteBtn.classList.remove("disabled");
                    pasteBtn.style.opacity = "1";
                    pasteBtn.style.pointerEvents = "auto";
                } else {
                    pasteBtn.classList.add("disabled");
                    pasteBtn.style.opacity = "0.5";
                    pasteBtn.style.pointerEvents = "none";
                }
            }

            const deleteBtn = document.getElementById("menu-stage-bg-delete");
            if (deleteBtn) {
                if (selectedStageBgFiles && selectedStageBgFiles.length > 0) {
                    deleteBtn.classList.remove("disabled");
                    deleteBtn.style.opacity = "1";
                    deleteBtn.style.pointerEvents = "auto";
                } else {
                    deleteBtn.classList.add("disabled");
                    deleteBtn.style.opacity = "0.5";
                    deleteBtn.style.pointerEvents = "none";
                }
            }

            menu.style.display = "block";
            const menuWidth = menu.offsetWidth;
            const menuHeight = menu.offsetHeight;
            const winWidth = window.innerWidth;
            const winHeight = window.innerHeight;

            let posX = x;
            let posY = y;
            if (x + menuWidth > winWidth) posX = winWidth - menuWidth - 10;
            if (y + menuHeight > winHeight) posY = winHeight - menuHeight - 10;

            menu.style.left = `${posX}px`;
            menu.style.top = `${posY}px`;
        }

        function hideStageBgContextMenu() {
            const menu = document.getElementById("stage-bg-context-menu");
            if (menu) menu.style.display = "none";
        }

        document.addEventListener("mousedown", (e) => {
            if (!e.target.closest("#slide-context-menu")) {
                hideSlideContextMenu();
            }
            if (!e.target.closest("#canvas-context-menu")) {
                hideCanvasContextMenu();
            }
            if (!e.target.closest("#praise-context-menu")) {
                hidePraiseContextMenu();
            }
            if (!e.target.closest("#stage-bg-context-menu")) {
                hideStageBgContextMenu();
            }
        });

        // 캔버스 편집 공간 우클릭 시 커스텀 우클릭 팝업 메뉴 표시
        document.addEventListener("contextmenu", (e) => {
            const isStageBgVisible = document.getElementById('stage-bg-main-viewer-overlay')?.style.display !== 'none';
            const isBibleVisible = document.getElementById('bible-main-viewer-overlay')?.style.display !== 'none';
            const isPraiseVisible = document.getElementById('praise-main-viewer-overlay')?.style.display !== 'none';
            const isStageBgTabActive = document.getElementById('panel-stage-bg')?.classList.contains('active');

            if (e.target.closest("#stage-bg-main-viewer-overlay") || isStageBgTabActive) {
                if (e.target.closest("#stage-bg-main-grid") || e.target.closest("#stage-bg-main-viewer-overlay") || e.target.closest("#panel-stage-bg")) {
                    e.preventDefault();
                    showStageBgContextMenu(e.clientX, e.clientY);
                    return;
                }
            }

            if (e.target.closest("#bible-main-viewer-overlay") || e.target.closest("#praise-main-viewer-overlay")) {
                e.preventDefault();
                return;
            }

            if (isStageBgVisible || isBibleVisible || isPraiseVisible || isStageBgTabActive) {
                return;
            }

            if (e.target.closest(".canvas-workspace") || e.target.closest(".canvas-wrapper-outer") || e.target.closest("#editor-canvas")) {
                e.preventDefault();
                showCanvasContextMenu(e.clientX, e.clientY);
            }
        });

        function bindSlideContextMenuEvents() {
            const moodBtn = document.getElementById("menu-slide-moods");
            const copyBtn = document.getElementById("menu-slide-copy");
            const cutBtn = document.getElementById("menu-slide-cut");
            const pasteBtn = document.getElementById("menu-slide-paste");
            const deleteBtn = document.getElementById("menu-slide-delete");

            if (moodBtn) {
                moodBtn.onclick = (e) => {
                    e.stopPropagation();
                    hideSlideContextMenu();
                    const targetId = selectedSlideId || (selectedSlideIds && selectedSlideIds[0]);
                    if (targetId && projectData && projectData.slides) {
                        const slide = projectData.slides.find(s => s.id === targetId);
                        if (slide) {
                            if (typeof showSlideBgSelectModal === 'function') {
                                showSlideBgSelectModal(slide);
                            } else if (typeof window.showSlideBgSelectModal === 'function') {
                                window.showSlideBgSelectModal(slide);
                            }
                        }
                    }
                };
            }

            // 슬라이드 현장 배경 지정 모달 이벤트 바인딩
            if (typeof bindSlideBgModalEvents === 'function') {
                bindSlideBgModalEvents();
            } else if (typeof window.bindSlideBgModalEvents === 'function') {
                window.bindSlideBgModalEvents();
            }

            if (copyBtn) {
                copyBtn.onclick = (e) => {
                    e.stopPropagation();
                    hideSlideContextMenu();
                    copySelectedSlides();
                };
            }
            if (cutBtn) {
                cutBtn.onclick = (e) => {
                    e.stopPropagation();
                    hideSlideContextMenu();
                    cutSelectedSlides();
                };
            }
            if (pasteBtn) {
                pasteBtn.onclick = async (e) => {
                    e.stopPropagation();
                    hideSlideContextMenu();
                    try {
                        const text = await navigator.clipboard.readText();
                        pasteSlidesFromClipboardText(text);
                    } catch (err) {
                        console.error("클립보드 읽기 실패:", err);
                    }
                };
            }
            if (deleteBtn) {
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    hideSlideContextMenu();
                    deleteSelectedSlidesWithConfirm();
                };
            }
        }

        function bindStageBgContextMenuEvents() {
            const moodBtn = document.getElementById("menu-stage-bg-moods");
            const copyBtn = document.getElementById("menu-stage-bg-copy");
            const pasteBtn = document.getElementById("menu-stage-bg-paste");
            const deleteBtn = document.getElementById("menu-stage-bg-delete");

            if (moodBtn) {
                moodBtn.onclick = (e) => {
                    e.stopPropagation();
                    hideStageBgContextMenu();
                    if (selectedStageBgFiles && selectedStageBgFiles.length > 0) {
                        openStageBgMoodModal(selectedStageBgFiles);
                    }
                };
            }
            if (copyBtn) {
                copyBtn.onclick = (e) => {
                    e.stopPropagation();
                    hideStageBgContextMenu();
                    if (typeof copySelectedStageBgFiles === 'function') copySelectedStageBgFiles();
                };
            }
            if (pasteBtn) {
                pasteBtn.onclick = (e) => {
                    e.stopPropagation();
                    hideStageBgContextMenu();
                    if (typeof pasteStageBgFiles === 'function') pasteStageBgFiles();
                };
            }
            if (deleteBtn) {
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    hideStageBgContextMenu();
                    if (typeof deleteSelectedStageBgFilesWithConfirm === 'function') deleteSelectedStageBgFilesWithConfirm();
                };
            }
        }

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => {
                bindSlideContextMenuEvents();
                bindCanvasContextMenuEvents();
                bindStageBgContextMenuEvents();
            });
        } else {
            bindSlideContextMenuEvents();
            bindCanvasContextMenuEvents();
            bindStageBgContextMenuEvents();
        }

        function bindCanvasContextMenuEvents() {
            const undoBtn = document.getElementById("menu-canvas-undo");
            const redoBtn = document.getElementById("menu-canvas-redo");
            const copyBtn = document.getElementById("menu-canvas-copy");
            const cutBtn = document.getElementById("menu-canvas-cut");
            const pasteBtn = document.getElementById("menu-canvas-paste");
            const deleteBtn = document.getElementById("menu-canvas-delete");

            if (undoBtn) undoBtn.onclick = (e) => { e.stopPropagation(); hideCanvasContextMenu(); undo(); };
            if (redoBtn) redoBtn.onclick = (e) => { e.stopPropagation(); hideCanvasContextMenu(); redo(); };

            if (copyBtn) {
                copyBtn.onclick = (e) => {
                    e.stopPropagation();
                    hideCanvasContextMenu();
                    const activeObj = canvas.getActiveObject();
                    if (activeObj) {
                        if (activeObj.isMonitorGuide || (activeObj.type === 'activeSelection' && activeObj.getObjects().some(o => o.isMonitorGuide))) {
                            return;
                        }
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
                        } else {
                            const serialized = serializeElement(activeObj, BASE_WIDTH, BASE_HEIGHT);
                            navigator.clipboard.writeText(JSON.stringify({ subcastType: "element", data: serialized }));
                        }
                    } else if (selectedSlideIds && selectedSlideIds.length > 0) {
                        copySelectedSlides();
                    }
                };
            }

            if (cutBtn) {
                cutBtn.onclick = (e) => {
                    e.stopPropagation();
                    hideCanvasContextMenu();
                    const activeObj = canvas.getActiveObject();
                    if (activeObj) {
                        if (activeObj.isMonitorGuide || (activeObj.type === 'activeSelection' && activeObj.getObjects().some(o => o.isMonitorGuide))) {
                            return;
                        }
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
                    } else if (selectedSlideIds && selectedSlideIds.length > 0) {
                        cutSelectedSlides();
                    }
                };
            }

            if (pasteBtn) {
                pasteBtn.onclick = async (e) => {
                    e.stopPropagation();
                    hideCanvasContextMenu();
                    try {
                        const text = await navigator.clipboard.readText();
                        if (!text) return;
                        try {
                            const payload = JSON.parse(text);
                            if (payload && payload.subcastType === "element") {
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
                                    const activeSelection = new fabric.ActiveSelection(newObjects, { canvas: canvas });
                                    canvas.setActiveObject(activeSelection);
                                    canvas.requestRenderAll();
                                }
                                saveStateToHistory();
                            } else if (payload && (payload.subcastType === "slide" || payload.subcastType === "slides")) {
                                pasteSlidesFromClipboardText(text);
                            }
                        } catch (e) {
                            // 일반 텍스트일 때 무시
                        }
                    } catch (err) {
                        console.error("클립보드 읽기 실패:", err);
                    }
                };
            }

            if (deleteBtn) {
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    hideCanvasContextMenu();
                    const activeObj = canvas.getActiveObject();
                    const isTemplateTabActive = document.getElementById('panel-templates')?.classList.contains('active');
                    const isStageBgTabActive = document.getElementById('panel-stage-bg')?.classList.contains('active');
                    const isStageBgVisible = document.getElementById('stage-bg-main-viewer-overlay')?.style.display !== 'none';
                    if (isStageBgTabActive || isStageBgVisible) {
                        if (selectedStageBgFiles && selectedStageBgFiles.length > 0) {
                            if (typeof deleteSelectedStageBgFilesWithConfirm === 'function') deleteSelectedStageBgFilesWithConfirm();
                        }
                        return;
                    }
                    if (activeObj || currentEditingElement) {
                        deleteElement();
                    } else if (isTemplateTabActive && selectedTemplateIds.length > 0) {
                        deleteTemplate();
                    } else if (selectedSlideIds && selectedSlideIds.length > 0) {
                        deleteSelectedSlidesWithConfirm();
                    }
                };
            }
        }
