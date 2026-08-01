// ==========================================================================
// Subcast Module: editor-slides.js
// ==========================================================================

        // 백그라운드에서 썸네일을 자동 생성하는 함수
        function autoGenerateThumbnail(slide) {
            if (slide.thumbnail) return Promise.resolve(slide.thumbnail);

            return new Promise((resolve) => {
                // 1. fabric.StaticCanvas용 임시 캔버스 생성 및 요소 렌더링
                const fabricCanvasEl = document.createElement('canvas');
                fabricCanvasEl.width = BASE_WIDTH;
                fabricCanvasEl.height = BASE_HEIGHT;

                const tempCanvas = new fabric.StaticCanvas(fabricCanvasEl, {
                    backgroundColor: '#000000'
                });

                slide.elements.forEach(elem => {
                    const obj = deserializeElement(elem, BASE_WIDTH, BASE_HEIGHT);
                    if (obj) tempCanvas.add(obj);
                });

                tempCanvas.renderAll();

                // 2. 최종 출력용 캔버스에 검정 배경을 먼저 확실히 칠한 뒤
                //    fabric 렌더링 결과를 그 위에 합성 (fabric의 backgroundColor 미적용 버그 방지)
                const outputCanvasEl = document.createElement('canvas');
                outputCanvasEl.width = BASE_WIDTH;
                outputCanvasEl.height = BASE_HEIGHT;
                const ctx = outputCanvasEl.getContext('2d');
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
                ctx.drawImage(fabricCanvasEl, 0, 0);

                const dataUrl = outputCanvasEl.toDataURL('image/jpeg', 0.4);

                tempCanvas.dispose();
                slide.thumbnail = dataUrl;

                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: "SAVE_SLIDE",
                        slide: slide
                    }));
                }

                resolve(dataUrl);
            });
        }


        function renderSlides() {
            const listEl = document.getElementById("slide-list");
            listEl.innerHTML = "";
            if (!projectData || !projectData.slides) return;

            listEl.oncontextmenu = (e) => {
                // 슬라이드 패널 빈 영역 클릭 시 우클릭 메뉴 노출
                if (e.target === listEl || e.target.classList.contains("panel-body")) {
                    e.preventDefault();
                    showSlideContextMenu(e.clientX, e.clientY);
                }
            };

            projectData.slides.forEach((slide, index) => {
                const item = document.createElement("div");
                item.className = "slide-item";
                item.id = `slide-item-${slide.id}`;
                item.setAttribute("draggable", "true");
                item.dataset.index = index;
                if (slide.id === activeSlideId) item.classList.add("editing");
                if (selectedSlideIds.includes(slide.id)) item.classList.add("selected-multi");
                const isLockedByOthers = checkIsLockedByOthers(slide.id);
                if (isLockedByOthers) item.classList.add("locked");

                const lockOwner = lockedSlides[slide.id];
                let lockName = "다른 편집자";
                if (lockOwner) {
                    if (typeof lockOwner === 'object' && lockOwner.editorName) {
                        lockName = lockOwner.editorName;
                    } else if (typeof lockOwner === 'string') {
                        lockName = lockOwner === myEditorId ? (document.getElementById("editor-name")?.value || "편집자") : "다른 편집자";
                    }
                }

                item.innerHTML = `
                    <!-- 슬라이드 순번 배지 (카드 자체의 왼쪽 위 모서리에 배치) -->
                    <div style="position: absolute; top: -8px; left: -8px; background: var(--primary); color: #fff; font-size: 0.7rem; font-weight: 800; min-width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; border-radius: 50%; border: 1.5px solid var(--bg-color); z-index: 20; font-family: 'Outfit', sans-serif; box-shadow: 0 2px 5px rgba(0,0,0,0.5);">
                        ${index + 1}
                    </div>
                    <div style="position: relative; width: 100%;">
                        <div class="slide-thumbnail-wrapper" style="margin-top: 0;">
                            ${slide.thumbnail ? `<img src="${slide.thumbnail}">` : `<span style="font-size: 0.7rem; color: var(--text-muted);">미리보기 없음</span>`}
                        </div>
                        ${isLockedByOthers ? `<div class="lock-owner-text" style="font-size: 0.75rem; color: var(--accent-live); margin-top: 4px;">🔒 ${lockName}님이 편집 중</div>` : ''}
                    </div>
                `;

                // 드래그 앤 드롭 이벤트 핸들러 바인딩
                item.addEventListener("dragstart", (e) => {
                    e.dataTransfer.setData("text/plain", index);
                    item.classList.add("dragging");
                });

                item.addEventListener("dragover", (e) => {
                    e.preventDefault();
                    const rect = item.getBoundingClientRect();
                    const relativeY = e.clientY - rect.top;
                    if (relativeY < rect.height / 2) {
                        item.style.borderTop = "3px solid var(--primary)";
                        item.style.borderBottom = "";
                    } else {
                        item.style.borderTop = "";
                        item.style.borderBottom = "3px solid var(--primary)";
                    }
                });

                item.addEventListener("dragleave", () => {
                    item.style.borderTop = "";
                    item.style.borderBottom = "";
                });

                item.addEventListener("drop", (e) => {
                    e.preventDefault();
                    item.style.borderTop = "";
                    item.style.borderBottom = "";

                    const fromIndex = parseInt(e.dataTransfer.getData("text/plain"));
                    let toIndex = parseInt(item.dataset.index);

                    if (fromIndex === toIndex) return;

                    const rect = item.getBoundingClientRect();
                    const relativeY = e.clientY - rect.top;

                    // 드롭하는 위치에 따라 앞 또는 뒤 정렬 보정
                    if (relativeY >= rect.height / 2) {
                        if (fromIndex > toIndex) {
                            toIndex = toIndex + 1;
                        }
                    } else {
                        if (fromIndex < toIndex) {
                            toIndex = toIndex - 1;
                        }
                    }

                    const draggedSlide = projectData.slides[fromIndex];
                    projectData.slides.splice(fromIndex, 1);
                    projectData.slides.splice(toIndex, 0, draggedSlide);

                    // 서버 정렬 동기화 메시지 발송
                    const updatedSlideIds = projectData.slides.map(s => s.id);
                    ws.send(JSON.stringify({ type: "REORDER_SLIDES", slideIds: updatedSlideIds }));

                    renderSlides();
                });

                item.addEventListener("dragend", () => {
                    item.classList.remove("dragging");
                    item.style.borderTop = "";
                    item.style.borderBottom = "";
                });

                item.oncontextmenu = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isLockedByOthers) {
                        if (!selectedSlideIds.includes(slide.id)) {
                            selectedSlideIds = [slide.id];
                            selectSlideForEdit(slide.id);
                        }
                    }
                    showSlideContextMenu(e.clientX, e.clientY);
                };

                if (!isLockedByOthers) {
                    item.onclick = (e) => {
                        if (e.ctrlKey || e.metaKey) {
                            if (selectedSlideIds.includes(slide.id)) {
                                if (selectedSlideIds.length > 1) {
                                    selectedSlideIds = selectedSlideIds.filter(id => id !== slide.id);
                                }
                            } else {
                                selectedSlideIds.push(slide.id);
                            }
                        } else if (e.shiftKey) {
                            const activeIndex = projectData.slides.findIndex(s => s.id === activeSlideId);
                            const clickedIndex = index;
                            if (activeIndex !== -1) {
                                const start = Math.min(activeIndex, clickedIndex);
                                const end = Math.max(activeIndex, clickedIndex);
                                selectedSlideIds = [];
                                for (let i = start; i <= end; i++) {
                                    selectedSlideIds.push(projectData.slides[i].id);
                                }
                            }
                        } else {
                            selectedSlideIds = [slide.id];
                        }
                        selectSlideForEdit(slide.id);
                        renderSlides();
                    };
                }
                listEl.appendChild(item);
            });
        }


        function selectSlideForEdit(slideId, force = false) {
            if (isMonitorEditMode) {
                isMonitorEditMode = false;
                restoreNormalCanvas();
            }
            if (activeSlideId === slideId && !force) {
                if (!selectedSlideIds || selectedSlideIds.length === 0) {
                    selectedSlideIds = [slideId];
                }
                return;
            }
            if (activeSlideId) releaseActiveLock();
            activeSlideId = slideId;
            if (!selectedSlideIds.includes(slideId)) {
                selectedSlideIds = [slideId];
            }
            const editorName = document.getElementById("editor-name").value;
            isLockRequested = true;
            ws.send(JSON.stringify({ type: "LOCK_SLIDE", slideId: slideId, editorName: editorName }));
            loadSlideToCanvas(slideId);
            setControlsState(true);
            renderSlides();
        }


        function saveSlideData() {
            if (!activeSlideId || !projectData || isMonitorEditMode) return;
            const slide = projectData.slides.find(s => s.id === activeSlideId);

            const activeObj = canvas.getActiveObject();
            if (activeObj) {
                canvas.discardActiveObject();
                canvas.requestRenderAll();
            }

            // 썸네일 캡처 시 임시로 1.0 줌으로 맞춰 깨지지 않는 고해상도 썸네일을 생성
            const prevZoom = canvasZoom;
            setCanvasZoom(1.0);

            if (!canvas.backgroundColor) canvas.backgroundColor = '#000000';
            const thumbnailData = canvas.toDataURL({
                format: 'jpeg',
                quality: 0.4
            });

            // 캡처 후 이전 사용하던 줌 배율로 원복
            setCanvasZoom(prevZoom);

            if (activeObj) {
                canvas.setActiveObject(activeObj);
                canvas.requestRenderAll();
            }

            // 줌이 배제된 768, 432 해상도 기준으로 원소들을 직렬화하여 서버 저장
            const elements = canvas.getObjects().map(obj => serializeElement(obj, BASE_WIDTH, BASE_HEIGHT));
            const updatedSlide = { id: slide.id, name: slide.name, thumbnail: thumbnailData, elements: elements };
            ws.send(JSON.stringify({ type: "SAVE_SLIDE", slide: updatedSlide }));
            const idx = projectData.slides.findIndex(s => s.id === activeSlideId);
            if (idx !== -1) projectData.slides[idx] = updatedSlide;
            alert("슬라이드가 저장 및 동기화되었습니다.");
            renderSlides();
            setSlideDirty(false);
        }


        function addSlide() {
            ws.send(JSON.stringify({
                type: "ADD_SLIDE",
                afterSlideId: activeSlideId || null
            }));
        }


