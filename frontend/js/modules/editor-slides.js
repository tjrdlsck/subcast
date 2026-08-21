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

            if (isSlideSorterOpen) {
                renderSlideSorter();
            }
        }


        function notifyMonitorSlideChange(currentIndex) {
            if (!projectData || !projectData.slides || currentIndex < 0) return;

            const slides = projectData.slides;
            const curSlide = slides[currentIndex];
            const nextSlide = (currentIndex + 1 < slides.length) ? slides[currentIndex + 1] : null;

            const extractText = (slide) => {
                if (!slide || !slide.elements) return "";
                return slide.elements
                    .filter(e => e.type === "text" || e.type === "i-text" || e.type === "textbox")
                    .map(e => e.content || "")
                    .filter(Boolean)
                    .join("\n");
            };

            const curContent = curSlide ? (extractText(curSlide) || slideNameOrFallback(curSlide, currentIndex + 1)) : "";
            const isLastSlide = (currentIndex + 1 >= slides.length);
            const nextContent = isLastSlide ? "[마지막 슬라이드입니다]" : (nextSlide ? (extractText(nextSlide) || slideNameOrFallback(nextSlide, currentIndex + 2)) : "");

            const isPraise = !!(curSlide && (curSlide.slideType === 'praise' || curSlide.isPraise || (curSlide.id && typeof curSlide.id === 'string' && curSlide.id.startsWith('slide_praise_')) || (curSlide.name && typeof curSlide.name === 'string' && (curSlide.name.startsWith('찬양:') || curSlide.name.startsWith('자막(템):')))));

            if (window.BroadcastChannel) {
                try {
                    const bc = new BroadcastChannel("subcast_monitor_channel");
                    bc.postMessage({
                        type: "SLIDE_CHANGE",
                        currentIndex: currentIndex,
                        nextIndex: currentIndex + 1,
                        currentContent: curContent,
                        nextContent: nextContent,
                        isLastSlide: isLastSlide,
                        isPraise: isPraise
                    });
                    bc.close();
                } catch (e) {
                    console.error("Failed to post SLIDE_CHANGE to BroadcastChannel", e);
                }
            }
        }

        function slideNameOrFallback(slide, num) {
            return slide.name ? slide.name : `슬라이드 ${num}`;
        }

        function selectSlideForEdit(slideId, force = false) {
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
            if (typeof updateMonitorSlideTexts === 'function') {
                updateMonitorSlideTexts();
            }
        }


        function saveSlideData() {
            if (window.subcastMonitorEditor && window.subcastMonitorEditor.isMonitorMode && window.subcastMonitorEditor.isMonitorMode()) return;
            if (!activeSlideId || !projectData) return;
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


        // ==========================================================================
        // Slide Sorter (슬라이드 격자 모아보기) 모듈
        // ==========================================================================
        let isSlideSorterOpen = false;
        let sorterCardSize = 220; // 기본 카드 가로 폭 (px)

        function openSlideSorter() {
            // 1. 캔버스 선택 개체 해제 (단축키 오작동 방지)
            if (typeof canvas !== 'undefined' && canvas) {
                canvas.discardActiveObject();
                canvas.requestRenderAll();
            }

            // 2. 다른 메인 오버레이 뷰어가 열려있다면 일괄 닫기 (화면 겹침 방지)
            if (typeof hideBibleMainViewer === 'function') hideBibleMainViewer();
            if (typeof hidePraiseMainViewer === 'function') hidePraiseMainViewer();
            if (typeof hideStageBgMainViewer === 'function') hideStageBgMainViewer();
            if (typeof hideMonitorMainViewer === 'function') hideMonitorMainViewer();
            if (typeof hideBroadcastMainViewer === 'function') hideBroadcastMainViewer();

            // 3. 현재 편집 중인 슬라이드의 최신 캔버스 화면을 실시간 썸네일로 즉시 동기화
            if (activeSlideId && projectData && projectData.slides && typeof canvas !== 'undefined' && canvas) {
                const curSlide = projectData.slides.find(s => s.id === activeSlideId);
                if (curSlide) {
                    const prevZoom = typeof canvasZoom !== 'undefined' ? canvasZoom : 1.0;
                    if (typeof setCanvasZoom === 'function') setCanvasZoom(1.0);
                    if (!canvas.backgroundColor) canvas.backgroundColor = '#000000';
                    curSlide.thumbnail = canvas.toDataURL({ format: 'jpeg', quality: 0.4 });
                    if (typeof setCanvasZoom === 'function') setCanvasZoom(prevZoom);
                }
            }

            isSlideSorterOpen = true;
            document.body.classList.add("slide-sorter-active");
            const overlay = document.getElementById("slide-sorter-overlay");
            if (overlay) {
                overlay.style.display = "flex";
            }
            renderSlideSorter();

            // 활성화된 슬라이드 카드로 부드럽게 스크롤
            setTimeout(() => {
                const activeCard = document.querySelector(`.sorter-card[data-slide-id="${activeSlideId}"]`);
                if (activeCard) {
                    activeCard.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            }, 50);
        }

        function closeSlideSorter() {
            isSlideSorterOpen = false;
            document.body.classList.remove("slide-sorter-active");
            const overlay = document.getElementById("slide-sorter-overlay");
            if (overlay) {
                overlay.style.display = "none";
            }

            // 슬라이드가 모두 삭제된 경우 빈 캔버스 상태 유지
            if (!projectData || !projectData.slides || projectData.slides.length === 0) {
                activeSlideId = null;
                selectedSlideIds = [];
                if (typeof canvas !== 'undefined' && canvas) {
                    canvas.clear();
                    canvas.backgroundColor = '#000000';
                    canvas.requestRenderAll();
                }
            }

            renderSlides();

            // 패널들이 다시 나타난 후 뷰포트 크기에 맞춰 캔버스 리사이징 및 위치 재계산
            const recalculateCanvas = () => {
                if (typeof fitCanvasToScreen === "function") {
                    fitCanvasToScreen();
                }
                if (typeof canvas !== "undefined" && canvas && typeof canvas.calcOffset === "function") {
                    canvas.calcOffset();
                    canvas.requestRenderAll();
                }
            };

            // 1. 즉시 1차 재계산
            requestAnimationFrame(recalculateCanvas);

            // 2. CSS 패널 트랜지션 완료 시점에 2차 보정
            setTimeout(recalculateCanvas, 60);
            setTimeout(recalculateCanvas, 200);
        }

        function toggleSlideSorter() {
            if (isSlideSorterOpen) {
                closeSlideSorter();
            } else {
                openSlideSorter();
            }
        }

        function setSorterZoom(size) {
            sorterCardSize = Math.max(140, Math.min(460, size));
            const gridEl = document.getElementById("slide-sorter-grid");
            const zoomInput = document.getElementById("input-sorter-zoom");
            if (gridEl) {
                gridEl.style.setProperty("--sorter-card-size", `${sorterCardSize}px`);
            }
            if (zoomInput) {
                zoomInput.value = sorterCardSize;
            }
        }

        function renderSlideSorter() {
            const gridEl = document.getElementById("slide-sorter-grid");
            const countEl = document.getElementById("sorter-slide-count");
            if (!gridEl) return;
            gridEl.innerHTML = "";

            if (!projectData || !projectData.slides || projectData.slides.length === 0) {
                if (countEl) countEl.textContent = "총 0개 슬라이드";
                gridEl.innerHTML = `
                    <div style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; color: var(--text-muted);">
                        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.4; margin-bottom: 12px;"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
                        <p style="font-size: 0.95rem; margin-bottom: 12px;">등록된 슬라이드가 없습니다.</p>
                        <button class="btn-template-action" onclick="addSlide()" style="width: auto; padding: 8px 16px; background: var(--primary); color: #fff;">+ 첫 슬라이드 추가</button>
                    </div>
                `;
                return;
            }

            if (countEl) {
                countEl.textContent = `총 ${projectData.slides.length}개 슬라이드`;
            }

            // 우클릭 메뉴 처리
            gridEl.oncontextmenu = (e) => {
                if (e.target === gridEl || e.target.id === "slide-sorter-body") {
                    e.preventDefault();
                    showSlideContextMenu(e.clientX, e.clientY);
                }
            };

            projectData.slides.forEach((slide, index) => {
                const card = document.createElement("div");
                card.className = "sorter-card";
                card.id = `sorter-card-${slide.id}`;
                card.dataset.slideId = slide.id;
                card.dataset.index = index;
                card.setAttribute("draggable", "true");

                if (slide.id === activeSlideId) card.classList.add("editing");
                if (selectedSlideIds.includes(slide.id)) card.classList.add("selected-multi");
                const isLockedByOthers = checkIsLockedByOthers(slide.id);
                if (isLockedByOthers) card.classList.add("locked");

                // 슬라이드 유형 태그 판별
                const isPraise = !!(slide.slideType === 'praise' || slide.isPraise || (typeof slide.id === 'string' && slide.id.startsWith('slide_praise_')) || (slide.name && (slide.name.startsWith('찬양:') || slide.name.startsWith('자막(템):'))));
                const isBible = !!(slide.slideType === 'bible' || (slide.name && slide.name.startsWith('성경:')));
                let tagHtml = '';
                if (isPraise) {
                    tagHtml = `<span class="sorter-card-tag sorter-tag-praise">찬양</span>`;
                } else if (isBible) {
                    tagHtml = `<span class="sorter-card-tag sorter-tag-bible">성경</span>`;
                } else if (slide.id === activeSlideId) {
                    tagHtml = `<span class="sorter-card-tag sorter-tag-editing">편집중</span>`;
                }

                const titleText = slide.name ? slide.name : `슬라이드 ${index + 1}`;

                card.innerHTML = `
                    <div class="sorter-card-index">${index + 1}</div>
                    <div class="sorter-thumbnail-wrapper">
                        ${slide.thumbnail ? `<img src="${slide.thumbnail}" alt="${titleText}" loading="lazy">` : `<span style="font-size: 0.72rem; color: var(--text-muted);">미리보기 없음</span>`}
                    </div>
                    <div class="sorter-card-footer">
                        <span class="sorter-card-title" title="${titleText}">${titleText}</span>
                        ${tagHtml}
                    </div>
                `;

                // 1. 단일 클릭: 슬라이드 선택
                card.onclick = (e) => {
                    if (isLockedByOthers) return;
                    if (e.ctrlKey || e.metaKey) {
                        if (selectedSlideIds.includes(slide.id)) {
                            if (selectedSlideIds.length > 1) {
                                selectedSlideIds = selectedSlideIds.filter(id => id !== slide.id);
                            }
                        } else {
                            selectedSlideIds.push(slide.id);
                        }
                    } else if (e.shiftKey) {
                        const activeIdx = projectData.slides.findIndex(s => s.id === activeSlideId);
                        const clickedIdx = index;
                        if (activeIdx !== -1) {
                            const start = Math.min(activeIdx, clickedIdx);
                            const end = Math.max(activeIdx, clickedIdx);
                            selectedSlideIds = [];
                            for (let i = start; i <= end; i++) {
                                selectedSlideIds.push(projectData.slides[i].id);
                            }
                        }
                    } else {
                        selectedSlideIds = [slide.id];
                    }
                    selectSlideForEdit(slide.id);
                    renderSlideSorter();
                };

                // 2. 더블클릭: 단일 슬라이드 편집기로 즉시 복귀
                card.ondblclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (isLockedByOthers) return;
                    if (typeof switchLeftTab === "function") {
                        switchLeftTab('panel-slides');
                    }
                    selectSlideForEdit(slide.id);
                    closeSlideSorter();
                };

                // 3. 우클릭 컨텍스트 메뉴
                card.oncontextmenu = (e) => {
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

                // 4. 드래그 앤 드롭 (DND) 순서 재배치
                card.addEventListener("dragstart", (e) => {
                    e.dataTransfer.setData("text/plain", index);
                    card.classList.add("dragging");
                });

                card.addEventListener("dragover", (e) => {
                    e.preventDefault();
                    const rect = card.getBoundingClientRect();
                    const relativeX = e.clientX - rect.left;
                    if (relativeX < rect.width / 2) {
                        card.classList.add("drag-over-left");
                        card.classList.remove("drag-over-right");
                    } else {
                        card.classList.remove("drag-over-left");
                        card.classList.add("drag-over-right");
                    }
                });

                card.addEventListener("dragleave", () => {
                    card.classList.remove("drag-over-left", "drag-over-right");
                });

                card.addEventListener("drop", (e) => {
                    e.preventDefault();
                    card.classList.remove("drag-over-left", "drag-over-right");

                    const fromIndex = parseInt(e.dataTransfer.getData("text/plain"));
                    let toIndex = parseInt(card.dataset.index);

                    if (isNaN(fromIndex) || isNaN(toIndex) || fromIndex === toIndex) return;

                    const rect = card.getBoundingClientRect();
                    const relativeX = e.clientX - rect.left;

                    if (relativeX >= rect.width / 2) {
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

                    const updatedSlideIds = projectData.slides.map(s => s.id);
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: "REORDER_SLIDES", slideIds: updatedSlideIds }));
                    }

                    renderSlides();
                    renderSlideSorter();
                });

                card.addEventListener("dragend", () => {
                    card.classList.remove("dragging", "drag-over-left", "drag-over-right");
                });

                gridEl.appendChild(card);
            });
        }

        function initSlideSorterEvents() {
            const btnToggle = document.getElementById("btn-toggle-sorter");
            const btnClose = document.getElementById("btn-close-slide-sorter");
            const btnZoomIn = document.getElementById("btn-sorter-zoom-in");
            const btnZoomOut = document.getElementById("btn-sorter-zoom-out");
            const btnZoomReset = document.getElementById("btn-sorter-zoom-reset");
            const inputZoom = document.getElementById("input-sorter-zoom");
            const sorterOverlay = document.getElementById("slide-sorter-overlay");

            if (btnToggle) btnToggle.onclick = () => toggleSlideSorter();
            if (btnClose) btnClose.onclick = () => closeSlideSorter();

            if (btnZoomIn) {
                btnZoomIn.onclick = () => setSorterZoom(sorterCardSize + 30);
            }
            if (btnZoomOut) {
                btnZoomOut.onclick = () => setSorterZoom(sorterCardSize - 30);
            }
            if (btnZoomReset) {
                btnZoomReset.onclick = () => setSorterZoom(220);
            }
            if (inputZoom) {
                inputZoom.oninput = (e) => setSorterZoom(parseInt(e.target.value, 10));
            }

            // Ctrl + 마우스 휠로 동적 줌 조절
            if (sorterOverlay) {
                sorterOverlay.addEventListener("wheel", (e) => {
                    if (e.ctrlKey) {
                        e.preventDefault();
                        const delta = e.deltaY < 0 ? 25 : -25;
                        setSorterZoom(sorterCardSize + delta);
                    }
                }, { passive: false });
            }
        }

        // 글로벌 노출 및 자동 바인딩
        window.subcastSlideSorter = {
            open: openSlideSorter,
            close: closeSlideSorter,
            toggle: toggleSlideSorter,
            isOpen: () => isSlideSorterOpen,
            render: renderSlideSorter,
            setZoom: setSorterZoom
        };

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", initSlideSorterEvents);
        } else {
            initSlideSorterEvents();
        }



