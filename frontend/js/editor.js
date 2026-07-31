// CanvasTextBaseline 패치: 브라우저 확장 프로그램 등에서 'alphabetical'을 넣어 발생하는 경고 우회
        (function () {
            if (typeof CanvasRenderingContext2D !== 'undefined') {
                const descriptor = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'textBaseline');
                if (descriptor && descriptor.set) {
                    const originalSet = descriptor.set;
                    Object.defineProperty(CanvasRenderingContext2D.prototype, 'textBaseline', {
                        set: function (value) {
                            if (value === 'alphabetical') {
                                value = 'alphabetic';
                            }
                            originalSet.call(this, value);
                        },
                        get: descriptor.get,
                        enumerable: descriptor.enumerable,
                        configurable: descriptor.configurable
                    });
                }
            }
        })();

        let ws = null;
        let projectData = null;
        let lockedSlides = {};
        let activeSlideId = null;
        let selectedSlideIds = [];
        let canvas = null;
        let myEditorId = null;
        let isLockRequested = false;
        let currentEditingElement = null;
        let undoStack = [];
        let redoStack = [];
        let isUndoingRedoing = false;

        function checkIsLockedByOthers(slideId) {
            if (!lockedSlides || !slideId) return false;
            const lock = lockedSlides[slideId];
            if (!lock) return false;

            let ownerId = null;
            if (typeof lock === 'string') {
                ownerId = lock;
            } else if (lock && typeof lock === 'object') {
                ownerId = lock.ownerId;
            }
            return ownerId !== null && myEditorId !== null && ownerId !== myEditorId;
        }

        // 줌 배율 제어를 위한 상수 및 변수
        let canvasZoom = 1.0;
        let userZoomFactor = 1.0;
        let isSlideDirty = false;
        const BASE_WIDTH = 768;
        const BASE_HEIGHT = 432;

        // 다양한 형식의 색상 문자열을 hex 코드(#rrggbb)로 변환해주는 안전한 헬퍼 함수
        function colorToHex(color) {
            if (!color) return "#ffffff";
            if (color === "transparent") return "#ffffff";
            if (color.startsWith("#")) return color;

            // rgb/rgba 변환 또는 HTML5 Canvas fillStyle 리턴값의 안정성을 위한 임시 Canvas Context 파서 활용
            try {
                const ctx = document.createElement('canvas').getContext('2d');
                ctx.fillStyle = color;
                const parsedColor = ctx.fillStyle;
                if (parsedColor.startsWith("#")) {
                    return parsedColor;
                }
            } catch (e) {
                // 파싱 에러 방어
            }

            // 기본 Regex 매칭 방어 코드
            const match = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)$/i);
            if (match) {
                const r = parseInt(match[1]).toString(16).padStart(2, '0');
                const g = parseInt(match[2]).toString(16).padStart(2, '0');
                const b = parseInt(match[3]).toString(16).padStart(2, '0');
                return `#${r}${g}${b}`;
            }
            return "#ffffff";
        }

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

        // 캔버스 줌 배율 변경 처리
        function setCanvasZoom(zoom) {
            canvasZoom = zoom;
            canvas.setZoom(canvasZoom);
            canvas.setWidth(BASE_WIDTH * canvasZoom);
            canvas.setHeight(BASE_HEIGHT * canvasZoom);

            // DOM Wrapper 크기 동적 조절
            const wrapper = document.querySelector('.canvas-wrapper');
            if (wrapper) {
                wrapper.style.width = `${BASE_WIDTH * canvasZoom}px`;
                wrapper.style.height = `${BASE_HEIGHT * canvasZoom}px`;
            }

            canvas.renderAll();
            document.getElementById("zoom-percent").innerText = `${Math.round(userZoomFactor * 100)}%`;
        }

        // 브라우저 뷰포트 크기에 맞춰 캔버스를 최적 비율로 줌 조정하는 함수
        function fitCanvasToScreen() {
            if (!canvas) return;
            const viewport = document.querySelector('.canvas-viewport');
            if (!viewport) return;

            // 패딩(80px) 등을 제외한 가용 너비 및 높이 계산
            const paddingX = 80;
            const paddingY = 80;

            const availWidth = Math.max(100, viewport.clientWidth - paddingX);
            const availHeight = Math.max(100, viewport.clientHeight - paddingY);

            const ratioX = availWidth / BASE_WIDTH;
            const ratioY = availHeight / BASE_HEIGHT;

            // 화면에 딱 맞게 채우는 기준 줌 배율
            const baseZoom = Math.min(ratioX, ratioY);

            // 최종 줌 배율 = 기준 줌 * 사용자 수동 줌 계수
            let finalZoom = baseZoom * userZoomFactor;

            // 최종 줌의 과도한 변형 방지 범위 한계 설정 (0.2 ~ 4.0배)
            finalZoom = Math.max(0.2, Math.min(finalZoom, 4.0));

            setCanvasZoom(finalZoom);
        }

        // 왼쪽 탭 메뉴 전환
        function switchLeftTab(tabId) {
            document.querySelectorAll('.nav-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-target') === tabId);
            });
            document.querySelectorAll('.sidebar-panel').forEach(panel => {
                panel.classList.toggle('active', panel.id === tabId);
            });

            // 탭 클릭 시 닫혀있던 서브 패널이 있으면 자동으로 펼침
            const subPanel = document.querySelector(".left-sub-panel");
            if (subPanel && subPanel.classList.contains("collapsed")) {
                subPanel.classList.remove("collapsed");
                const arrowIcon = document.getElementById("toggle-arrow-icon");
                if (arrowIcon) {
                    arrowIcon.style.transform = "rotate(0deg)";
                }
                fitCanvasToScreen();
            }

            // 성경 탭이 아닐 경우 성경 메인 표 뷰어 숨김
            if (tabId !== 'panel-bible') {
                hideBibleMainViewer();
            }
            // 찬양 탭이 아닐 경우 찬양 메인 뷰어 숨김
            if (tabId !== 'panel-praise') {
                hidePraiseMainViewer();
            }
            // 현장 배경 탭 처리
            if (tabId === 'panel-stage-bg') {
                showStageBgMainViewer();
            } else {
                hideStageBgMainViewer();
            }
            // 모니터링 탭 처리
            if (tabId === 'panel-monitor') {
                if (!isMonitorEditMode) {
                    isMonitorEditMode = true;
                    loadMonitorCanvasToEditor();
                }
            } else {
                if (isMonitorEditMode) {
                    isMonitorEditMode = false;
                    restoreNormalCanvas();
                }
            }
        }

        function initCanvas() {
            canvas = new fabric.Canvas('editor-canvas', {
                width: BASE_WIDTH,
                height: BASE_HEIGHT,
                backgroundColor: '#000000',
                preserveObjectStacking: true
            });
            canvas.on('selection:created', (e) => { onObjectSelected(e); updateLayerList(); });
            canvas.on('selection:updated', (e) => { onObjectSelected(e); updateLayerList(); });
            canvas.on('selection:cleared', (e) => { onObjectCleared(e); updateLayerList(); });
            // 드래그 시작 시점의 위치 기록
            canvas.on('before:transform', function (opt) {
                const obj = opt.transform ? opt.transform.target : null;
                if (obj) {
                    obj._dragStartX = obj.left;
                    obj._dragStartY = obj.top;
                }
            });

            canvas.on('object:moving', (e) => {
                const obj = e.target;
                if (obj) {
                    // Shift 키 드래그 락 직선 정렬 제한
                    const isShift = e.e && e.e.shiftKey;
                    if (isShift && obj._dragStartX !== undefined && obj._dragStartY !== undefined) {
                        const dx = Math.abs(obj.left - obj._dragStartX);
                        const dy = Math.abs(obj.top - obj._dragStartY);

                        if (dx > dy) {
                            obj.set('top', obj._dragStartY);
                        } else {
                            obj.set('left', obj._dragStartX);
                        }
                    }
                }
                onObjectModified(e);
                updateInspectorCoords();
            });
            canvas.on('object:scaling', (e) => { onObjectModified(e); updateInspectorCoords(); });
            canvas.on('object:added', () => { saveStateToHistory(); updateLayerList(); });
            canvas.on('object:removed', () => { saveStateToHistory(); updateLayerList(); });
            canvas.on('object:modified', () => { saveStateToHistory(); updateLayerList(); });

            // Alt 키 또는 Ctrl 키를 누르고 마우스 휠 스크롤 시 스무스한 확대/축소 지원
            canvas.on('mouse:wheel', function (opt) {
                if (opt.e.ctrlKey || opt.e.altKey) {
                    var delta = opt.e.deltaY;
                    if (delta > 0) {
                        userZoomFactor = Math.max(userZoomFactor - 0.05, 0.3); // 최소 30%
                    } else {
                        userZoomFactor = Math.min(userZoomFactor + 0.05, 3.0); // 최대 300%
                    }
                    fitCanvasToScreen();
                    opt.e.preventDefault();
                    opt.e.stopPropagation();
                }
            });
        }

        let lastCheckedIndex = -1;

        function handleCheckboxClick(e, index) {
            e.stopPropagation();
            const checkboxes = document.querySelectorAll(".slide-select-checkbox");

            if (e.shiftKey && lastCheckedIndex !== -1) {
                const start = Math.min(index, lastCheckedIndex);
                const end = Math.max(index, lastCheckedIndex);
                const targetState = e.target.checked;

                for (let i = start; i <= end; i++) {
                    checkboxes[i].checked = targetState;
                }
            }
            lastCheckedIndex = index;
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

        // 위/아래 방향키를 이용한 슬라이드 이동 단축키 연동
        document.addEventListener("keydown", (e) => {
            // 텍스트 인풋 상자, 폼 편집 상태 또는 캔버스 내 디자인 요소가 선택된 상태일 때는 방향키 슬라이드 이동을 바이패스
            const activeEl = document.activeElement;
            const hasActiveCanvasObj = typeof canvas !== 'undefined' && canvas && canvas.getActiveObject();
            const isStageBgVisible = document.getElementById('stage-bg-main-viewer-overlay')?.style.display !== 'none';
            const isBibleVisible = document.getElementById('bible-main-viewer-overlay')?.style.display !== 'none';
            const isPraiseVisible = document.getElementById('praise-main-viewer-overlay')?.style.display !== 'none';
            const isStageBgTabActive = document.getElementById('panel-stage-bg')?.classList.contains('active');

            if (
                (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.isContentEditable)) ||
                hasActiveCanvasObj ||
                isStageBgVisible || isBibleVisible || isPraiseVisible || isStageBgTabActive
            ) {
                return;
            }

            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                if (!projectData || !projectData.slides || projectData.slides.length === 0) return;
                if (!activeSlideId) return;

                const currentIndex = projectData.slides.findIndex(s => s.id === activeSlideId);
                if (currentIndex === -1) return;

                let targetIndex = -1;
                if (e.key === "ArrowUp") {
                    if (currentIndex > 0) {
                        targetIndex = currentIndex - 1;
                    }
                } else if (e.key === "ArrowDown") {
                    if (currentIndex < projectData.slides.length - 1) {
                        targetIndex = currentIndex + 1;
                    }
                }

                if (targetIndex !== -1) {
                    e.preventDefault();
                    const targetSlide = projectData.slides[targetIndex];
                    selectSlideForEdit(targetSlide.id);
                }
            }
        });

        function releaseActiveLock() {
            if (ws && ws.readyState === WebSocket.OPEN && activeSlideId) {
                ws.send(JSON.stringify({ type: "UNLOCK_SLIDE", slideId: activeSlideId }));
            }
        }

        function deserializeElement(elem, canvasWidth, canvasHeight, isInsideGroup = false, groupW = 1, groupH = 1) {
            let x, y, w, h;
            if (isInsideGroup) {
                x = (elem.x / 100) * groupW;
                y = (elem.y / 100) * groupH;
                w = (elem.width / 100) * groupW;
                h = (elem.height / 100) * groupH;
            } else {
                x = (elem.x / 100) * canvasWidth;
                y = (elem.y / 100) * canvasHeight;
                w = (elem.width / 100) * canvasWidth;
                h = (elem.height / 100) * canvasHeight;
            }
            let obj = null;
            const opacity = elem.style?.opacity !== undefined ? elem.style.opacity : 1.0;
            if (elem.type === 'text') {
                let fontSize = 20;
                if (elem.style?.fontSize) {
                    const match = elem.style.fontSize.match(/^(\d+(?:\.\d+)?)\s*vw$/);
                    fontSize = match ? (parseFloat(match[1]) / 100) * canvasWidth : parseInt(elem.style.fontSize) || 20;
                }
                const textOptions = { left: x, top: y, width: w > 50 ? w : 250, fontSize: fontSize, fill: elem.style?.fontColor || '#ffffff', stroke: elem.style?.strokeColor || 'transparent', strokeWidth: elem.style?.strokeWidth !== undefined ? elem.style.strokeWidth : 0, fontFamily: elem.style?.fontFamily || 'Inter', fontWeight: elem.style?.fontWeight || 'normal', fontStyle: elem.style?.fontStyle || 'normal', textAlign: elem.style?.textAlign || 'left', opacity: opacity, selectable: !isInsideGroup, hasControls: !isInsideGroup, originalId: elem.id, originalVwSize: elem.style?.fontSize || "3vw", paintFirst: 'stroke' };
                obj = isInsideGroup ? new fabric.Text(elem.content, textOptions) : new fabric.Textbox(elem.content, textOptions);
            } else if (elem.type === 'rect') {
                obj = new fabric.Rect({ left: x, top: y, width: w, height: h, rx: elem.style?.cornerRadius || 0, ry: elem.style?.cornerRadius || 0, fill: elem.style?.fillColor || '#4f46e5', stroke: elem.style?.strokeColor || 'transparent', strokeWidth: elem.style?.strokeWidth !== undefined ? elem.style.strokeWidth : 0, opacity: opacity, selectable: !isInsideGroup, hasControls: !isInsideGroup, originalId: elem.id });
            } else if (elem.type === 'circle') {
                obj = new fabric.Circle({ left: x, top: y, radius: w / 2 || 30, fill: elem.style?.fillColor || '#06b6d4', stroke: elem.style?.strokeColor || 'transparent', strokeWidth: elem.style?.strokeWidth !== undefined ? elem.style.strokeWidth : 0, opacity: opacity, selectable: !isInsideGroup, hasControls: !isInsideGroup, originalId: elem.id });
            } else if (elem.type === 'triangle') {
                obj = new fabric.Triangle({ left: x, top: y, width: w, height: h, fill: elem.style?.fillColor || '#10b981', stroke: elem.style?.strokeColor || 'transparent', strokeWidth: elem.style?.strokeWidth !== undefined ? elem.style.strokeWidth : 0, opacity: opacity, selectable: !isInsideGroup, hasControls: !isInsideGroup, originalId: elem.id });
            } else if (elem.type === 'line') {
                obj = new fabric.Line([x, y, x + w, y], { stroke: elem.style?.fillColor || elem.style?.strokeColor || '#f59e0b', strokeWidth: elem.style?.strokeWidth !== undefined && elem.style?.strokeWidth > 0 ? elem.style.strokeWidth : 4, opacity: opacity, selectable: !isInsideGroup, hasControls: !isInsideGroup, originalId: elem.id });
            } else if (elem.type === 'group' && elem.children) {
                const members = elem.children.map(child => deserializeElement(child, canvasWidth, canvasHeight, true, w, h));
                obj = new fabric.Group(members, { left: x, top: y, opacity: opacity, selectable: !isInsideGroup, hasControls: !isInsideGroup, originalId: elem.id });
            }
            return obj;
        }

        function serializeElement(obj, canvasWidth, canvasHeight, isInsideGroup = false, groupW = 1, groupH = 1) {
            let xPct, yPct, wPct, hPct;
            if (isInsideGroup) {
                xPct = (obj.left / groupW) * 100;
                yPct = (obj.top / groupH) * 100;
                wPct = ((obj.width * obj.scaleX) / groupW) * 100;
                hPct = ((obj.height * obj.scaleY) / groupH) * 100;
            } else {
                xPct = (obj.left / canvasWidth) * 100;
                yPct = (obj.top / canvasHeight) * 100;
                wPct = obj.type === 'circle' ? (((obj.radius * (obj.scaleX || 1)) * 2) / canvasWidth) * 100 : ((obj.width * obj.scaleX) / canvasWidth) * 100;
                hPct = obj.type === 'circle' ? (((obj.radius * (obj.scaleY || 1)) * 2) / canvasHeight) * 100 : ((obj.height * obj.scaleY) / canvasHeight) * 100;
            }
            const type = (obj.type === 'textbox' || obj.type === 'text') ? 'text' : obj.type;
            const style = { opacity: obj.opacity !== undefined ? parseFloat(obj.opacity.toFixed(2)) : 1.0 };
            if (type === 'text') {
                style.fontSize = obj.originalVwSize || "3vw";
                style.fontColor = obj.fill || "#ffffff";
                style.fontFamily = obj.fontFamily || "Inter";
                style.fontWeight = obj.fontWeight || "normal";
                style.fontStyle = obj.fontStyle || "normal";
                style.textAlign = obj.textAlign || "left";
                style.strokeColor = obj.stroke || "transparent";
                style.strokeWidth = Math.round(obj.strokeWidth || 0);
            } else if (['rect', 'circle', 'triangle', 'line'].includes(type)) {
                style.fillColor = obj.fill || "transparent";
                style.strokeColor = obj.stroke || "transparent";
                style.strokeWidth = Math.round(obj.strokeWidth || 0);
                if (type === 'rect') style.cornerRadius = obj.rx || 0;
            }
            const elementData = { id: obj.originalId || `elem_${Math.random().toString(36).substr(2, 9)}`, type: type, content: type === 'text' ? (obj.text || "") : "", x: parseFloat(xPct.toFixed(2)), y: parseFloat(yPct.toFixed(2)), width: parseFloat(wPct.toFixed(2)), height: parseFloat(hPct.toFixed(2)), style: style };
            if (type === 'group') {
                elementData.children = obj.getObjects().map(child => serializeElement(child, canvasWidth, canvasHeight, true, obj.width * obj.scaleX, obj.height * obj.scaleY));
            }
            return elementData;
        }

        let autoSaveTimeoutId = null;

        function updateAutoSaveStatus(status, text) {
            const iconEl = document.getElementById("autosave-status-icon");
            const textEl = document.getElementById("autosave-status-text");
            if (!iconEl || !textEl) return;

            textEl.innerText = text;
            if (status === "saved") {
                iconEl.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12,10a4,4,0,1,0,4,4A4,4,0,0,0,12,10Zm0,6a2,2,0,1,1,2-2A2,2,0,0,1,12,16Z"/><path d="M22.536,4.122,19.878,1.464A4.966,4.966,0,0,0,16.343,0H5A5.006,5.006,0,0,0,0,5V19a5.006,5.006,0,0,0,5,5H19a5.006,5.006,0,0,0,5-5V7.657A4.966,4.966,0,0,0,22.536,4.122ZM17,2.08V3a3,3,0,0,1-3,3H10A3,3,0,0,1,7,3V2h9.343A2.953,2.953,0,0,1,17,2.08ZM22,19a3,3,0,0,1-3,3H5a3,3,0,0,1-3-3V5A3,3,0,0,1,5,2V3a5.006,5.006,0,0,0,5,5h4a4.991,4.991,0,0,0,4.962-4.624l2.16,2.16A3.02,3.02,0,0,1,22,7.657Z"/></svg>`;
                iconEl.style.animation = "none";
            } else if (status === "pending") {
                iconEl.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12,24A12,12,0,0,1,3.485,3.485,1,1,0,0,1,4.9,4.9,10,10,0,1,0,12,2V0a1,1,0,0,1,1,1V5a1,1,0,0,1-1,1H7a1,1,0,0,1,0-2H9.6A11.936,11.936,0,0,1,12,0,12.013,12.013,0,0,1,12,24Z"/></svg>`;
                iconEl.style.animation = "spin 1s linear infinite";
            } else if (status === "error") {
                iconEl.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M11,13V7c0-.55,.45-1,1-1s1,.45,1,1v6c0,.55-.45,1-1,1s-1-.45-1-1Zm1,2c-.83,0-1.5,.67-1.5,1.5s.67,1.5,1.5,1.5,1.5-.67,1.5-1.5-.67-1.5-1.5-1.5Zm11.58,4.88c-.7,1.35-2.17,2.12-4.01,2.12H4.44c-1.85,0-3.31-.77-4.01-2.12-.71-1.36-.51-3.1,.5-4.56L8.97,2.6c.71-1.02,1.83-1.6,3.03-1.6s2.32,.58,3,1.57l8.08,12.77c1.01,1.46,1.2,3.19,.49,4.54Zm-2.15-3.42s-.02-.02-.02-.04L13.34,3.67c-.29-.41-.79-.67-1.34-.67s-1.05,.26-1.36,.71L2.59,16.42c-.62,.88-.76,1.84-.4,2.53,.35,.68,1.15,1.05,2.24,1.05h15.12c1.09,0,1.89-.37,2.24-1.05,.36-.69,.22-1.65-.37-2.49Z"/></svg>`;
                iconEl.style.animation = "none";
            }
        }

        function triggerAutoSave() {
            if (!activeSlideId || !projectData) return;

            if (!navigator.onLine) {
                updateAutoSaveStatus("error", "연결 끊김 - 저장 불가");
                return;
            }

            const isMyLock = lockedSlides[activeSlideId]?.ownerId === myEditorId;
            if (!isMyLock) {
                return;
            }

            if (autoSaveTimeoutId) {
                clearTimeout(autoSaveTimeoutId);
            }

            updateAutoSaveStatus("pending", "저장 중...");

            autoSaveTimeoutId = setTimeout(() => {
                performAutoSave();
            }, 1000);
        }

        function performAutoSave() {
            if (!activeSlideId || !projectData) return;
            const slide = projectData.slides.find(s => s.id === activeSlideId);
            if (!slide) return;

            const prevZoom = canvasZoom;
            setCanvasZoom(1.0);
            if (!canvas.backgroundColor) canvas.backgroundColor = '#000000';
            const thumbnailData = canvas.toDataURL({
                format: 'jpeg',
                quality: 0.4
            });
            setCanvasZoom(prevZoom);

            const elements = canvas.getObjects().map(obj => serializeElement(obj, BASE_WIDTH, BASE_HEIGHT));
            const updatedSlide = { id: slide.id, name: slide.name, thumbnail: thumbnailData, elements: elements };

            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "SAVE_SLIDE", slide: updatedSlide }));
                const idx = projectData.slides.findIndex(s => s.id === activeSlideId);
                if (idx !== -1) projectData.slides[idx] = updatedSlide;
                renderSlides();
                setSlideDirty(false);
                updateAutoSaveStatus("saved", "모든 변경사항 저장됨");
            } else {
                updateAutoSaveStatus("error", "저장 실패 - 연결 끊김");
            }
        }

        function setSlideDirty(dirty) {
            isSlideDirty = dirty;
        }

        function loadSlideToCanvas(slideId) {
            isUndoingRedoing = true;
            canvas.clear();
            canvas.backgroundColor = '#000000';
            const slide = projectData.slides.find(s => s.id === slideId);
            if (!slide) {
                isUndoingRedoing = false;
                return;
            }
            slide.elements.forEach(elem => {
                // 줌이 반영되지 않은 768, 432 기본 기준 크기로 요소 배치
                const obj = deserializeElement(elem, BASE_WIDTH, BASE_HEIGHT);
                if (obj) canvas.add(obj);
            });
            // 캔버스 로드 시 화면 크기에 맞춰 자동 줌 설정
            fitCanvasToScreen();

            // 히스토리 상태 초기화
            undoStack = [canvas.getObjects().map(obj => serializeElement(obj, BASE_WIDTH, BASE_HEIGHT))];
            redoStack = [];
            isUndoingRedoing = false;
            setSlideDirty(false);
            updateLayerList();
        }

        function saveStateToHistory() {
            if (isUndoingRedoing) return;
            const currentState = canvas.getObjects().map(obj => serializeElement(obj, BASE_WIDTH, BASE_HEIGHT));
            const stateStr = JSON.stringify(currentState);

            // 이전 상태와 동일하다면 중복 저장을 방지하기 위한 체크
            if (undoStack.length > 0 && JSON.stringify(undoStack[undoStack.length - 1]) === stateStr) {
                return;
            }

            undoStack.push(currentState);
            redoStack = [];
            setSlideDirty(true);
            triggerAutoSave();
        }

        function undo() {
            if (undoStack.length <= 1) return;

            isUndoingRedoing = true;
            const currentState = undoStack.pop();
            redoStack.push(currentState);

            const prevState = undoStack[undoStack.length - 1];
            applyStateToCanvas(prevState);
            setSlideDirty(undoStack.length > 1);
        }

        function redo() {
            if (redoStack.length === 0) return;

            isUndoingRedoing = true;
            const nextState = redoStack.pop();
            undoStack.push(nextState);

            applyStateToCanvas(nextState);
            setSlideDirty(true);
        }

        function applyStateToCanvas(state) {
            canvas.clear();
            canvas.backgroundColor = '#000000';
            if (state && Array.isArray(state)) {
                state.forEach(elem => {
                    const obj = deserializeElement(elem, BASE_WIDTH, BASE_HEIGHT);
                    if (obj) canvas.add(obj);
                });
            }
            setCanvasZoom(canvasZoom);
            canvas.renderAll();
            onObjectCleared();
            isUndoingRedoing = false;
            updateLayerList();
            triggerAutoSave();
        }

        function setControlsState(enabled) {
            ['btn-add-text-title', 'btn-add-text-subtitle', 'btn-add-text-body', 'btn-add-rect', 'btn-add-circle', 'btn-add-triangle', 'btn-add-line', 'btn-save', 'btn-cancel', 'btn-save-template', 'btn-apply-template-bulk', 'btn-delete-template', 'btn-undo-template'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.disabled = !enabled;
            });
            if (enabled) {
                updateTemplateActionButtons();
            }
            if (!enabled) onObjectCleared();
        }

        let isUpdatingLayerList = false;
        function updateLayerList() {
            if (isUpdatingLayerList || isUndoingRedoing) return;
            isUpdatingLayerList = true;

            const layerListEl = document.getElementById("layer-list");
            if (!layerListEl) {
                isUpdatingLayerList = false;
                return;
            }

            if (!canvas) {
                layerListEl.innerHTML = '<div style="font-size: 0.75rem; color: var(--text-muted); text-align: center; padding: 20px;">캔버스가 초기화되지 않았습니다.</div>';
                isUpdatingLayerList = false;
                return;
            }

            const objects = canvas.getObjects();
            if (objects.length === 0) {
                layerListEl.innerHTML = '<div style="font-size: 0.75rem; color: var(--text-muted); text-align: center; padding: 20px;">생성된 레이어가 없습니다.</div>';
                isUpdatingLayerList = false;
                return;
            }

            layerListEl.innerHTML = "";
            const activeObj = canvas.getActiveObject();

            for (let i = objects.length - 1; i >= 0; i--) {
                const obj = objects[i];

                const itemEl = document.createElement("div");
                itemEl.className = "layer-item";

                let isActive = false;
                if (activeObj) {
                    if (activeObj === obj) {
                        isActive = true;
                    } else if (activeObj.type === 'activeSelection') {
                        isActive = activeObj.getObjects().includes(obj);
                    }
                }
                if (isActive) {
                    itemEl.classList.add("active");
                }

                let icon = `<svg viewBox="0 0 24 24"><path d="M17.115,8.05A1.5,1.5,0,1,0,18.95,9.115,1.5,1.5,0,0,0,17.115,8.05Z"/><path d="M12.115,5.05A1.5,1.5,0,1,0,13.95,6.115,1.5,1.5,0,0,0,12.115,5.05Z"/><path d="M7.115,8.05A1.5,1.5,0,1,0,8.95,9.115,1.5,1.5,0,0,0,7.115,8.05Z"/><path d="M7.115,14.05A1.5,1.5,0,1,0,8.95,15.115,1.5,1.5,0,0,0,7.115,14.05Z"/><path d="M12.5.007A12,12,0,0,0,.083,12a12.014,12.014,0,0,0,12,12c.338,0,.67-.022,1-.05a1,1,0,0,0,.916-1l-.032-3.588A3.567,3.567,0,0,1,20.057,16.8l.1.1a1.912,1.912,0,0,0,1.769.521,1.888,1.888,0,0,0,1.377-1.177A11.924,11.924,0,0,0,24.08,11.7,12.155,12.155,0,0,0,12.5.007Zm8.982,15.4-.014-.014a5.567,5.567,0,0,0-9.5,3.985L11.992,22a10,10,0,0,1,.09-20c.117,0,.235,0,.353.006a10.127,10.127,0,0,1,9.645,9.743A9.892,9.892,0,0,1,21.485,15.4Z"/></svg>`;
                let name = "개체";

                if (obj.type === "textbox" || obj.type === "text") {
                    icon = `<svg viewBox="0 0 24 24"><path d="m16,9c0,.553-.447,1-1,1h-2v6c0,.553-.447,1-1,1s-1-.447-1-1v-6h-2c-.553,0-1-.447-1-1s.447-1,1-1h6c.553,0,1,.447,1,1Zm8,11.5c0,1.93-1.57,3.5-3.5,3.5-1.393,0-2.599-.819-3.162-2H6.662c-.563,1.181-1.769,2-3.162,2-1.93,0-3.5-1.57-3.5-3.5,0-1.393.819-2.599,2-3.162V6.662c-1.181-.563-2-1.769-2-3.162C0,1.57,1.57,0,3.5,0c1.393,0,2.599.819,3.162,2h10.677c.563-1.181,1.769-2,3.162-2,1.93,0,3.5,1.57,3.5,3.5,0,1.393-.819,2.599-2,3.162v10.677c1.181.563,2,1.769,2,3.162Zm-4-3.464V6.964c-1.53-.22-2.744-1.434-2.964-2.964H6.964c-.22,1.53-1.434,2.744-2.964,2.964v10.072c1.53.22,2.744,1.434,2.964,2.964h10.072c.22-1.53,1.434-2.744,2.964-2.964Zm-1-13.536c0,.827.673,1.5,1.5,1.5s1.5-.673,1.5-1.5-.673-1.5-1.5-1.5-1.5.673-1.5,1.5ZM2,3.5c0,.827.673,1.5,1.5,1.5s1.5-.673,1.5-1.5-.673-1.5-1.5-1.5-1.5.673-1.5,1.5Zm3,17c0-.827-.673-1.5-1.5-1.5s-1.5.673-1.5,1.5.673,1.5,1.5,1.5,1.5-.673,1.5-1.5Zm17,0c0-.827-.673-1.5-1.5-1.5s-1.5.673-1.5,1.5.673,1.5,1.5,1.5,1.5-.673,1.5-1.5Z"/></svg>`;
                    const textSnippet = obj.text ? obj.text.substring(0, 10).replace(/\n/g, " ") : "";
                    name = textSnippet ? `"${textSnippet}"` : "텍스트";
                } else if (obj.type === "rect") {
                    icon = `<svg viewBox="0 0 24 24"><path d="m19.5,24H4.5c-2.481,0-4.5-2.019-4.5-4.5V4.5C0,2.019,2.019,0,4.5,0h15c2.481,0,4.5,2.019,4.5,4.5v15c0,2.481-2.019,4.5-4.5,4.5ZM4.5,1c-1.93,0-3.5,1.57-3.5,3.5v15c0,1.93,1.57,3.5,3.5,3.5h15c1.93,0,3.5-1.57,3.5-3.5V4.5c0-1.93-1.57-3.5-3.5-3.5H4.5Z"/></svg>`;
                    name = "사각형";
                } else if (obj.type === "circle") {
                    icon = `<svg viewBox="0 0 24 24"><path d="M12,24A12,12,0,1,1,24,12,12.013,12.013,0,0,1,12,24ZM12,2A10,10,0,1,0,22,12,10.011,10.011,0,0,0,12,2Z"/></svg>`;
                    name = "원형";
                } else if (obj.type === "triangle") {
                    icon = `<svg viewBox="0 0 24 24"><path d="M19.948,24H4.052A4.03,4.03,0,0,1,.6,22.088a3.947,3.947,0,0,1-.182-3.86L8.38,4.212a4.068,4.068,0,0,1,7.253.026l7.922,13.941a3.967,3.967,0,0,1-.156,3.909A4.03,4.03,0,0,1,19.948,24ZM12,4a2.013,2.013,0,0,0-1.842,1.129l-.026.049L2.184,19.167A1.919,1.919,0,0,0,2.3,21.034,2.044,2.044,0,0,0,4.052,22h15.9a2.044,2.044,0,0,0,1.752-.966,1.937,1.937,0,0,0,.09-1.916L13.868,5.178A2.039,2.039,0,0,0,12,4Z"/></svg>`;
                    name = "삼각형";
                } else if (obj.type === "line") {
                    icon = `<svg viewBox="0 0 24 24"><path d="M23,13H1c-.553,0-1-.447-1-1s.447-1,1-1H23c.553,0,1,.447,1,1s-.447,1-1,1Z"/></svg>`;
                    name = "직선";
                } else if (obj.type === "group") {
                    icon = `<svg viewBox="0 0 24 24"><path d="M23.707,2.293a1,1,0,0,0-1.414,0L18.664,5.922a1.008,1.008,0,0,0,0,1.414l3.629,3.629a1,1,0,0,0,1.414,0l.024-.024a5,5,0,0,0,0-7.071ZM22.3,9.55,19.45,6.7,20.7,5.45A3,3,0,0,1,24,6.75ZM6.242,12.758a1,1,0,0,0,0,1.414l3.586,3.586a1,1,0,0,0,1.414,0L21.485,7.515,16.485,2.515ZM10.535,16.343,7.657,13.465,16.485,4.636l2.879,2.879ZM1.121,22.879A1,1,0,0,0,2.159,23.9l4.586-1.529L1.758,17.385ZM4.94,14.06l5,5L8.526,20.473a1,1,0,0,1-.586.293L2.94,22.432,4.646,17.432a1,1,0,0,1,.293-.586Z"/></svg>`;
                    name = `그룹 (${obj.getObjects().length})`;
                } else {
                    name = obj.type;
                }

                itemEl.innerHTML = `
                    <div class="layer-info">
                        <span class="layer-icon">${icon}</span>
                        <span class="layer-name" title="${name}">${name}</span>
                    </div>
                    <div class="layer-actions">
                        <button class="layer-action-btn btn-summon" title="화면 중앙으로 소환">🎯</button>
                        <button class="layer-action-btn btn-delete" title="개체 삭제">x</button>
                    </div>
                `;

                itemEl.onclick = (e) => {
                    if (e.target.closest(".layer-action-btn")) return;
                    canvas.setActiveObject(obj);
                    canvas.renderAll();
                };

                itemEl.querySelector(".btn-summon").onclick = (e) => {
                    e.stopPropagation();
                    obj.center();
                    obj.setCoords();
                    canvas.setActiveObject(obj);
                    canvas.renderAll();
                    saveStateToHistory();
                    updateLayerList();
                    updateInspectorCoords();
                };

                itemEl.querySelector(".btn-delete").onclick = (e) => {
                    e.stopPropagation();
                    canvas.remove(obj);
                    canvas.renderAll();
                    saveStateToHistory();
                    updateLayerList();
                };

                layerListEl.appendChild(itemEl);
            }
            isUpdatingLayerList = false;
        }

        function updateInspectorCoords() {
            const activeObj = canvas.getActiveObject();
            if (!activeObj) return;
            const leftInput = document.getElementById("element-left");
            const topInput = document.getElementById("element-top");
            const widthInput = document.getElementById("element-width");
            const heightInput = document.getElementById("element-height");

            if (leftInput) leftInput.value = Math.round(activeObj.left);
            if (topInput) topInput.value = Math.round(activeObj.top);
            if (widthInput) widthInput.value = Math.round(activeObj.width * (activeObj.scaleX || 1));
            if (heightInput) heightInput.value = Math.round(activeObj.height * (activeObj.scaleY || 1));
        }

        function onObjectSelected(e) {
            const activeObj = canvas.getActiveObject();
            if (!activeObj) return;
            currentEditingElement = activeObj;

            // Z-Index 배치, 삭제 버튼 활성화
            ['btn-layer-up', 'btn-layer-down', 'btn-layer-front', 'btn-layer-back', 'btn-delete'].forEach(id => document.getElementById(id).disabled = false);

            // 공통 속성 활성화
            const opacitySlider = document.getElementById("element-opacity");
            opacitySlider.disabled = false;
            opacitySlider.value = activeObj.opacity !== undefined ? activeObj.opacity : 1;
            document.getElementById("opacity-val").innerText = `${Math.round(opacitySlider.value * 100)}%`;

            // X, Y, 너비, 높이, 중앙정렬 버튼 활성화 및 값 대입
            const leftInput = document.getElementById("element-left");
            const topInput = document.getElementById("element-top");
            const widthInput = document.getElementById("element-width");
            const heightInput = document.getElementById("element-height");
            const centerBtn = document.getElementById("btn-center-element");

            if (leftInput && topInput && widthInput && heightInput && centerBtn) {
                leftInput.disabled = false;
                topInput.disabled = false;
                widthInput.disabled = false;
                heightInput.disabled = false;
                centerBtn.disabled = false;

                // 정렬 관련 신규 버튼 활성화
                const alignBtnIds = ["btn-align-left", "btn-align-center-h", "btn-align-right", "btn-align-top", "btn-align-center-v", "btn-align-bottom"];
                alignBtnIds.forEach(id => {
                    const btn = document.getElementById(id);
                    if (btn) btn.disabled = false;
                });

                leftInput.value = Math.round(activeObj.left);
                topInput.value = Math.round(activeObj.top);
                widthInput.value = Math.round(activeObj.width * (activeObj.scaleX || 1));
                heightInput.value = Math.round(activeObj.height * (activeObj.scaleY || 1));
            }

            document.getElementById("btn-group").disabled = activeObj.type !== 'activeSelection';
            document.getElementById("btn-ungroup").disabled = activeObj.type !== 'group';
            document.getElementById("selection-status-bar").innerText = `선택된 개체: ${activeObj.type} (${activeObj.originalId || '신규'})`;

            // 인스펙터 화면 처리
            document.querySelector(".right-inspector-panel").style.display = "flex";

            document.getElementById("inspector-empty").style.display = "none";
            document.getElementById("inspector-common-section").style.display = "block";

            const textSection = document.getElementById("inspector-text-section");
            const shapeSection = document.getElementById("inspector-shape-section");

            if (activeObj.type === 'textbox' || activeObj.type === 'text') {
                textSection.style.display = "block";
                shapeSection.style.display = "none";

                ['text-editor', 'fontfamily-editor', 'fontsize-editor', 'fontcolor-editor', 'fontcolor-opacity', 'btn-bold', 'btn-italic', 'btn-align-left', 'btn-align-center', 'btn-align-right', 'custom-font-input', 'btn-add-custom-font', 'fontcolor-hex', 'text-strokecolor', 'text-strokecolor-opacity', 'text-strokecolor-hex', 'text-strokewidth', 'text-shadow-enabled'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.disabled = false;
                });
                document.getElementById("text-editor").value = activeObj.text || "";
                document.getElementById("fontsize-editor").value = parseFloat(activeObj.originalVwSize) || 3.0;

                // Fabric fill을 input[type=color] 포맷에 맞춰 안전하게 대입 및 투명도 복원
                const fontColor = colorToHex(activeObj.fill);
                const fontOpacity = colorToOpacity(activeObj.fill);
                document.getElementById("fontcolor-editor").value = fontColor;
                document.getElementById("fontcolor-hex").value = fontColor.toUpperCase();
                document.getElementById("fontcolor-opacity").value = fontOpacity;
                document.getElementById("fontcolor-opacity-val").textContent = fontOpacity + "%";

                // 텍스트 테두리 매핑 및 투명도 복원
                const strokeColor = activeObj.stroke ? colorToHex(activeObj.stroke) : 'transparent';
                const strokeOpacity = activeObj.stroke ? colorToOpacity(activeObj.stroke) : 100;
                document.getElementById("text-strokecolor").value = strokeColor === 'transparent' ? '#000000' : strokeColor;
                document.getElementById("text-strokecolor-hex").value = strokeColor.toUpperCase();
                document.getElementById("text-strokecolor-opacity").value = strokeOpacity;
                document.getElementById("text-strokecolor-opacity-val").textContent = strokeOpacity + "%";
                document.getElementById("text-strokewidth").value = activeObj.strokeWidth || 0;

                // 텍스트 그림자 매핑
                const shadow = activeObj.shadow;
                const shadowEnabledInput = document.getElementById("text-shadow-enabled");
                const shadowControls = document.getElementById("text-shadow-controls");

                if (shadow) {
                    shadowEnabledInput.checked = true;
                    shadowControls.style.opacity = "1";
                    shadowControls.style.pointerEvents = "auto";

                    ['text-shadow-color', 'text-shadow-color-hex', 'text-shadow-color-opacity', 'text-shadow-blur', 'text-shadow-offsetx', 'text-shadow-offsety'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.disabled = false;
                    });

                    const sColor = shadow.color ? colorToHex(shadow.color) : '#000000';
                    const sOpacity = shadow.color ? colorToOpacity(shadow.color) : 100;
                    document.getElementById("text-shadow-color").value = sColor;
                    document.getElementById("text-shadow-color-hex").value = sColor.toUpperCase();
                    document.getElementById("text-shadow-color-opacity").value = sOpacity;
                    document.getElementById("text-shadow-color-opacity-val").textContent = sOpacity + "%";
                    document.getElementById("text-shadow-blur").value = shadow.blur || 0;
                    document.getElementById("text-shadow-offsetx").value = shadow.offsetX || 0;
                    document.getElementById("text-shadow-offsety").value = shadow.offsetY || 0;
                } else {
                    shadowEnabledInput.checked = false;
                    shadowControls.style.opacity = "0.5";
                    shadowControls.style.pointerEvents = "none";

                    ['text-shadow-color', 'text-shadow-color-hex', 'text-shadow-blur', 'text-shadow-offsetx', 'text-shadow-offsety'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.disabled = true;
                    });

                    document.getElementById("text-shadow-color").value = "#000000";
                    document.getElementById("text-shadow-color-hex").value = "#000000";
                    document.getElementById("text-shadow-blur").value = 5;
                    document.getElementById("text-shadow-offsetx").value = 3;
                    document.getElementById("text-shadow-offsety").value = 3;
                }

                // 텍스트 정렬 상태 표시
                const align = activeObj.textAlign || 'left';
                document.getElementById("btn-align-left").classList.toggle("active", align === 'left');
                document.getElementById("btn-align-center").classList.toggle("active", align === 'center');
                document.getElementById("btn-align-right").classList.toggle("active", align === 'right');

                // 볼드/이탤릭 상태 표시
                document.getElementById("btn-bold").classList.toggle("active", activeObj.fontWeight === 'bold');
                document.getElementById("btn-italic").classList.toggle("active", activeObj.fontStyle === 'italic');

            } else if (['rect', 'circle', 'triangle', 'line'].includes(activeObj.type)) {
                textSection.style.display = "none";
                shapeSection.style.display = "block";

                ['shape-fillcolor', 'shape-fillcolor-opacity', 'shape-fillcolor-hex', 'shape-strokecolor', 'shape-strokecolor-opacity', 'shape-strokecolor-hex', 'shape-strokewidth'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.disabled = false;
                });

                // Fabric fill을 input[type=color] 포맷에 맞춰 안전하게 대입 및 투명도 복원
                const fillColor = colorToHex(activeObj.fill);
                const fillOpacity = colorToOpacity(activeObj.fill);
                document.getElementById("shape-fillcolor").value = fillColor;
                document.getElementById("shape-fillcolor-hex").value = fillColor.toUpperCase();
                document.getElementById("shape-fillcolor-opacity").value = fillOpacity;
                document.getElementById("shape-fillcolor-opacity-val").textContent = fillOpacity + "%";

                // Fabric stroke를 input[type=color] 포맷에 맞춰 안전하게 대입 및 투명도 복원
                const strokeColor = colorToHex(activeObj.stroke);
                const strokeOpacity = colorToOpacity(activeObj.stroke);
                document.getElementById("shape-strokecolor").value = strokeColor;
                document.getElementById("shape-strokecolor-hex").value = strokeColor.toUpperCase();
                document.getElementById("shape-strokecolor-opacity").value = strokeOpacity;
                document.getElementById("shape-strokecolor-opacity-val").textContent = strokeOpacity + "%";

                document.getElementById("shape-strokewidth").value = activeObj.strokeWidth || 0;

                const cornerInput = document.getElementById("shape-corners");
                cornerInput.disabled = activeObj.type !== 'rect';
                if (activeObj.type === 'rect') {
                    document.getElementById("corner-rounding-group").style.opacity = "1";
                    cornerInput.value = activeObj.rx || 0;
                } else {
                    document.getElementById("corner-rounding-group").style.opacity = "0.4";
                    cornerInput.value = 0;
                }
            } else {
                // 그룹 등 기타 개체
                textSection.style.display = "none";
                shapeSection.style.display = "none";
            }
        }

        function onObjectCleared() {
            currentEditingElement = null;
            document.getElementById("selection-status-bar").innerText = "선택된 개체가 없습니다.";

            // 인스펙터 화면 처리
            const inspector = document.querySelector(".right-inspector-panel");
            if (inspector) {
                inspector.style.display = "none";
            }

            document.getElementById("inspector-empty").style.display = "flex";
            document.getElementById("inspector-text-section").style.display = "none";
            document.getElementById("inspector-shape-section").style.display = "none";
            document.getElementById("inspector-common-section").style.display = "none";

            document.getElementById("element-opacity").disabled = true;
            ['btn-layer-up', 'btn-layer-down', 'btn-layer-front', 'btn-layer-back', 'btn-delete', 'btn-group', 'btn-ungroup', 'custom-font-input', 'btn-add-custom-font', 'fontcolor-hex', 'fontcolor-opacity', 'shape-fillcolor-opacity', 'shape-strokecolor-opacity', 'shape-fillcolor-hex', 'shape-strokecolor-hex', 'text-strokecolor', 'text-strokecolor-opacity', 'text-strokecolor-hex', 'text-strokewidth', 'text-shadow-enabled', 'text-shadow-color', 'text-shadow-color-opacity', 'text-shadow-color-hex', 'text-shadow-blur', 'text-shadow-offsetx', 'text-shadow-offsety'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.disabled = true;
            });
            const shadowControls = document.getElementById("text-shadow-controls");
            if (shadowControls) {
                shadowControls.style.opacity = "0.5";
                shadowControls.style.pointerEvents = "none";
            }

            // X, Y, 너비, 높이, 중앙정렬 버튼 비활성화 및 초기화
            const leftInput = document.getElementById("element-left");
            const topInput = document.getElementById("element-top");
            const widthInput = document.getElementById("element-width");
            const heightInput = document.getElementById("element-height");
            const centerBtn = document.getElementById("btn-center-element");

            if (leftInput && topInput && widthInput && heightInput && centerBtn) {
                leftInput.disabled = true;
                topInput.disabled = true;
                widthInput.disabled = true;
                heightInput.disabled = true;
                centerBtn.disabled = true;

                // 정렬 관련 신규 버튼 비활성화
                const alignBtnIds = ["btn-align-left", "btn-align-center-h", "btn-align-right", "btn-align-top", "btn-align-center-v", "btn-align-bottom"];
                alignBtnIds.forEach(id => {
                    const btn = document.getElementById(id);
                    if (btn) btn.disabled = true;
                });

                leftInput.value = "";
                topInput.value = "";
                widthInput.value = "";
                heightInput.value = "";
            }
        }

        function onObjectModified(e) {
            const activeObj = e.target;
            if (activeObj && (activeObj.type === 'textbox' || activeObj.type === 'text')) {
                // 줌이 반영되지 않은 768 기본 너비 기준으로 vw를 환산해 저장
                activeObj.originalVwSize = `${((activeObj.fontSize * (activeObj.scaleX || 1) / BASE_WIDTH) * 100).toFixed(2)}vw`;
            }
        }

        function cancelEditing() { if (activeSlideId) loadSlideToCanvas(activeSlideId); }

        // 제목, 부제목, 본문 텍스트 템플릿 삽입
        function addTextTpl(type) {
            if (!activeSlideId) return;
            let text = "텍스트를 입력해 주세요.";
            let fontSizeVw = 3.0;
            let fontWeight = "normal";
            if (type === 'title') {
                text = "제목을 입력해 주세요.";
                fontSizeVw = 5.0;
                fontWeight = "bold";
            } else if (type === 'subtitle') {
                text = "부제목을 입력해 주세요.";
                fontSizeVw = 3.5;
                fontWeight = "bold";
            } else if (type === 'body') {
                text = "본문 내용을 입력해 주세요.";
                fontSizeVw = 2.0;
                fontWeight = "normal";
            }
            // 줌이 적용되지 않은 기본 해상도(BASE_WIDTH) 기준으로 font size px 산출
            const pxSize = (fontSizeVw / 100) * BASE_WIDTH;
            const obj = new fabric.Textbox(text, {
                left: 100,
                top: 100,
                width: 350,
                fontSize: pxSize,
                fill: '#ffffff',
                fontFamily: 'Inter',
                fontWeight: fontWeight,
                originalId: `elem_${Math.random().toString(36).substr(2, 9)}`,
                originalVwSize: `${fontSizeVw}vw`
            });
            canvas.add(obj);
            canvas.setActiveObject(obj);
            canvas.renderAll();
        }

        function addRect() {
            if (!activeSlideId) return;
            const obj = new fabric.Rect({ left: 150, top: 150, width: 150, height: 100, fill: '#6366f1', originalId: `elem_${Math.random().toString(36).substr(2, 9)}` });
            canvas.add(obj); canvas.setActiveObject(obj); canvas.renderAll();
        }

        // 원형 도형 기본 Fill 색상을 인디고 테마에 어울리는 청록색(Cyan)으로 지정
        function addCircle() {
            if (!activeSlideId) return;
            const obj = new fabric.Circle({ left: 150, top: 150, radius: 60, fill: '#06b6d4', originalId: `elem_${Math.random().toString(36).substr(2, 9)}` });
            canvas.add(obj); canvas.setActiveObject(obj); canvas.renderAll();
        }

        function addTriangle() {
            if (!activeSlideId) return;
            const obj = new fabric.Triangle({ left: 150, top: 150, width: 120, height: 100, fill: '#10b981', originalId: `elem_${Math.random().toString(36).substr(2, 9)}` });
            canvas.add(obj); canvas.setActiveObject(obj); canvas.renderAll();
        }

        function addLine() {
            if (!activeSlideId) return;
            const obj = new fabric.Line([50, 50, 200, 50], { left: 150, top: 150, stroke: '#f59e0b', strokeWidth: 4, originalId: `elem_${Math.random().toString(36).substr(2, 9)}` });
            canvas.add(obj); canvas.setActiveObject(obj); canvas.renderAll();
        }

        function layerUp() { if (currentEditingElement) { canvas.bringForward(currentEditingElement); canvas.renderAll(); saveStateToHistory(); } }
        function layerDown() { if (currentEditingElement) { canvas.sendBackwards(currentEditingElement); canvas.renderAll(); saveStateToHistory(); } }
        function layerFront() { if (currentEditingElement) { canvas.bringToFront(currentEditingElement); canvas.renderAll(); saveStateToHistory(); } }
        function layerBack() { if (currentEditingElement) { canvas.sendToBack(currentEditingElement); canvas.renderAll(); saveStateToHistory(); } }

        function groupObjects() {
            const activeObj = canvas.getActiveObject();
            if (activeObj && activeObj.type === 'activeSelection') {
                const group = activeObj.toGroup();
                group.originalId = `elem_${Math.random().toString(36).substr(2, 9)}`;
                canvas.requestRenderAll();
                onObjectSelected({ target: group });
                saveStateToHistory();
            }
        }

        function ungroupObjects() {
            const activeObj = canvas.getActiveObject();
            if (activeObj && activeObj.type === 'group') {
                activeObj.toActiveSelection();
                canvas.requestRenderAll();
                onObjectSelected({ target: canvas.getActiveObject() });
                saveStateToHistory();
            }
        }

        function deleteElement() {
            const activeObj = canvas.getActiveObject();
            if (!activeObj) return;

            isUndoingRedoing = true;
            if (activeObj.type === 'activeSelection') {
                const objectsToDelete = activeObj.getObjects().concat();
                objectsToDelete.forEach(obj => {
                    canvas.remove(obj);
                });
            } else {
                canvas.remove(activeObj);
            }
            canvas.discardActiveObject();
            onObjectCleared();
            canvas.renderAll();
            isUndoingRedoing = false;
            saveStateToHistory();
            updateLayerList();
        }

        function saveSlideData() {
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

        function saveAsTemplate() {
            if (!activeSlideId || !canvas) return;
            const tplName = prompt("저장할 템플릿의 이름을 입력하세요:", "새 디자인 템플릿");
            if (!tplName) return;

            const activeObj = canvas.getActiveObject();
            if (activeObj) {
                canvas.discardActiveObject();
                canvas.requestRenderAll();
            }

            // 템플릿용 썸네일도 1.0배율로 안정적으로 추출
            const prevZoom = canvasZoom;
            setCanvasZoom(1.0);
            if (!canvas.backgroundColor) canvas.backgroundColor = '#000000';
            const thumbnailData = canvas.toDataURL({
                format: 'jpeg',
                quality: 0.4
            });
            setCanvasZoom(prevZoom);

            if (activeObj) {
                canvas.setActiveObject(activeObj);
                canvas.requestRenderAll();
            }

            // 줌을 무시한 고정된 좌표계로 템플릿 직렬화
            const elements = canvas.getObjects().map(obj => serializeElement(obj, BASE_WIDTH, BASE_HEIGHT));
            const templateData = {
                id: `tpl_${Math.random().toString(36).substr(2, 9)}`,
                name: tplName,
                thumbnail: thumbnailData,
                elements: elements
            };

            ws.send(JSON.stringify({
                type: "SAVE_TEMPLATE",
                template: templateData
            }));
        }

        function deleteTemplate() {
            if (selectedTemplateIds.length === 0) {
                alert("삭제할 템플릿을 먼저 선택해주세요.");
                return;
            }
            const confirmMsg = selectedTemplateIds.length === 1
                ? "정말로 이 템플릿을 삭제하시겠습니까?"
                : `정말로 선택한 ${selectedTemplateIds.length}개의 템플릿을 삭제하시겠습니까?`;

            if (confirm(confirmMsg)) {
                ws.send(JSON.stringify({
                    type: "DELETE_TEMPLATE",
                    templateIds: selectedTemplateIds
                }));
                selectedTemplateIds = [];
                lastSelectedTemplateId = null;
            }
        }

        let modalSelectedSlideIds = [];
        let modalLastCheckedIndex = -1;

        function renderModalSlides() {
            const gridEl = document.getElementById("modal-slide-grid");
            if (!gridEl) return;
            gridEl.innerHTML = "";
            if (!projectData || !projectData.slides) return;

            projectData.slides.forEach((slide, index) => {
                const item = document.createElement("div");
                item.className = "modal-slide-item";
                if (modalSelectedSlideIds.includes(slide.id)) {
                    item.classList.add("selected");
                }

                item.innerHTML = `
                    <div class="modal-slide-item-badge">${index + 1}</div>
                    <div class="modal-slide-thumbnail-wrapper">
                        ${slide.thumbnail ? `<img src="${slide.thumbnail}">` : `<span style="font-size: 0.65rem; color: var(--text-muted);">미리보기 없음</span>`}
                    </div>
                `;

                item.onclick = (e) => {
                    if (e.shiftKey && modalLastCheckedIndex !== -1) {
                        const start = Math.min(index, modalLastCheckedIndex);
                        const end = Math.max(index, modalLastCheckedIndex);

                        // Shift 누르고 누르면 해당 범위 슬라이드들 모두 추가 선택
                        for (let i = start; i <= end; i++) {
                            const sId = projectData.slides[i].id;
                            if (!modalSelectedSlideIds.includes(sId)) {
                                modalSelectedSlideIds.push(sId);
                            }
                        }
                    } else if (e.ctrlKey || e.metaKey) {
                        // Ctrl/Cmd 누르고 클릭하면 토글
                        const sId = slide.id;
                        if (modalSelectedSlideIds.includes(sId)) {
                            modalSelectedSlideIds = modalSelectedSlideIds.filter(id => id !== sId);
                        } else {
                            modalSelectedSlideIds.push(sId);
                        }
                    } else {
                        // 일반 클릭 시 단일 선택
                        modalSelectedSlideIds = [slide.id];
                    }
                    modalLastCheckedIndex = index;
                    renderModalSlides();
                };

                gridEl.appendChild(item);
            });
        }

        function applyTemplateBulk() {
            if (selectedTemplateIds.length !== 1) {
                alert("일괄 적용할 템플릿을 하나만 선택해주세요.");
                return;
            }

            // 모달 열기 전 기본 선택값 세팅 (선택된 슬라이드가 있으면 그것을, 없으면 현재 편집 중인 슬라이드)
            modalSelectedSlideIds = [...selectedSlideIds];
            if (modalSelectedSlideIds.length === 0 && activeSlideId) {
                modalSelectedSlideIds = [activeSlideId];
            }
            modalLastCheckedIndex = -1;

            // 격자 렌더링
            renderModalSlides();

            // 텍스트 상자 매핑 드롭다운 세팅
            const targetTpl = projectData && projectData.templates ? projectData.templates.find(t => t.id === selectedTemplateIds[0]) : null;
            const textElements = targetTpl ? targetTpl.elements.filter(el => el.type === "text") : [];
            const textboxContainer = document.getElementById("modal-template-textbox-container");
            const textboxSelect = document.getElementById("select-modal-target-textbox");

            if (textboxContainer && textboxSelect) {
                if (textElements.length >= 2) {
                    textboxContainer.style.display = "flex";
                    textboxSelect.innerHTML = "";
                    textElements.forEach((el, index) => {
                        const previewText = el.content ? el.content.substring(0, 15) : `텍스트 영역 ${index + 1}`;
                        const locName = getGeometricLocationName(el.x, el.y);
                        const opt = document.createElement("option");
                        opt.value = el.id;
                        opt.textContent = `[텍스트 영역 ${index + 1}] [${locName}] ${previewText} (${el.id})`;
                        textboxSelect.appendChild(opt);
                    });
                } else {
                    textboxContainer.style.display = "none";
                    textboxSelect.innerHTML = "";
                }
            }

            // 모달 오픈
            document.getElementById("template-apply-modal").style.display = "flex";
        }

        function confirmApplyTemplate() {
            if (selectedTemplateIds.length !== 1) {
                alert("적용할 템플릿을 하나만 선택해주세요.");
                return;
            }

            if (modalSelectedSlideIds.length === 0) {
                alert("템플릿을 적용할 슬라이드를 최소 하나 이상 선택해주세요.");
                return;
            }

            const selectBox = document.getElementById("select-modal-target-textbox");
            const targetElementId = selectBox ? selectBox.value : "";

            // 웹소켓 전송
            ws.send(JSON.stringify({
                type: "APPLY_TEMPLATE_BULK",
                slideIds: modalSelectedSlideIds,
                templateId: selectedTemplateIds[0],
                targetElementId: targetElementId
            }));

            closeApplyModal();
        }

        function closeApplyModal() {
            document.getElementById("template-apply-modal").style.display = "none";
            modalSelectedSlideIds = [];
            modalLastCheckedIndex = -1;
        }

        function undoBulkAction() {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "UNDO_BULK_ACTION" }));
            }
        }

        let selectedTemplateIds = [];
        let lastSelectedTemplateId = null;

        function selectTemplate(tplId, event) {
            const templates = (projectData && projectData.templates) || [];
            const currentIndex = templates.findIndex(t => t.id === tplId);
            const lastIndex = templates.findIndex(t => t.id === lastSelectedTemplateId);

            if (event && event.shiftKey && lastSelectedTemplateId !== null && lastIndex !== -1 && currentIndex !== -1) {
                const start = Math.min(currentIndex, lastIndex);
                const end = Math.max(currentIndex, lastIndex);

                for (let i = start; i <= end; i++) {
                    const id = templates[i].id;
                    if (!selectedTemplateIds.includes(id)) {
                        selectedTemplateIds.push(id);
                    }
                }
            } else if (event && (event.ctrlKey || event.metaKey)) {
                const idx = selectedTemplateIds.indexOf(tplId);
                if (idx > -1) {
                    selectedTemplateIds.splice(idx, 1);
                } else {
                    selectedTemplateIds.push(tplId);
                }
                lastSelectedTemplateId = tplId;
            } else {
                if (selectedTemplateIds.length === 1 && selectedTemplateIds[0] === tplId) {
                    selectedTemplateIds = [];
                    lastSelectedTemplateId = null;
                } else {
                    selectedTemplateIds = [tplId];
                    lastSelectedTemplateId = tplId;
                }
            }

            const items = document.querySelectorAll(".template-grid-item");
            items.forEach(item => {
                const itemId = item.getAttribute("data-id");
                if (selectedTemplateIds.includes(itemId)) {
                    item.style.border = "1.5px solid var(--primary)";
                    item.style.backgroundColor = "rgba(99, 102, 241, 0.15)";
                    item.style.boxShadow = "0 0 0 2px var(--primary-glow)";
                } else {
                    item.style.border = "1px solid var(--panel-border)";
                    item.style.backgroundColor = "rgba(0, 0, 0, 0.2)";
                    item.style.boxShadow = "none";
                }
            });

            updateTemplateActionButtons();
        }

        function updateTemplateActionButtons() {
            const applyBtn = document.getElementById("btn-apply-template-bulk");
            const deleteBtn = document.getElementById("btn-delete-template");

            if (applyBtn) {
                applyBtn.disabled = (selectedTemplateIds.length !== 1);
            }
            if (deleteBtn) {
                deleteBtn.disabled = (selectedTemplateIds.length === 0);
            }
        }

        function renderTemplates() {
            const gridEl = document.getElementById("templates-grid-list");
            if (!gridEl) return;

            gridEl.innerHTML = "";

            if (selectedTemplateIds.length > 0) {
                selectedTemplateIds = selectedTemplateIds.filter(id =>
                    projectData && projectData.templates && projectData.templates.some(t => t.id === id)
                );
                if (selectedTemplateIds.length === 0) {
                    lastSelectedTemplateId = null;
                }
            }

            if (!projectData || !projectData.templates || projectData.templates.length === 0) {
                gridEl.innerHTML = '<div style="grid-column: span 1; text-align: center; padding: 16px; font-size: 0.7rem; color: var(--text-muted);">저장된 템플릿이 없습니다.</div>';
                updateTemplateActionButtons();
                return;
            }

            projectData.templates.forEach(tpl => {
                const item = document.createElement("div");
                item.className = "template-grid-item";
                item.setAttribute("data-id", tpl.id);

                const isSelected = selectedTemplateIds.includes(tpl.id);
                item.style.border = isSelected ? "1.5px solid var(--primary)" : "1px solid var(--panel-border)";
                item.style.backgroundColor = isSelected ? "rgba(99, 102, 241, 0.15)" : "rgba(0, 0, 0, 0.2)";
                item.style.boxShadow = isSelected ? "0 0 0 2px var(--primary-glow)" : "none";
                item.style.borderRadius = "var(--radius-sm)";
                item.style.overflow = "hidden";
                item.style.cursor = "pointer";
                item.style.transition = "all 0.2s";
                item.style.position = "relative";
                item.style.marginBottom = "6px";

                item.innerHTML = `
                    <div style="width: 100%; aspect-ratio: 16/9; background: #000; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; overflow: hidden;">
                        ${tpl.thumbnail ? `<img src="${tpl.thumbnail}" style="width: 100%; height: 100%; object-fit: contain;">` : `<span style="font-size: 0.6rem; color: var(--text-muted);">미리보기 없음</span>`}
                    </div>
                    <div style="padding: 4px 6px; font-size: 0.72rem; color: #e2e8f0; text-align: left; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; font-weight: 500;" title="${tpl.name}">
                        ${tpl.name}
                    </div>
                `;

                item.onclick = (e) => selectTemplate(tpl.id, e);
                gridEl.appendChild(item);
            });

            updateTemplateActionButtons();
        }

        // 컬러 문자열(HEX, rgba, rgb)로부터 투명도(Alpha) 비율 0~100 획득
        function colorToOpacity(colorVal) {
            if (!colorVal) return 100;
            if (colorVal === 'transparent') return 0;

            const str = colorVal.toString().trim();
            if (str.startsWith('rgba')) {
                const parts = str.split(',');
                if (parts.length === 4) {
                    const alpha = parseFloat(parts[3].replace(')', ''));
                    return isNaN(alpha) ? 100 : Math.round(alpha * 100);
                }
            } else if (str.startsWith('#') && str.length === 9) {
                const alphaHex = str.substring(7, 9);
                const alphaVal = parseInt(alphaHex, 16) / 255;
                return isNaN(alphaVal) ? 100 : Math.round(alphaVal * 100);
            }
            return 100;
        }

        // HEX 색상코드와 opacity 비율(0~100)을 받아서 rgba() 문자열 조립
        function hexAndOpacityToRgba(hex, opacityPercent) {
            if (!hex) return 'transparent';
            if (hex.toUpperCase() === 'TRANSPARENT') return 'transparent';

            let cleanHex = hex.trim().replace('#', '');
            if (cleanHex.length === 3) {
                cleanHex = cleanHex.split('').map(c => c + c).join('');
            }
            if (cleanHex.length !== 6) return hex;

            const r = parseInt(cleanHex.substring(0, 2), 16);
            const g = parseInt(cleanHex.substring(2, 4), 16);
            const b = parseInt(cleanHex.substring(4, 6), 16);
            const a = (opacityPercent / 100).toFixed(2);

            return `rgba(${r}, ${g}, ${b}, ${a})`;
        }

        function connectWebSocket() {
            ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws?role=editor`);
            ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                if (message.type === 'INITIAL_SYNC') {
                    projectData = message.data;
                    if (message.lockedSlides) {
                        lockedSlides = {};
                        for (const [slideId, val] of Object.entries(message.lockedSlides)) {
                            if (typeof val === 'string') {
                                lockedSlides[slideId] = {
                                    ownerId: val,
                                    editorName: val === myEditorId ? (document.getElementById("editor-name")?.value || "편집자") : "다른 편집자"
                                };
                            } else if (val && typeof val === 'object') {
                                lockedSlides[slideId] = val;
                            }
                        }
                    }

                    // 활성화된 슬라이드가 서버 데이터에 존재하는지 검증하고 방어적으로 처리
                    if (projectData.slides && projectData.slides.length > 0) {
                        const slideExists = projectData.slides.some(s => s.id === activeSlideId);
                        if (!activeSlideId || !slideExists || myEditorId === null) {
                            activeSlideId = slideExists ? activeSlideId : projectData.slides[0].id;
                            selectedSlideIds = [activeSlideId];
                            selectSlideForEdit(activeSlideId, true);
                        } else {
                            // 최신 동기화 데이터 기반으로 현재 편집중인 슬라이드 캔버스를 다시 로드
                            loadSlideToCanvas(activeSlideId);
                        }
                    }

                    // 커스텀 폰트 동적 로드 및 셀렉트 박스 갱신
                    if (projectData.customFonts && projectData.customFonts.length > 0) {
                        const selectEl = document.getElementById("fontfamily-editor");
                        projectData.customFonts.forEach(font => {
                            const styleId = `custom-style-${font.family.replace(/\s+/g, '-')}`;
                            if (!document.getElementById(styleId)) {
                                const styleEl = document.createElement("style");
                                styleEl.id = styleId;
                                styleEl.textContent = font.cssCode;
                                document.head.appendChild(styleEl);
                            }

                            if (selectEl) {
                                let exists = false;
                                for (let i = 0; i < selectEl.options.length; i++) {
                                    if (selectEl.options[i].value.toLowerCase() === font.family.toLowerCase()) {
                                        exists = true;
                                        break;
                                    }
                                }
                                if (!exists) {
                                    const optionEl = document.createElement("option");
                                    optionEl.value = font.family;
                                    optionEl.text = font.family;
                                    selectEl.add(optionEl);
                                }
                            }
                        });
                        canvas.requestRenderAll();
                    }

                    renderSlides();
                    renderTemplates();

                    // 되돌리기 버튼 상태 업데이트
                    const undoBtn = document.getElementById("btn-undo-template");
                    if (undoBtn) {
                        undoBtn.disabled = !(message.historyCount && message.historyCount > 0);
                    }

                    // 썸네일이 없는 슬라이드가 있다면 순차적으로 자동 생성하여 반영 및 서버 동기화
                    let needsUpdate = false;
                    const promises = projectData.slides.map(slide => {
                        if (!slide.thumbnail) {
                            needsUpdate = true;
                            return autoGenerateThumbnail(slide);
                        }
                        return Promise.resolve();
                    });

                    if (needsUpdate) {
                        Promise.all(promises).then(() => {
                            renderSlides();
                        });
                    }
                }
                else if (message.type === 'SLIDE_LOCKED') {
                    lockedSlides[message.slideId] = { ownerId: message.ownerId, editorName: message.editorName };

                    // 내가 명시적으로 락을 요청했고, 그 요청한 슬라이드에 대한 승인이 온 경우 내 식별자로 설정
                    if (message.slideId === activeSlideId && isLockRequested) {
                        myEditorId = message.ownerId;
                        isLockRequested = false;
                    }

                    if (message.slideId === activeSlideId) {
                        // 타인이 락을 걸고 있을 때만 상단 배너 표시 및 편집 도구 잠금
                        const isLockedByOthers = message.ownerId !== myEditorId;
                        const banner = document.getElementById("lock-banner");
                        if (banner) {
                            banner.style.display = isLockedByOthers ? "flex" : "none";
                            banner.innerText = `⚠️ ${message.editorName}님이 편집 중인 슬라이드입니다.`;
                        }
                        if (isLockedByOthers) {
                            setControlsState(false);
                        }
                    }
                    renderSlides();
                }
                else if (message.type === 'LOCK_FAILED') {
                    isLockRequested = false;
                    if (message.slideId === activeSlideId) {
                        const banner = document.getElementById("lock-banner");
                        if (banner) {
                            banner.style.display = "flex";
                            banner.innerText = `⚠️ ${message.reason}`;
                        }
                        setControlsState(false);
                    }
                }
                else if (message.type === 'SLIDE_UNLOCKED') {
                    delete lockedSlides[message.slideId];
                    if (message.slideId === activeSlideId) {
                        document.getElementById("lock-banner").style.display = "none";
                        setControlsState(true);
                    }
                    renderSlides();
                }
                else if (message.type === 'SLIDE_UPDATED') {
                    const idx = projectData.slides.findIndex(s => s.id === message.slideId);
                    if (idx !== -1) projectData.slides[idx] = message.slide;
                    if (message.slideId === activeSlideId && checkIsLockedByOthers(activeSlideId)) {
                        loadSlideToCanvas(activeSlideId);
                    }
                    renderSlides();
                }
                else if (message.type === 'PROJECT_SYNC') {
                    projectData = message.data;
                    renderSlides();
                    renderTemplates();
                    if (activeSlideId) {
                        loadSlideToCanvas(activeSlideId);
                    }
                }
            };
            ws.onopen = () => {
                const badge = document.getElementById("status-badge");
                const text = document.getElementById("status-text");
                if (badge && text) {
                    badge.classList.add("connected");
                    text.innerText = "Connected";
                }
                handleOnline();
                if (activeSlideId) {
                    const editorName = document.getElementById("editor-name").value;
                    isLockRequested = true;
                    ws.send(JSON.stringify({ type: "LOCK_SLIDE", slideId: activeSlideId, editorName: editorName }));
                }
            };
            ws.onclose = () => {
                const badge = document.getElementById("status-badge");
                const text = document.getElementById("status-text");
                if (badge && text) {
                    badge.classList.remove("connected");
                    text.innerText = "Disconnected";
                }
                handleOffline();
                setTimeout(connectWebSocket, 3000);
            };
        }

        function handleOffline() {
            if (autoSaveTimeoutId) {
                clearTimeout(autoSaveTimeoutId);
            }
            updateAutoSaveStatus("error", "연결 끊김");
            const banner = document.getElementById("offline-banner");
            if (banner) banner.style.display = "flex";
            setControlsState(false);
            if (canvas) {
                canvas.forEachObject(obj => {
                    obj.selectable = false;
                    obj.evented = false;
                });
                canvas.discardActiveObject().requestRenderAll();
            }
        }

        function handleOnline() {
            const banner = document.getElementById("offline-banner");
            if (banner) banner.style.display = "none";
        }

        window.onload = () => {
            window.addEventListener('offline', handleOffline);
            window.addEventListener('online', handleOnline);
            initCanvas();
            connectWebSocket();

            // 좌측 서브 패널 토글 (화살표 버튼)
            const toggleSidebarBtn = document.getElementById("btn-toggle-sidebar");
            if (toggleSidebarBtn) {
                toggleSidebarBtn.onclick = () => {
                    const subPanel = document.querySelector(".left-sub-panel");
                    const arrowIcon = document.getElementById("toggle-arrow-icon");
                    if (subPanel) {
                        const isCollapsed = subPanel.classList.toggle("collapsed");
                        if (arrowIcon) {
                            arrowIcon.style.transform = isCollapsed ? "rotate(180deg)" : "rotate(0deg)";
                        }
                        fitCanvasToScreen(); // 서브 패널 토글에 따른 가용 너비 변경을 반영해 캔버스 줌 맞춤
                    }
                };
            }

            // 최초 로드 시 및 브라우저 창 크기 변경 시 화면 크기 자동 맞춤 연동
            window.addEventListener('resize', fitCanvasToScreen);
            setTimeout(fitCanvasToScreen, 100); // 캔버스 영역 렌더링이 완료된 후 최초 맞춤 실행

            // 서브 패널 너비 드래그 조절 (Resizer)
            const resizer = document.getElementById("left-panel-resizer");
            const panel = document.querySelector(".left-sub-panel");
            if (resizer && panel) {
                resizer.addEventListener("mousedown", (e) => {
                    e.preventDefault();
                    resizer.classList.add("resizing");
                    const startX = e.clientX;
                    const startWidth = panel.getBoundingClientRect().width;

                    function onMouseMove(e) {
                        const newWidth = startWidth + (e.clientX - startX);
                        // 최소 너비 150px, 최대 너비 600px 제한
                        if (newWidth >= 150 && newWidth <= 600) {
                            panel.style.width = `${newWidth}px`;
                            fitCanvasToScreen(); // 좌측 드로어 패널 너비 변경에 맞춰 슬라이드 실시간 자동 스케일링
                        }
                    }

                    function onMouseUp() {
                        resizer.classList.remove("resizing");
                        document.removeEventListener("mousemove", onMouseMove);
                        document.removeEventListener("mouseup", onMouseUp);
                    }

                    document.addEventListener("mousemove", onMouseMove);
                    document.addEventListener("mouseup", onMouseUp);
                });
            }

            // 슬라이드 추가 버튼
            document.getElementById("btn-add-slide").onclick = addSlide;

            // 성경 구절 연동 기능 초기화
            initBibleFeature();

            // 찬양 가사 연동 기능 초기화
            initPraiseFeature();

            // 템플릿 제어 버튼
            document.getElementById("btn-save-template").onclick = saveAsTemplate;
            document.getElementById("btn-apply-template-bulk").onclick = applyTemplateBulk;
            document.getElementById("btn-delete-template").onclick = deleteTemplate;
            document.getElementById("btn-undo-template").onclick = undoBulkAction;

            const btnTemplateExport = document.getElementById("btn-template-export");
            if (btnTemplateExport) {
                btnTemplateExport.onclick = () => {
                    if (selectedTemplateIds && selectedTemplateIds.length > 0) {
                        window.location.href = `/api/templates/export?ids=${selectedTemplateIds.join(",")}`;
                    } else {
                        window.location.href = "/api/templates/export";
                    }
                };
            }

            const btnTemplateImport = document.getElementById("btn-template-import");
            const fileImportTemplate = document.getElementById("file-import-template");
            if (btnTemplateImport && fileImportTemplate) {
                btnTemplateImport.onclick = () => {
                    fileImportTemplate.value = "";
                    fileImportTemplate.click();
                };
                fileImportTemplate.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;

                    const formData = new FormData();
                    formData.append("file", file);

                    try {
                        const res = await fetch("/api/templates/import", {
                            method: "POST",
                            body: formData
                        });
                        if (!res.ok) {
                            const errData = await res.json();
                            throw new Error(errData.detail || "템플릿 가져오기 실패");
                        }
                        const data = await res.json();
                        alert(`성공적으로 ${data.imported_count || 0}개의 템플릿 데이터를 가져왔습니다.`);
                    } catch (err) {
                        alert("템플릿 데이터 가져오기 오류: " + err.message);
                    }
                };
            }

            // 템플릿 적용 모달 내 버튼 제어
            document.getElementById("btn-modal-cancel").onclick = closeApplyModal;
            document.getElementById("btn-modal-close").onclick = closeApplyModal;
            document.getElementById("btn-modal-confirm").onclick = confirmApplyTemplate;

            // 줌 컨트롤러 버튼 리스너 연동
            document.getElementById("btn-zoom-in").onclick = () => {
                userZoomFactor = Math.min(userZoomFactor + 0.1, 3.0); // 최대 300%
                fitCanvasToScreen();
            };
            document.getElementById("btn-zoom-out").onclick = () => {
                userZoomFactor = Math.max(userZoomFactor - 0.1, 0.3); // 최소 30%
                fitCanvasToScreen();
            };
            document.getElementById("btn-zoom-reset").onclick = () => {
                userZoomFactor = 1.0; // 100% 맞춤으로 초기화
                fitCanvasToScreen();
            };

            // 공통: 불투명도 조절 슬라이더
            document.getElementById("element-opacity").oninput = (e) => {
                if (currentEditingElement) {
                    const val = parseFloat(e.target.value);
                    currentEditingElement.set('opacity', val);
                    document.getElementById("opacity-val").innerText = `${Math.round(val * 100)}%`;
                    canvas.renderAll();
                }
            };
            document.getElementById("element-opacity").onchange = () => {
                saveStateToHistory();
            };

            // 텍스트 서식 리스너들
            document.getElementById("text-editor").oninput = (e) => {
                if (currentEditingElement && (currentEditingElement.type === 'textbox' || currentEditingElement.type === 'text')) {
                    currentEditingElement.set('text', e.target.value);
                    canvas.renderAll();
                }
            };
            document.getElementById("text-editor").onchange = () => {
                saveStateToHistory();
            };

            document.getElementById("fontfamily-editor").onchange = (e) => {
                if (currentEditingElement && (currentEditingElement.type === 'textbox' || currentEditingElement.type === 'text')) {
                    currentEditingElement.set('fontFamily', e.target.value);
                    canvas.renderAll();
                    saveStateToHistory();
                }
            };

            document.getElementById("fontsize-editor").oninput = (e) => {
                if (currentEditingElement && (currentEditingElement.type === 'textbox' || currentEditingElement.type === 'text')) {
                    const vw = parseFloat(e.target.value) || 3.0;
                    const pxSize = (vw / 100) * BASE_WIDTH;

                    currentEditingElement.set('fontSize', pxSize);
                    currentEditingElement.originalVwSize = `${vw}vw`;
                    canvas.renderAll();
                }
            };
            document.getElementById("fontsize-editor").onchange = () => {
                saveStateToHistory();
            };

            function addCustomFont() {
                const textareaEl = document.getElementById("custom-font-input");
                if (!textareaEl) return;
                const cssCode = textareaEl.value.trim();
                if (!cssCode) {
                    alert("@font-face 정의 코드를 입력해 주세요.");
                    return;
                }

                // 1. font-family 명칭 추출 정규식
                const fontFamilyRegex = /font-family\s*:\s*['"]?([^'";\s]+)['"]?/i;
                const match = cssCode.match(fontFamilyRegex);

                if (!match || !match[1]) {
                    alert("입력한 CSS 코드에서 font-family 설정을 찾을 수 없습니다. 올바른 @font-face 코드를 입력해 주세요.");
                    return;
                }

                const fontName = match[1].trim();

                // 2. url 추출 정규식
                const urlRegex = /url\s*\(\s*[\'"]?([^\'")]+)[\'"]?\s*\)/i;
                const urlMatch = cssCode.match(urlRegex);
                if (!urlMatch || !urlMatch[1]) {
                    alert("CSS 코드에서 폰트 파일 주소(url)를 찾을 수 없습니다.");
                    return;
                }
                const fontUrl = urlMatch[1];

                // 3. 백엔드로 다운로드 및 등록 요청 송신
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: "ADD_CUSTOM_FONT",
                        family: fontName,
                        url: fontUrl,
                        originalCssCode: cssCode
                    }));
                } else {
                    alert("서버 연결이 원활하지 않아 폰트를 다운로드할 수 없습니다.");
                }

                textareaEl.value = "";
            }

            const btnAddFont = document.getElementById("btn-add-custom-font");
            if (btnAddFont) btnAddFont.onclick = addCustomFont;
            const inputFont = document.getElementById("custom-font-input");
            if (inputFont) {
                inputFont.onkeydown = (e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        addCustomFont();
                    }
                };
            }

            // 텍스트 글자색 및 투명도 실시간 조절
            const updateTextFillColor = () => {
                if (currentEditingElement && (currentEditingElement.type === 'textbox' || currentEditingElement.type === 'text')) {
                    const color = document.getElementById("fontcolor-editor").value;
                    const opacity = document.getElementById("fontcolor-opacity").value;
                    const rgba = hexAndOpacityToRgba(color, opacity);
                    currentEditingElement.set('fill', rgba);
                    canvas.renderAll();
                }
            };
            document.getElementById("fontcolor-editor").oninput = (e) => {
                const val = e.target.value;
                document.getElementById("fontcolor-hex").value = val.toUpperCase();
                updateTextFillColor();
            };
            document.getElementById("fontcolor-opacity").oninput = (e) => {
                document.getElementById("fontcolor-opacity-val").textContent = e.target.value + "%";
                updateTextFillColor();
            };
            document.getElementById("fontcolor-editor").onchange = () => saveStateToHistory();
            document.getElementById("fontcolor-opacity").onchange = () => saveStateToHistory();

            document.getElementById("fontcolor-hex").oninput = (e) => {
                let val = e.target.value.trim();
                if (val && !val.startsWith('#')) val = '#' + val;
                const hexPattern = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
                if (hexPattern.test(val)) {
                    if (val.length === 4) {
                        val = '#' + val[1] + val[1] + val[2] + val[2] + val[3] + val[3];
                    }
                    document.getElementById("fontcolor-editor").value = val;
                    updateTextFillColor();
                }
            };
            document.getElementById("fontcolor-hex").onchange = (e) => {
                let val = e.target.value.trim();
                if (val && !val.startsWith('#')) val = '#' + val;
                const hexPattern = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
                if (hexPattern.test(val)) {
                    if (val.length === 4) {
                        val = '#' + val[1] + val[1] + val[2] + val[2] + val[3] + val[3];
                    }
                    e.target.value = val.toUpperCase();
                    saveStateToHistory();
                }
            };

            // 텍스트 테두리 색상 및 투명도 실시간 조절
            const updateTextStrokeColor = () => {
                if (currentEditingElement && (currentEditingElement.type === 'textbox' || currentEditingElement.type === 'text')) {
                    const color = document.getElementById("text-strokecolor").value;
                    const opacity = document.getElementById("text-strokecolor-opacity").value;
                    const rgba = hexAndOpacityToRgba(color, opacity);
                    currentEditingElement.set('stroke', rgba);
                    canvas.renderAll();
                }
            };
            document.getElementById("text-strokecolor").oninput = (e) => {
                const val = e.target.value;
                document.getElementById("text-strokecolor-hex").value = val.toUpperCase();
                updateTextStrokeColor();
            };
            document.getElementById("text-strokecolor-opacity").oninput = (e) => {
                document.getElementById("text-strokecolor-opacity-val").textContent = e.target.value + "%";
                updateTextStrokeColor();
            };
            document.getElementById("text-strokecolor").onchange = () => saveStateToHistory();
            document.getElementById("text-strokecolor-opacity").onchange = () => saveStateToHistory();

            document.getElementById("text-strokecolor-hex").oninput = (e) => {
                let val = e.target.value.trim();
                if (val && !val.startsWith('#')) val = '#' + val;
                const hexPattern = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
                if (hexPattern.test(val)) {
                    if (val.length === 4) {
                        val = '#' + val[1] + val[1] + val[2] + val[2] + val[3] + val[3];
                    }
                    document.getElementById("text-strokecolor").value = val;
                    updateTextStrokeColor();
                }
            };
            document.getElementById("text-strokecolor-hex").onchange = (e) => {
                let val = e.target.value.trim();
                if (val && !val.startsWith('#')) val = '#' + val;
                const hexPattern = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
                if (hexPattern.test(val)) {
                    if (val.length === 4) {
                        val = '#' + val[1] + val[1] + val[2] + val[2] + val[3] + val[3];
                    }
                    e.target.value = val.toUpperCase();
                    saveStateToHistory();
                }
            };

            // 텍스트 그림자 색상 및 투명도 실시간 조절
            const updateTextShadowColor = () => {
                if (currentEditingElement && (currentEditingElement.type === 'textbox' || currentEditingElement.type === 'text')) {
                    if (!currentEditingElement.shadow) {
                        currentEditingElement.setShadow({
                            color: 'rgba(0,0,0,1)',
                            blur: parseInt(document.getElementById("text-shadow-blur").value) || 5,
                            offsetX: parseInt(document.getElementById("text-shadow-offsetx").value) || 3,
                            offsetY: parseInt(document.getElementById("text-shadow-offsety").value) || 3
                        });
                    }
                    const color = document.getElementById("text-shadow-color").value;
                    const opacity = document.getElementById("text-shadow-color-opacity").value;
                    const rgba = hexAndOpacityToRgba(color, opacity);
                    currentEditingElement.shadow.color = rgba;
                    canvas.renderAll();
                }
            };
            document.getElementById("text-shadow-color").oninput = (e) => {
                const val = e.target.value;
                document.getElementById("text-shadow-color-hex").value = val.toUpperCase();
                updateTextShadowColor();
            };
            document.getElementById("text-shadow-color-opacity").oninput = (e) => {
                document.getElementById("text-shadow-color-opacity-val").textContent = e.target.value + "%";
                updateTextShadowColor();
            };
            document.getElementById("text-shadow-color").onchange = () => saveStateToHistory();
            document.getElementById("text-shadow-color-opacity").onchange = () => saveStateToHistory();

            document.getElementById("text-shadow-color-hex").oninput = (e) => {
                let val = e.target.value.trim();
                if (val && !val.startsWith('#')) val = '#' + val;
                const hexPattern = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
                if (hexPattern.test(val)) {
                    if (val.length === 4) {
                        val = '#' + val[1] + val[1] + val[2] + val[2] + val[3] + val[3];
                    }
                    document.getElementById("text-shadow-color").value = val;
                    updateTextShadowColor();
                }
            };
            document.getElementById("text-shadow-color-hex").onchange = (e) => {
                let val = e.target.value.trim();
                if (val && !val.startsWith('#')) val = '#' + val;
                const hexPattern = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
                if (hexPattern.test(val)) {
                    if (val.length === 4) {
                        val = '#' + val[1] + val[1] + val[2] + val[2] + val[3] + val[3];
                    }
                    e.target.value = val.toUpperCase();
                    saveStateToHistory();
                }
            };

            document.getElementById("btn-bold").onclick = () => {
                if (currentEditingElement && (currentEditingElement.type === 'textbox' || currentEditingElement.type === 'text')) {
                    const isBold = currentEditingElement.fontWeight === 'bold';
                    currentEditingElement.set('fontWeight', isBold ? 'normal' : 'bold');
                    document.getElementById("btn-bold").classList.toggle("active", !isBold);
                    canvas.renderAll();
                    saveStateToHistory();
                }
            };

            document.getElementById("btn-italic").onclick = () => {
                if (currentEditingElement && (currentEditingElement.type === 'textbox' || currentEditingElement.type === 'text')) {
                    const isItalic = currentEditingElement.fontStyle === 'italic';
                    currentEditingElement.set('fontStyle', isItalic ? 'normal' : 'italic');
                    document.getElementById("btn-italic").classList.toggle("active", !isItalic);
                    canvas.renderAll();
                    saveStateToHistory();
                }
            };

            const setAlign = (align) => {
                if (currentEditingElement && (currentEditingElement.type === 'textbox' || currentEditingElement.type === 'text')) {
                    currentEditingElement.set('textAlign', align);
                    document.getElementById("btn-align-left").classList.toggle("active", align === 'left');
                    document.getElementById("btn-align-center").classList.toggle("active", align === 'center');
                    document.getElementById("btn-align-right").classList.toggle("active", align === 'right');
                    canvas.renderAll();
                    saveStateToHistory();
                }
            };

            document.getElementById("btn-align-left").onclick = () => setAlign('left');
            document.getElementById("btn-align-center").onclick = () => setAlign('center');
            document.getElementById("btn-align-right").onclick = () => setAlign('right');

            // 도형 서식 리스너들
            // 도형 채우기 색상 및 투명도 실시간 조절
            const updateShapeFillColor = () => {
                if (currentEditingElement && currentEditingElement.type !== 'textbox' && currentEditingElement.type !== 'text') {
                    const color = document.getElementById("shape-fillcolor").value;
                    const opacity = document.getElementById("shape-fillcolor-opacity").value;
                    const rgba = hexAndOpacityToRgba(color, opacity);
                    currentEditingElement.set('fill', rgba);
                    canvas.renderAll();
                }
            };
            document.getElementById("shape-fillcolor").oninput = (e) => {
                const val = e.target.value;
                document.getElementById("shape-fillcolor-hex").value = val.toUpperCase();
                updateShapeFillColor();
            };
            document.getElementById("shape-fillcolor-opacity").oninput = (e) => {
                document.getElementById("shape-fillcolor-opacity-val").textContent = e.target.value + "%";
                updateShapeFillColor();
            };
            document.getElementById("shape-fillcolor").onchange = () => saveStateToHistory();
            document.getElementById("shape-fillcolor-opacity").onchange = () => saveStateToHistory();

            document.getElementById("shape-fillcolor-hex").oninput = (e) => {
                let val = e.target.value.trim();
                if (val && !val.startsWith('#')) val = '#' + val;
                const hexPattern = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
                if (hexPattern.test(val)) {
                    if (val.length === 4) {
                        val = '#' + val[1] + val[1] + val[2] + val[2] + val[3] + val[3];
                    }
                    document.getElementById("shape-fillcolor").value = val;
                    updateShapeFillColor();
                }
            };
            document.getElementById("shape-fillcolor-hex").onchange = (e) => {
                let val = e.target.value.trim();
                if (val && !val.startsWith('#')) val = '#' + val;
                const hexPattern = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
                if (hexPattern.test(val)) {
                    if (val.length === 4) {
                        val = '#' + val[1] + val[1] + val[2] + val[2] + val[3] + val[3];
                    }
                    e.target.value = val.toUpperCase();
                    saveStateToHistory();
                }
            };

            // 도형 테두리 색상 및 투명도 실시간 조절
            const updateShapeStrokeColor = () => {
                if (currentEditingElement && currentEditingElement.type !== 'textbox' && currentEditingElement.type !== 'text') {
                    const color = document.getElementById("shape-strokecolor").value;
                    const opacity = document.getElementById("shape-strokecolor-opacity").value;
                    const rgba = hexAndOpacityToRgba(color, opacity);
                    currentEditingElement.set('stroke', rgba);
                    canvas.renderAll();
                }
            };
            document.getElementById("shape-strokecolor").oninput = (e) => {
                const val = e.target.value;
                document.getElementById("shape-strokecolor-hex").value = val.toUpperCase();
                updateShapeStrokeColor();
            };
            document.getElementById("shape-strokecolor-opacity").oninput = (e) => {
                document.getElementById("shape-strokecolor-opacity-val").textContent = e.target.value + "%";
                updateShapeStrokeColor();
            };
            document.getElementById("shape-strokecolor").onchange = () => saveStateToHistory();
            document.getElementById("shape-strokecolor-opacity").onchange = () => saveStateToHistory();

            document.getElementById("shape-strokecolor-hex").oninput = (e) => {
                let val = e.target.value.trim();
                if (val && !val.startsWith('#')) val = '#' + val;
                const hexPattern = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
                if (hexPattern.test(val)) {
                    if (val.length === 4) {
                        val = '#' + val[1] + val[1] + val[2] + val[2] + val[3] + val[3];
                    }
                    document.getElementById("shape-strokecolor").value = val;
                    updateShapeStrokeColor();
                }
            };
            document.getElementById("shape-strokecolor-hex").onchange = (e) => {
                let val = e.target.value.trim();
                if (val && !val.startsWith('#')) val = '#' + val;
                const hexPattern = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
                if (hexPattern.test(val)) {
                    if (val.length === 4) {
                        val = '#' + val[1] + val[1] + val[2] + val[2] + val[3] + val[3];
                    }
                    e.target.value = val.toUpperCase();
                    saveStateToHistory();
                }
            };

            document.getElementById("shape-strokewidth").oninput = (e) => {
                if (currentEditingElement && currentEditingElement.type !== 'textbox' && currentEditingElement.type !== 'text') {
                    currentEditingElement.set('strokeWidth', parseInt(e.target.value) || 0);
                    canvas.renderAll();
                }
            };
            document.getElementById("shape-strokewidth").onchange = () => {
                saveStateToHistory();
            };

            document.getElementById("shape-corners").oninput = (e) => {
                if (currentEditingElement && currentEditingElement.type === 'rect') {
                    const val = parseInt(e.target.value) || 0;
                    currentEditingElement.set({ rx: val, ry: val });
                    canvas.renderAll();
                }
            };
            document.getElementById("shape-corners").onchange = () => {
                saveStateToHistory();
            };

            // 도형 추가 리스너
            document.getElementById("btn-add-rect").onclick = addRect;
            document.getElementById("btn-add-circle").onclick = addCircle;
            document.getElementById("btn-add-triangle").onclick = addTriangle;
            document.getElementById("btn-add-line").onclick = addLine;

            // X, Y, 너비, 높이 조절 & 중앙 배치 리스너
            document.getElementById("element-left").oninput = (e) => {
                if (currentEditingElement) {
                    currentEditingElement.set('left', parseFloat(e.target.value) || 0);
                    currentEditingElement.setCoords();
                    canvas.renderAll();
                    updateLayerList();
                }
            };
            document.getElementById("element-left").onchange = () => {
                saveStateToHistory();
            };

            document.getElementById("element-top").oninput = (e) => {
                if (currentEditingElement) {
                    currentEditingElement.set('top', parseFloat(e.target.value) || 0);
                    currentEditingElement.setCoords();
                    canvas.renderAll();
                    updateLayerList();
                }
            };
            document.getElementById("element-top").onchange = () => {
                saveStateToHistory();
            };

            document.getElementById("element-width").oninput = (e) => {
                if (currentEditingElement) {
                    const newWidth = parseFloat(e.target.value) || 0;
                    if (newWidth > 0 && currentEditingElement.width > 0) {
                        currentEditingElement.set('scaleX', newWidth / currentEditingElement.width);
                        currentEditingElement.setCoords();
                        canvas.renderAll();
                        updateLayerList();
                    }
                }
            };
            document.getElementById("element-width").onchange = () => {
                saveStateToHistory();
            };

            document.getElementById("element-height").oninput = (e) => {
                if (currentEditingElement) {
                    const newHeight = parseFloat(e.target.value) || 0;
                    if (newHeight > 0 && currentEditingElement.height > 0) {
                        currentEditingElement.set('scaleY', newHeight / currentEditingElement.height);
                        currentEditingElement.setCoords();
                        canvas.renderAll();
                        updateLayerList();
                    }
                }
            };
            document.getElementById("element-height").onchange = () => {
                saveStateToHistory();
            };

            document.getElementById("btn-center-element").onclick = () => {
                if (currentEditingElement) {
                    const objWidth = currentEditingElement.getScaledWidth();
                    const objHeight = currentEditingElement.getScaledHeight();

                    if (currentEditingElement.originX === 'center') {
                        currentEditingElement.set('left', BASE_WIDTH / 2);
                    } else {
                        currentEditingElement.set('left', (BASE_WIDTH - objWidth) / 2);
                    }

                    if (currentEditingElement.originY === 'center') {
                        currentEditingElement.set('top', BASE_HEIGHT / 2);
                    } else {
                        currentEditingElement.set('top', (BASE_HEIGHT - objHeight) / 2);
                    }

                    currentEditingElement.setCoords();
                    canvas.renderAll();
                    saveStateToHistory();
                    updateLayerList();
                    updateInspectorCoords();
                }
            };

            // 정렬 도구 바인딩 및 핸들러 추가
            const alignLeftBtn = document.getElementById("btn-align-left");
            const alignCenterHBtn = document.getElementById("btn-align-center-h");
            const alignRightBtn = document.getElementById("btn-align-right");
            const alignTopBtn = document.getElementById("btn-align-top");
            const alignCenterVBtn = document.getElementById("btn-align-center-v");
            const alignBottomBtn = document.getElementById("btn-align-bottom");

            const handleAlign = (type) => {
                if (!currentEditingElement) return;

                const objWidth = currentEditingElement.getScaledWidth();
                const objHeight = currentEditingElement.getScaledHeight();

                switch (type) {
                    case "left":
                        if (currentEditingElement.originX === 'center') {
                            currentEditingElement.set('left', objWidth / 2);
                        } else {
                            currentEditingElement.set('left', 0);
                        }
                        break;
                    case "center-h":
                        if (currentEditingElement.originX === 'center') {
                            currentEditingElement.set('left', BASE_WIDTH / 2);
                        } else {
                            currentEditingElement.set('left', (BASE_WIDTH - objWidth) / 2);
                        }
                        break;
                    case "right":
                        if (currentEditingElement.originX === 'center') {
                            currentEditingElement.set('left', BASE_WIDTH - objWidth / 2);
                        } else {
                            currentEditingElement.set('left', BASE_WIDTH - objWidth);
                        }
                        break;
                    case "top":
                        if (currentEditingElement.originY === 'center') {
                            currentEditingElement.set('top', objHeight / 2);
                        } else {
                            currentEditingElement.set('top', 0);
                        }
                        break;
                    case "center-v":
                        if (currentEditingElement.originY === 'center') {
                            currentEditingElement.set('top', BASE_HEIGHT / 2);
                        } else {
                            currentEditingElement.set('top', (BASE_HEIGHT - objHeight) / 2);
                        }
                        break;
                    case "bottom":
                        if (currentEditingElement.originY === 'center') {
                            currentEditingElement.set('top', BASE_HEIGHT - objHeight / 2);
                        } else {
                            currentEditingElement.set('top', BASE_HEIGHT - objHeight);
                        }
                        break;
                }

                currentEditingElement.setCoords();
                canvas.renderAll();
                saveStateToHistory();
                updateLayerList();
                updateInspectorCoords();
            };

            if (alignLeftBtn) alignLeftBtn.onclick = () => handleAlign("left");
            if (alignCenterHBtn) alignCenterHBtn.onclick = () => handleAlign("center-h");
            if (alignRightBtn) alignRightBtn.onclick = () => handleAlign("right");
            if (alignTopBtn) alignTopBtn.onclick = () => handleAlign("top");
            if (alignCenterVBtn) alignCenterVBtn.onclick = () => handleAlign("center-v");
            if (alignBottomBtn) alignBottomBtn.onclick = () => handleAlign("bottom");

            // 레이어 리스너
            document.getElementById("btn-layer-up").onclick = layerUp;
            document.getElementById("btn-layer-down").onclick = layerDown;
            document.getElementById("btn-layer-front").onclick = layerFront;
            document.getElementById("btn-layer-back").onclick = layerBack;

            // 그룹화 / 그룹 해제 리스너
            document.getElementById("btn-group").onclick = groupObjects;
            document.getElementById("btn-ungroup").onclick = ungroupObjects;

            // 삭제 리스너
            document.getElementById("btn-delete").onclick = deleteElement;

            // Delete 키 단축키로 삭제 처리 및 Ctrl+Z/Ctrl+Shift+Z 되돌리기/다시실행
            window.addEventListener('keydown', (e) => {
                if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT' || document.activeElement.tagName === 'TEXTAREA') {
                    return;
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
                        return;
                    }
                }

                if (e.key === 'Delete') {
                    const activeObj = canvas.getActiveObject();
                    const isTemplateTabActive = document.getElementById('panel-templates')?.classList.contains('active');
                    const isPraiseTabActive = document.getElementById('panel-praise')?.classList.contains('active');
                    const isStageBgTabActive = document.getElementById('panel-stage-bg')?.classList.contains('active');
                    const isStageBgVisible = document.getElementById('stage-bg-main-viewer-overlay')?.style.display !== 'none';
                    const isBibleVisible = document.getElementById('bible-main-viewer-overlay')?.style.display !== 'none';

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
                    // 복사 (Ctrl+C) - 시스템 클립보드 API 활용
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
                            // 1-A. 다중 개체 복사
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
                            // 1-B. 단일 개체 복사
                            const serialized = serializeElement(activeObj, BASE_WIDTH, BASE_HEIGHT);
                            const payload = { subcastType: "element", data: serialized };
                            navigator.clipboard.writeText(JSON.stringify(payload)).catch(err => {
                                console.error("시스템 클립보드 쓰기 실패:", err);
                            });
                        }
                    } else if (selectedSlideIds.length > 0) {
                        // 2. 슬라이드 복사
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

            // 저장/취소 리스너
            document.getElementById("btn-save").onclick = saveSlideData;
            document.getElementById("btn-cancel").onclick = cancelEditing;

            // 우측 인스펙터 패널 드래그 이동 활성화
            const inspectorPanel = document.querySelector(".right-inspector-panel");
            const inspectorHeader = document.querySelector(".right-inspector-panel .panel-header");
            if (inspectorPanel && inspectorHeader) {
                makeElementDraggable(inspectorPanel, inspectorHeader);
            }

            // 클립보드 복사 붙여넣기 (Paste) 통합 처리 리스너 - 시스템 클립보드 연동
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

                // 클립보드 파일 이미지가 없을 때, 시스템 클립보드 텍스트 데이터를 분석하여 복제본 붙여넣기 수행
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
                                    // 붙여넣은 다중 객체들을 활성 선택 상태(ActiveSelection)로 설정
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
                            // 일반 텍스트 등은 무시
                        }
                    }
                }
            });

            // 드래그 앤 드롭 파일 업로드 리스너
            const dropZone = document.querySelector(".canvas-wrapper-outer");
            if (dropZone) {
                dropZone.addEventListener("dragover", (e) => {
                    e.preventDefault();
                    dropZone.classList.add("dragover");
                });
                dropZone.addEventListener("dragleave", (e) => {
                    e.preventDefault();
                    dropZone.classList.remove("dragover");
                });
                dropZone.addEventListener("drop", (e) => {
                    e.preventDefault();
                    dropZone.classList.remove("dragover");

                    const files = e.dataTransfer.files;
                    if (files && files.length > 0) {
                        for (let i = 0; i < files.length; i++) {
                            if (files[i].type.startsWith("image/")) {
                                const pointer = canvas.getPointer(e);
                                insertImageToCanvas(files[i], pointer.x, pointer.y);
                            }
                        }
                    }
                });
            }

            // 창 닫을 때 락 자동 반환
            window.onbeforeunload = () => {
                releaseActiveLock();
            };
        };

        function makeElementDraggable(elmnt, header) {
            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
            if (header) {
                header.onmousedown = dragMouseDown;
            } else {
                elmnt.onmousedown = dragMouseDown;
            }

            function dragMouseDown(e) {
                e = e || window.event;
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') {
                    return;
                }
                e.preventDefault();
                pos3 = e.clientX;
                pos4 = e.clientY;
                document.onmouseup = closeDragElement;
                document.onmousemove = elementDrag;
            }

            function elementDrag(e) {
                e = e || window.event;
                e.preventDefault();
                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;
                pos3 = e.clientX;
                pos4 = e.clientY;

                let newTop = elmnt.offsetTop - pos2;
                let newLeft = elmnt.offsetLeft - pos1;

                // 화면 바운더리 계산 및 이탈 방지
                const workspace = document.querySelector(".workspace");
                if (workspace) {
                    const rect = workspace.getBoundingClientRect();
                    const elRect = elmnt.getBoundingClientRect();

                    if (newTop < 10) newTop = 10;
                    if (newTop + elRect.height > rect.height - 10) {
                        newTop = rect.height - elRect.height - 10;
                    }
                    if (newLeft < 10) newLeft = 10;
                    if (newLeft + elRect.width > rect.width - 10) {
                        newLeft = rect.width - elRect.width - 10;
                    }
                }

                elmnt.style.top = newTop + "px";
                elmnt.style.left = newLeft + "px";
                elmnt.style.right = "auto";
                elmnt.style.bottom = "auto";
            }

            function closeDragElement() {
                document.onmouseup = null;
                document.onmousemove = null;
            }
        }

        function insertImageToCanvas(file, x = null, y = null) {
            if (!activeSlideId) return;
            const reader = new FileReader();
            reader.onload = function (event) {
                fabric.Image.fromURL(event.target.result, function (img) {
                    const maxW = 400;
                    if (img.width > maxW) {
                        img.scaleToWidth(maxW);
                    }

                    const posX = x !== null ? x : (BASE_WIDTH - (img.width * img.scaleX)) / 2;
                    const posY = y !== null ? y : (BASE_HEIGHT - (img.height * img.scaleY)) / 2;

                    img.set({
                        left: posX,
                        top: posY,
                        originalId: `elem_${Math.random().toString(36).substr(2, 9)}`
                    });

                    canvas.add(img);
                    canvas.setActiveObject(img);
                    canvas.renderAll();
                    saveStateToHistory();
                });
            };
            reader.readAsDataURL(file);
        }

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

        // ==========================================================================
        // Bible Search & Integration Feature Logic
        // ==========================================================================
        let selectedBibleVerses = [];
        let bibleBooksList = [];
        let lastFilteredBooks = [];
        let tempBibleSlidesToAdd = [];
        let targetInsertAfterSlideId = null;

        function initBibleFeature() {
            // 성경 책 목록 가져오기
            fetchBibleBooks();

            // 성경 번역본 선택 변경 이벤트 바인딩
            const selectVer = document.getElementById("select-bible-version");
            if (selectVer) {
                selectVer.addEventListener("change", () => {
                    fetchBibleBooks();
                });
            }

            // 성경 모달 취소 및 닫기 바인딩
            const closeBibleModal = () => {
                document.getElementById("bible-insert-modal").style.display = "none";
                tempBibleSlidesToAdd = [];
                targetInsertAfterSlideId = null;
            };
            document.getElementById("btn-bible-close-modal", "btn-bible-modal-close") ? document.getElementById("btn-bible-modal-close").onclick = closeBibleModal : null;

            // 안전 조치: 모달 내 버튼 바인딩
            setTimeout(() => {
                const closeBtn = document.getElementById("btn-bible-modal-close");
                const cancelBtn = document.getElementById("btn-bible-modal-cancel");
                const confirmBtn = document.getElementById("btn-bible-modal-confirm");
                if (closeBtn) closeBtn.onclick = closeBibleModal;
                if (cancelBtn) cancelBtn.onclick = closeBibleModal;
                if (confirmBtn) confirmBtn.onclick = confirmAddBibleSlides;
            }, 100);

            // 검색 모드 전환 핸들러
            document.getElementById("btn-mode-coord").onclick = () => switchBibleSearchMode("coord");
            document.getElementById("btn-mode-keyword").onclick = () => switchBibleSearchMode("keyword");

            // 장/절 조회 버튼
            document.getElementById("btn-bible-fetch").onclick = fetchBibleCoordinates;

            // 키워드 검색 버튼
            document.getElementById("btn-bible-search").onclick = searchBibleKeywords;
            document.getElementById("input-bible-keyword").onkeydown = (e) => {
                if (e.key === "Enter") searchBibleKeywords();
            };

            // 책 선택 변경 시 최대 장 수 조절
            document.getElementById("select-bible-book").onchange = onBibleBookChange;

            // 도서 검색 필터 및 팝업 제어 리스너 연동
            const filterInput = document.getElementById("input-bible-book-filter");
            filterInput.oninput = (e) => filterBibleBooks(e.target.value);
            filterInput.onfocus = () => {
                filterBibleBooks(filterInput.value);
            };
            filterInput.onkeydown = (e) => {
                if (e.key === "Enter") {
                    const popup = document.getElementById("bible-book-dropdown-popup");
                    // 1) 자동완성 결과가 1개이고 팝업이 노출 중인 경우 즉각 선택 및 팝업 닫기
                    if (lastFilteredBooks.length === 1 && popup && popup.style.display !== "none") {
                        e.preventDefault();
                        const book = lastFilteredBooks[0];
                        filterInput.value = book.book_name;
                        const selectBook = document.getElementById("select-bible-book");
                        selectBook.value = book.book_code;
                        onBibleBookChange();
                        popup.style.display = "none";
                    }
                    // 2) 팝업이 닫혀 있고 현재 입력한 값이 올바른 책 이름과 일치할 시 즉각 조회 및 본문 로드 실행
                    else if (popup && popup.style.display === "none") {
                        const currentVal = filterInput.value.trim();
                        const matchedBook = bibleBooksList.find(b => b.book_name === currentVal);
                        if (matchedBook) {
                            e.preventDefault();
                            fetchBibleCoordinates();
                        }
                    }
                }
            };

            // 바깥 영역 클릭 시 자동완성 팝업 닫기
            document.addEventListener("mousedown", (e) => {
                const wrapper = document.getElementById("bible-book-search-wrapper");
                const popup = document.getElementById("bible-book-dropdown-popup");
                if (wrapper && popup && !wrapper.contains(e.target)) {
                    popup.style.display = "none";
                }
            });

            // 전체 선택 체크박스
            document.getElementById("chk-select-all-bible").onchange = toggleSelectAllBible;

            // 분할 모드 변경 및 슬라이드 추가 버튼 바인딩
            document.getElementById("select-bible-split-mode").onchange = updateBibleExpectedSlides;
            document.getElementById("btn-add-bible-slides").onclick = addBibleSlidesToProject;

            // 성경 메인 표 뷰어 이벤트 바인딩
            initBibleMainViewerEvents();
        }

        // 영타 오타 한글 자동 변환기 (Keyboard Layout Translation)
        function engTypeToKor(eng) {
            if (!/^[a-zA-Z\s]+$/.test(eng)) {
                return eng; // 영문 알파벳만 있을 때만 오타로 취급하여 한글 변환 수행
            }

            const choMap = { 'r': 0, 'R': 1, 's': 2, 'e': 3, 'E': 4, 'f': 5, 'a': 6, 'q': 7, 'Q': 8, 't': 9, 'T': 10, 'd': 11, 'w': 12, 'W': 13, 'c': 14, 'z': 15, 'x': 16, 'v': 17, 'g': 18 };
            const jungMap = { 'k': 0, 'o': 1, 'i': 2, 'O': 3, 'j': 4, 'p': 5, 'u': 6, 'P': 7, 'h': 8, 'y': 12, 'n': 13, 'b': 17, 'm': 18, 'l': 20 };

            const doubleJung = { 'hk': 9, 'ho': 10, 'hl': 11, 'nj': 14, 'np': 15, 'nl': 16, 'ml': 19 };
            const doubleJong = { 'rt': 3, 'sw': 5, 'sg': 6, 'fr': 9, 'fa': 10, 'fq': 11, 'ft': 12, 'fx': 13, 'fv': 14, 'fg': 15, 'qt': 18 };

            const singleJongMap = { 'r': 1, 'R': 2, 's': 4, 'e': 7, 'f': 8, 'a': 16, 'q': 17, 't': 19, 'T': 20, 'd': 21, 'w': 22, 'c': 23, 'z': 24, 'x': 25, 'v': 26, 'g': 27 };
            const engToKorCharMap = {
                'r': 'ㄱ', 'R': 'ㄲ', 's': 'ㄴ', 'e': 'ㄷ', 'E': 'ㄸ', 'f': 'ㄹ', 'a': 'ㅁ', 'q': 'ㅂ', 'Q': 'ㅃ', 't': 'ㅅ', 'T': 'ㅆ', 'd': 'ㅇ', 'w': 'ㅈ', 'W': 'ㅉ', 'c': 'ㅊ', 'z': 'ㅋ', 'x': 'ㅌ', 'v': 'ㅍ', 'g': 'ㅎ',
                'k': 'ㅏ', 'o': 'ㅐ', 'i': '랴', 'O': 'ㅒ', 'j': 'ㅓ', 'p': 'ㅔ', 'u': 'ㅕ', 'P': 'ㅖ', 'h': 'ㅗ', 'y': 'ㅛ', 'n': 'ㅜ', 'b': 'ㅠ', 'm': 'ㅡ', 'l': 'ㅣ'
            };

            let result = "";
            let i = 0;

            while (i < eng.length) {
                let c = eng[i];
                let choCode = choMap[c];

                if (choCode === undefined) {
                    result += engToKorCharMap[c] || c;
                    i++;
                    continue;
                }

                let step = 1;

                // 모음 확인
                if (i + 1 < eng.length) {
                    let nextC = eng[i + 1];
                    let jungCode = jungMap[nextC];

                    if (jungCode !== undefined) {
                        step = 2;

                        // 이중 모음 여부 검증
                        if (i + 2 < eng.length) {
                            let possibleDoubleJung = nextC + eng[i + 2];
                            if (doubleJung[possibleDoubleJung] !== undefined) {
                                jungCode = doubleJung[possibleDoubleJung];
                                step = 3;
                            }
                        }

                        // 종성(받침) 판단
                        let jongCode = 0;
                        if (i + step < eng.length) {
                            let finalC = eng[i + step];
                            let singleJong = singleJongMap[finalC];

                            if (singleJong !== undefined) {
                                // 다음 글자의 모음 시작 가능성 확인
                                let isNextVowel = false;
                                if (i + step + 1 < eng.length) {
                                    let nextV = eng[i + step + 1];
                                    if (jungMap[nextV] !== undefined) {
                                        isNextVowel = true;
                                    }
                                }

                                if (!isNextVowel) {
                                    jongCode = singleJong;
                                    let addStep = 1;

                                    // 이중 받침 확인
                                    if (i + step + 1 < eng.length) {
                                        let possibleDoubleJong = finalC + eng[i + step + 1];
                                        if (doubleJong[possibleDoubleJong] !== undefined) {
                                            let isNextNextVowel = false;
                                            if (i + step + 2 < eng.length) {
                                                let nextNV = eng[i + step + 2];
                                                if (jungMap[nextNV] !== undefined) {
                                                    isNextNextVowel = true;
                                                }
                                            }
                                            if (!isNextNextVowel) {
                                                jongCode = doubleJong[possibleDoubleJong];
                                                addStep = 2;
                                            }
                                        }
                                    }
                                    step += addStep;
                                }
                            }
                        }

                        // 조합형 한글 생성 (초성*21 + 중성)*28 + 종성 + 0xAC00
                        result += String.fromCharCode((choCode * 21 + jungCode) * 28 + jongCode + 44032);
                        i += step;
                        continue;
                    }
                }

                // 단독 자음
                result += engToKorCharMap[c] || c;
                i += step;
            }

            return result;
        }

        function filterBibleBooks(query) {
            const popup = document.getElementById("bible-book-dropdown-popup");
            const selectBook = document.getElementById("select-bible-book");
            if (!popup || !selectBook || !bibleBooksList) return;

            const cleanQuery = query.trim().toLowerCase();
            const currentSelectedValue = selectBook.value;

            // 영어 오타일 가능성을 열고 한글 번역 수행
            const translatedQuery = engTypeToKor(query).trim().toLowerCase();

            let filtered = [];
            if (cleanQuery === "") {
                filtered = [...bibleBooksList];
            } else {
                filtered = bibleBooksList.filter(book =>
                    book.book_name.toLowerCase().includes(cleanQuery) ||
                    convertToShortBookName(book.book_name).toLowerCase().includes(cleanQuery) ||
                    book.book_code.toLowerCase().includes(cleanQuery) ||
                    // 오타 대응 매핑
                    book.book_name.toLowerCase().includes(translatedQuery) ||
                    convertToShortBookName(book.book_name).toLowerCase().includes(translatedQuery)
                );
            }

            // 검색 결과 캐시 보관 (엔터 키 입력 시 자동완성 판단용)
            lastFilteredBooks = filtered;

            popup.innerHTML = "";
            popup.style.display = "block";

            if (filtered.length === 0) {
                const div = document.createElement("div");
                div.className = "bible-book-dropdown-item";
                div.style.color = "var(--text-muted)";
                div.style.cursor = "default";
                div.textContent = "검색 결과 없음";
                popup.appendChild(div);
            } else {
                filtered.forEach(book => {
                    const div = document.createElement("div");
                    div.className = "bible-book-dropdown-item";
                    if (book.book_code === currentSelectedValue) {
                        div.classList.add("active");
                    }
                    div.textContent = book.book_name;
                    div.onclick = (e) => {
                        e.stopPropagation();
                        // 텍스트 필드 값 입력
                        document.getElementById("input-bible-book-filter").value = book.book_name;
                        // 숨김 select 값 지정
                        selectBook.value = book.book_code;
                        onBibleBookChange();
                        popup.style.display = "none";
                    };
                    popup.appendChild(div);
                });
            }
        }

        function switchBibleSearchMode(mode) {
            const isCoord = mode === "coord";
            document.getElementById("btn-mode-coord").classList.toggle("active", isCoord);
            document.getElementById("btn-mode-keyword").classList.toggle("active", !isCoord);

            document.getElementById("form-coord-search").style.display = isCoord ? "flex" : "none";
            document.getElementById("form-keyword-search").style.display = isCoord ? "none" : "flex";
        }

        function getSelectedBibleVersion() {
            const selectVer = document.getElementById("select-bible-version");
            return selectVer ? selectVer.value : "KRV";
        }

        async function fetchBibleBooks() {
            try {
                const version = getSelectedBibleVersion();
                const response = await fetch(`/api/bible/books?version=${version}`);
                if (!response.ok) throw new Error("성경 책 목록 로드 실패");
                bibleBooksList = await response.json();

                const selectBook = document.getElementById("select-bible-book");
                selectBook.innerHTML = "";

                bibleBooksList.forEach(book => {
                    const opt = document.createElement("option");
                    opt.value = book.book_code;
                    opt.textContent = book.book_name;
                    selectBook.appendChild(opt);
                });

                // 초기 설정 호출
                onBibleBookChange();
            } catch (err) {
                console.error("Bible books load error:", err);
            }
        }

        function onBibleBookChange() {
            const selectBook = document.getElementById("select-bible-book");
            const selectedCode = selectBook.value;
            const bookInfo = bibleBooksList.find(b => b.book_code === selectedCode);

            const inputChapter = document.getElementById("input-bible-chapter");
            if (bookInfo) {
                inputChapter.max = bookInfo.max_chapter;
                inputChapter.min = 1;
                inputChapter.value = 1;
            }

            // 장이 바뀌면 절 번호도 기본 1로 제어
            document.getElementById("input-bible-start-verse").value = 1;
            document.getElementById("input-bible-end-verse").value = "";
        }

        async function fetchBibleCoordinates() {
            const selectBook = document.getElementById("select-bible-book");
            const bookCode = selectBook.value;
            const chapter = parseInt(document.getElementById("input-bible-chapter").value);
            const startVerseVal = document.getElementById("input-bible-start-verse").value;
            const endVerseVal = document.getElementById("input-bible-end-verse").value;
            const version = getSelectedBibleVersion();

            if (!chapter || chapter < 1) {
                alert("올바른 장 번호를 입력하세요.");
                return;
            }

            const startVerse = startVerseVal ? parseInt(startVerseVal) : 1;
            const endVerse = endVerseVal ? parseInt(endVerseVal) : 999;

            if (startVerse > endVerse) {
                alert("시작 절은 끝 절보다 작거나 같아야 합니다.");
                return;
            }

            setBibleLoadingState(true, "btn-bible-fetch");
            try {
                const response = await fetch(`/api/bible/read?book_code=${bookCode}&chapter=${chapter}&start_verse=${startVerse}&end_verse=${endVerse}&version=${version}`);
                if (!response.ok) throw new Error("성경 구절 패치 실패");
                const data = await response.json();

                renderBibleResults(data.verses.map(v => ({
                    book_name: data.book_name,
                    book_code: data.book_code,
                    chapter: data.chapter,
                    verse: v.verse,
                    content: v.content
                })));
            } catch (err) {
                alert("오류 발생: " + err.message);
            } finally {
                setBibleLoadingState(false, "btn-bible-fetch");
            }
        }

        async function searchBibleKeywords() {
            const query = document.getElementById("input-bible-keyword").value.trim();
            const version = getSelectedBibleVersion();
            if (query.length < 2) {
                alert("검색어는 공백 제외 2글자 이상 입력해 주세요.");
                return;
            }

            setBibleLoadingState(true, "btn-bible-search");
            try {
                const response = await fetch(`/api/bible/search?query=${encodeURIComponent(query)}&version=${version}`);
                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.detail || "검색 실패");
                }
                const data = await response.json();
                renderBibleResults(data.results);
            } catch (err) {
                alert("오류 발생: " + err.message);
            } finally {
                setBibleLoadingState(false, "btn-bible-search");
            }
        }

        function setBibleLoadingState(isLoading, buttonId) {
            const btn = document.getElementById(buttonId);
            if (isLoading) {
                btn.disabled = true;
                btn.dataset.originalHtml = btn.innerHTML;
                btn.innerHTML = `<span class="btn-loading-spinner"></span> <span>조회 중...</span>`;
            } else {
                btn.disabled = false;
                btn.innerHTML = btn.dataset.originalHtml;
            }
        }

        // 성경 메인 표 뷰어 (중앙 슬라이드 영역 오버레이) 상태 제어
        let bibleViewerFontSize = 16; // 기본 글자 크기 (px)

        function updateBibleViewerFontSize(newSize) {
            bibleViewerFontSize = Math.max(5, Math.min(60, newSize));
            const table = document.getElementById("table-bible-main-viewer");
            if (table) {
                table.style.fontSize = `${bibleViewerFontSize}px`;
            }
            const label = document.getElementById("bible-viewer-fontsize-label");
            if (label) {
                label.textContent = `${bibleViewerFontSize}px`;
            }
        }

        function initBibleMainViewerEvents() {
            const viewerOverlay = document.getElementById("bible-main-viewer-overlay");

            if (viewerOverlay) {
                // Ctrl + 마우스 휠 글자 크기 조절
                viewerOverlay.addEventListener("wheel", (e) => {
                    if (e.ctrlKey) {
                        e.preventDefault();
                        if (e.deltaY < 0) {
                            updateBibleViewerFontSize(bibleViewerFontSize + 1);
                        } else if (e.deltaY > 0) {
                            updateBibleViewerFontSize(bibleViewerFontSize - 1);
                        }
                    }
                }, { passive: false });
            }

            const btnDecrease = document.getElementById("btn-bible-font-decrease");
            const btnIncrease = document.getElementById("btn-bible-font-increase");
            const btnReset = document.getElementById("btn-bible-font-reset");
            const btnClose = document.getElementById("btn-close-bible-viewer");
            const btnAddSlides = document.getElementById("btn-bible-viewer-add-slides");

            if (btnDecrease) btnDecrease.onclick = () => updateBibleViewerFontSize(bibleViewerFontSize - 1);
            if (btnIncrease) btnIncrease.onclick = () => updateBibleViewerFontSize(bibleViewerFontSize + 1);
            if (btnReset) btnReset.onclick = () => updateBibleViewerFontSize(16);
            if (btnClose) btnClose.onclick = hideBibleMainViewer;
            if (btnAddSlides) btnAddSlides.onclick = addBibleSlidesToProject;
        }

        let bibleViewerLastClickedIndex = -1;
        let isBibleViewerMouseDown = false;
        let bibleViewerDragStartIdx = -1;
        let bibleViewerIsDragging = false;
        let activeBibleResultsData = [];

        // 글로벌 mouseup 처리기 (드래그 상태 강제 해제)
        window.addEventListener("mouseup", () => {
            if (isBibleViewerMouseDown) {
                isBibleViewerMouseDown = false;
                bibleViewerDragStartIdx = -1;
                if (activeBibleResultsData && activeBibleResultsData.length > 0) {
                    syncSelectionFromViewer(activeBibleResultsData);
                }
            }
        });

        function attachBibleTableSelectionEvents(results) {
            const tbody = document.getElementById("tbody-bible-main-viewer");
            if (!tbody || !results) return;

            activeBibleResultsData = results;
            const rows = Array.from(tbody.querySelectorAll("tr"));
            if (rows.length === 0 || results.length === 0) return;

            rows.forEach((tr, idx) => {
                tr.dataset.index = idx;

                tr.onmousedown = (e) => {
                    if (e.button !== 0) return;
                    isBibleViewerMouseDown = true;
                    bibleViewerDragStartIdx = idx;
                    bibleViewerIsDragging = false;

                    if (e.ctrlKey || e.metaKey) {
                        tr.classList.toggle("selected");
                        bibleViewerLastClickedIndex = idx;
                        syncSelectionFromViewer(results);
                    } else if (e.shiftKey && bibleViewerLastClickedIndex !== -1) {
                        const start = Math.min(bibleViewerLastClickedIndex, idx);
                        const end = Math.max(bibleViewerLastClickedIndex, idx);
                        rows.forEach((r, rIdx) => {
                            if (rIdx >= start && rIdx <= end) {
                                r.classList.add("selected");
                            }
                        });
                        syncSelectionFromViewer(results);
                    }
                };

                tr.onmouseenter = (e) => {
                    if (isBibleViewerMouseDown && bibleViewerDragStartIdx !== -1) {
                        bibleViewerIsDragging = true;
                        const start = Math.min(bibleViewerDragStartIdx, idx);
                        const end = Math.max(bibleViewerDragStartIdx, idx);

                        if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                            rows.forEach((r, rIdx) => {
                                if (rIdx >= start && rIdx <= end) {
                                    r.classList.add("selected");
                                } else {
                                    r.classList.remove("selected");
                                }
                            });
                        } else {
                            rows.forEach((r, rIdx) => {
                                if (rIdx >= start && rIdx <= end) {
                                    r.classList.add("selected");
                                }
                            });
                        }
                        syncSelectionFromViewer(results);
                    }
                };

                tr.onclick = (e) => {
                    if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !bibleViewerIsDragging) {
                        const selectedRows = tbody.querySelectorAll("tr.selected");
                        const isSelected = tr.classList.contains("selected");

                        if (selectedRows.length === 1 && isSelected) {
                            tr.classList.remove("selected");
                        } else {
                            rows.forEach(r => r.classList.remove("selected"));
                            tr.classList.add("selected");
                        }
                        bibleViewerLastClickedIndex = idx;
                        syncSelectionFromViewer(results);
                    }
                };
            });
        }

        function syncSelectionFromViewer(results) {
            const tbody = document.getElementById("tbody-bible-main-viewer");
            if (!tbody || !results) return;

            const selectedIndices = [];
            const rows = tbody.querySelectorAll("tr");
            rows.forEach((tr, idx) => {
                if (tr.classList.contains("selected")) {
                    selectedIndices.push(idx);
                }
            });

            selectedBibleVerses = selectedIndices.map(i => results[i]).filter(Boolean);

            const leftItems = document.querySelectorAll("#bible-results-list .bible-result-item");
            leftItems.forEach((div, idx) => {
                const chk = div.querySelector(".bible-item-checkbox");
                const isSelected = selectedIndices.includes(idx);
                if (chk) chk.checked = isSelected;
                div.classList.toggle("selected", isSelected);
            });

            const count = selectedBibleVerses.length;
            const countLabel = document.getElementById("bible-viewer-selected-count");
            if (countLabel) countLabel.textContent = count;

            const viewerAddBtn = document.getElementById("btn-bible-viewer-add-slides");
            if (viewerAddBtn) {
                if (count > 0) {
                    viewerAddBtn.disabled = false;
                    viewerAddBtn.style.cursor = "pointer";
                    viewerAddBtn.style.opacity = "1";
                } else {
                    viewerAddBtn.disabled = true;
                    viewerAddBtn.style.cursor = "not-allowed";
                    viewerAddBtn.style.opacity = "0.5";
                }
            }

            updateBibleExpectedSlides();
        }

        function syncViewerFromLeftPanel() {
            const tbody = document.getElementById("tbody-bible-main-viewer");
            if (!tbody) return;

            const leftItems = document.querySelectorAll("#bible-results-list .bible-result-item");
            const rows = tbody.querySelectorAll("tr");

            leftItems.forEach((div, idx) => {
                const chk = div.querySelector(".bible-item-checkbox");
                const isChecked = chk && chk.checked;
                if (rows[idx]) {
                    rows[idx].classList.toggle("selected", isChecked);
                }
            });

            const count = selectedBibleVerses.length;
            const countLabel = document.getElementById("bible-viewer-selected-count");
            if (countLabel) countLabel.textContent = count;

            const viewerAddBtn = document.getElementById("btn-bible-viewer-add-slides");
            if (viewerAddBtn) {
                if (count > 0) {
                    viewerAddBtn.disabled = false;
                    viewerAddBtn.style.cursor = "pointer";
                    viewerAddBtn.style.opacity = "1";
                } else {
                    viewerAddBtn.disabled = true;
                    viewerAddBtn.style.cursor = "not-allowed";
                    viewerAddBtn.style.opacity = "0.5";
                }
            }
        }

        function showBibleMainViewer(results, titleInfo) {
            const overlay = document.getElementById("bible-main-viewer-overlay");
            const tbody = document.getElementById("tbody-bible-main-viewer");
            const titleEl = document.getElementById("bible-viewer-title");

            if (!overlay || !tbody) return;

            if (titleInfo && titleEl) {
                titleEl.textContent = `${titleInfo}`;
            }

            tbody.innerHTML = "";

            if (!results || results.length === 0) {
                tbody.innerHTML = `<tr><td colspan="2" style="text-align: center; padding: 40px 0; color: var(--text-muted);">표시할 성경 구절이 없습니다.</td></tr>`;
            } else {
                results.forEach(item => {
                    const tr = document.createElement("tr");
                    const verseText = `${item.book_name} ${item.chapter}:${item.verse}`;

                    tr.innerHTML = `
                        <td class="verse-badge">${verseText}</td>
                        <td>${item.content}</td>
                    `;
                    tbody.appendChild(tr);
                });

                attachBibleTableSelectionEvents(results);
            }

            overlay.style.display = "flex";
            updateBibleViewerFontSize(bibleViewerFontSize);
            syncViewerFromLeftPanel();
        }

        function hideBibleMainViewer() {
            const overlay = document.getElementById("bible-main-viewer-overlay");
            if (overlay) {
                overlay.style.display = "none";
            }
        }

        function renderBibleResults(results) {
            const container = document.getElementById("bible-results-list");
            container.innerHTML = "";

            document.getElementById("lbl-result-count").textContent = `검색 결과 (${results.length}건)`;
            document.getElementById("chk-select-all-bible").checked = false;
            selectedBibleVerses = [];
            updateBibleExpectedSlides();

            // 성경 조회가 성공했으므로 중앙 슬라이드 영역에 성경 메인 표 뷰어 출력
            let titleText = "성경 검색 결과";
            if (results && results.length > 0) {
                titleText = `${results[0].book_name} ${results[0].chapter}장 (총 ${results.length}구절)`;
            }
            showBibleMainViewer(results, titleText);

            if (results.length === 0) {
                container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.78rem; text-align: center; margin: auto; padding: 20px 0;">일치하는 구절이 없습니다.</div>`;
                return;
            }

            let lastClickedIndex = -1;

            results.forEach((item, index) => {
                const div = document.createElement("div");
                div.className = "bible-result-item";

                // 방송용 약칭 맵 적용
                const shortBook = convertToShortBookName(item.book_name);

                div.innerHTML = `
                    <input type="checkbox" class="bible-item-checkbox" data-index="${index}" style="margin-top: 4px; pointer-events: none;">
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                        <span class="bible-result-item-header">${shortBook} ${item.chapter}:${item.verse}</span>
                        <span class="bible-result-item-content">${item.content}</span>
                    </div>
                `;

                // 메모리 참조를 위해 데이터 보관
                div.dataset.verseData = JSON.stringify(item);

                // 클릭 인터랙션 (Shift 클릭 범위 다중 선택 탑재)
                div.onclick = (e) => {
                    const checkboxes = container.querySelectorAll(".bible-item-checkbox");
                    const itemsList = container.querySelectorAll(".bible-result-item");
                    const chk = div.querySelector(".bible-item-checkbox");

                    if (e.shiftKey && lastClickedIndex !== -1) {
                        const start = Math.min(lastClickedIndex, index);
                        const end = Math.max(lastClickedIndex, index);

                        // 마지막으로 선택했던 항목의 체크박스 상태로 일괄 동기화
                        const baseChecked = checkboxes[lastClickedIndex].checked;

                        for (let k = start; k <= end; k++) {
                            checkboxes[k].checked = baseChecked;
                            itemsList[k].classList.toggle("selected", baseChecked);
                        }
                    } else {
                        chk.checked = !chk.checked;
                        div.classList.toggle("selected", chk.checked);
                        lastClickedIndex = index;
                    }

                    updateSelectedVersesMemory();
                };

                // 실시간 미리보기 마우스 오버/아웃 인터랙션
                div.onmouseenter = () => showBibleLivePreview(item);
                div.onmouseleave = () => hideBibleLivePreview();

                container.appendChild(div);
            });
        }

        function updateSelectedVersesMemory() {
            selectedBibleVerses = [];
            const items = document.querySelectorAll(".bible-result-item");
            items.forEach(div => {
                const chk = div.querySelector(".bible-item-checkbox");
                if (chk && chk.checked) {
                    selectedBibleVerses.push(JSON.parse(div.dataset.verseData));
                }
            });

            // 전체 선택 체크박스 상태 갱신
            const allCheckboxes = document.querySelectorAll(".bible-item-checkbox");
            const allChecked = allCheckboxes.length > 0 && Array.from(allCheckboxes).every(c => c.checked);
            document.getElementById("chk-select-all-bible").checked = allChecked;

            syncViewerFromLeftPanel();
            updateBibleExpectedSlides();
        }

        function toggleSelectAllBible() {
            const state = document.getElementById("chk-select-all-bible").checked;
            const items = document.querySelectorAll(".bible-result-item");
            items.forEach(div => {
                const chk = div.querySelector(".bible-item-checkbox");
                if (chk) {
                    chk.checked = state;
                    div.classList.toggle("selected", state);
                }
            });
            updateSelectedVersesMemory();
        }

        function updateBibleExpectedSlides() {
            const count = selectedBibleVerses.length;
            const mode = document.getElementById("select-bible-split-mode").value;
            let expected = 0;

            if (count > 0) {
                if (mode === "1") {
                    expected = count;
                } else if (mode === "2") {
                    expected = Math.ceil(count / 2);
                } else if (mode === "all") {
                    expected = 1;
                } else if (mode === "auto") {
                    // 80자 기준 분할 예측
                    let tempSlides = 0;
                    selectedBibleVerses.forEach(v => {
                        tempSlides += Math.ceil(v.content.length / 80);
                    });
                    expected = tempSlides;
                }
            }

            document.getElementById("val-selected-count").textContent = count;
            document.getElementById("val-expected-slides").textContent = expected;

            const btn = document.getElementById("btn-add-bible-slides");
            if (count > 0) {
                btn.disabled = false;
                btn.style.cursor = "pointer";
                btn.style.opacity = "1";
            } else {
                btn.disabled = true;
                btn.style.cursor = "not-allowed";
                btn.style.opacity = "0.5";
            }
        }

        // 방송용 약칭 치환 함수
        function convertToShortBookName(fullName) {
            const nameMap = {
                "창세기": "창", "출애굽기": "출", "레위기": "레", "민수기": "민", "신명기": "신",
                "여호수아": "수", "사사기": "사", "룻기": "룻", "사무엘상": "삼상", "사무엘하": "삼하",
                "열왕기상": "왕상", "열왕기하": "왕하", "역대상": "대상", "역대하": "대하", "에스라": "스",
                "느헤미야": "느", "에스더": "에", "욥기": "욥", "시편": "시", "잠언": "잠",
                "전도서": "전", "아가": "아", "이사야": "사", "예레미야": "렘", "예레미야애가": "애",
                "에스겔": "겔", "다니엘": "단", "호세아": "호", "요엘": "욜", "아모스": "암",
                "오바댜": "옵", "요나": "욘", "미가": "미", "나훔": "나", "하박국": "합",
                "스바냐": "습", "학개": "학", "스가랴": "슥", "말라기": "말", "마태복음": "마",
                "마가복음": "막", "누가복음": "눅", "요한복음": "요", "사도행전": "행", "로마서": "롬",
                "고린도전서": "고전", "고린도후서": "고후", "갈라디아서": "갈", "에베소서": "엡", "빌립보서": "빌",
                "골로새서": "골", "데살로니가전서": "살전", "데살로니가후서": "살후", "디모데전서": "딤전", "디모데후서": "딤후",
                "디도서": "딛", "빌레몬서": "몬", "히브리서": "히", "야고보서": "약", "베드로전서": "벧전",
                "베드로후서": "벧후", "요한1서": "요일", "요한2서": "요이", "요한3서": "요삼", "유다서": "유",
                "요한계시록": "계"
            };
            return nameMap[fullName] || fullName;
        }

        // 실시간 미리보기 팝업 노출
        let previewEl = null;
        function showBibleLivePreview(item) {
            if (previewEl) hideBibleLivePreview();

            const workspace = document.querySelector(".workspace");
            if (!workspace) return;

            previewEl = document.createElement("div");
            previewEl.className = "bible-preview-overlay";

            const shortBook = convertToShortBookName(item.book_name);
            previewEl.innerHTML = `
                <div class="bible-preview-header">[송출 미리보기] ${shortBook} ${item.chapter}:${item.verse}</div>
                <div class="bible-preview-content">${item.content}</div>
            `;
            workspace.appendChild(previewEl);
        }

        function hideBibleLivePreview() {
            if (previewEl) {
                previewEl.remove();
                previewEl = null;
            }
        }

        // 슬라이드 벌크 추가 및 웹소켓 발행 (삽입 위치 지정 모달 팝업 가동)
        function addBibleSlidesToProject() {
            if (selectedBibleVerses.length === 0) return;

            const mode = document.getElementById("select-bible-split-mode").value;
            tempBibleSlidesToAdd = [];

            if (mode === "1") {
                // 1절씩 개별 추가
                selectedBibleVerses.forEach(v => {
                    const shortBook = convertToShortBookName(v.book_name);
                    const headerText = `${shortBook} ${v.chapter}:${v.verse}`;
                    tempBibleSlidesToAdd.push(createBibleSlideObject(headerText, v.content));
                });
            } else if (mode === "2") {
                // 2절씩 묶어서 추가
                for (let i = 0; i < selectedBibleVerses.length; i += 2) {
                    const v1 = selectedBibleVerses[i];
                    const v2 = selectedBibleVerses[i + 1];
                    const shortBook = convertToShortBookName(v1.book_name);

                    let headerText = `${shortBook} ${v1.chapter}:${v1.verse}`;
                    let contentText = v1.content;

                    if (v2) {
                        headerText = `${shortBook} ${v1.chapter}:${v1.verse}-${v2.verse}`;
                        contentText = `${v1.content}\n${v2.content}`;
                    }
                    tempBibleSlidesToAdd.push(createBibleSlideObject(headerText, contentText));
                }
            } else if (mode === "all") {
                // 전체 합치기
                const v1 = selectedBibleVerses[0];
                const vend = selectedBibleVerses[selectedBibleVerses.length - 1];
                const shortBook = convertToShortBookName(v1.book_name);

                let headerText = `${shortBook} ${v1.chapter}:${v1.verse}`;
                if (selectedBibleVerses.length > 1) {
                    headerText = `${shortBook} ${v1.chapter}:${v1.verse}-${vend.verse}`;
                }

                const contentText = selectedBibleVerses.map(v => v.content).join("\n");
                tempBibleSlidesToAdd.push(createBibleSlideObject(headerText, contentText));
            } else if (mode === "auto") {
                // 글자 수 기준 자동 분할 (80자)
                selectedBibleVerses.forEach(v => {
                    const shortBook = convertToShortBookName(v.book_name);
                    const headerText = `${shortBook} ${v.chapter}:${v.verse}`;

                    // 글자 분할
                    const chunks = splitTextByLength(v.content, 80);
                    chunks.forEach((chunkText, idx) => {
                        const pageSuffix = chunks.length > 1 ? ` (${idx + 1})` : "";
                        tempBibleSlidesToAdd.push(createBibleSlideObject(headerText + pageSuffix, chunkText));
                    });
                });
            }

            if (tempBibleSlidesToAdd.length > 0) {
                // 모달 띄우고 격자 목록 그리기
                targetInsertAfterSlideId = null;
                renderBibleModalSlideGrid();
                document.getElementById("bible-insert-modal").style.display = "flex";
            }
        }

        // 모달 내 슬라이드 리스트 4*X 격자 렌더링
        function renderBibleModalSlideGrid() {
            const grid = document.getElementById("bible-modal-slide-grid");
            if (!grid || !projectData || !projectData.slides) return;

            grid.innerHTML = "";

            projectData.slides.forEach((slide, index) => {
                const div = document.createElement("div");
                div.className = "bible-modal-grid-item";
                div.dataset.slideId = slide.id;

                if (slide.thumbnail) {
                    const img = document.createElement("img");
                    img.src = slide.thumbnail;
                    div.appendChild(img);
                } else {
                    const placeholder = document.createElement("div");
                    placeholder.style.margin = "auto";
                    placeholder.style.color = "var(--text-muted)";
                    placeholder.style.fontSize = "0.75rem";
                    placeholder.textContent = `슬라이드 ${index + 1}`;
                    div.appendChild(placeholder);
                }

                const title = document.createElement("div");
                title.className = "bible-modal-grid-item-title";
                title.textContent = `${index + 1}. ${slide.name || '이름 없음'}`;
                div.appendChild(title);

                div.onclick = () => {
                    const prevSel = grid.querySelector(".bible-modal-grid-item.selected");
                    if (prevSel) {
                        prevSel.classList.remove("selected");
                    }

                    if (targetInsertAfterSlideId === slide.id) {
                        // 동일 슬라이드 한 번 더 클릭 시 선택 해제 (맨 뒤 추가용)
                        targetInsertAfterSlideId = null;
                    } else {
                        div.classList.add("selected");
                        targetInsertAfterSlideId = slide.id;
                    }
                };

                grid.appendChild(div);
            });
        }

        // 모달 최종 확인 처리 (성경 및 찬양 공용)
        function confirmAddBibleSlides() {
            let slidesToSend = [];
            if (tempBibleSlidesToAdd.length > 0) {
                slidesToSend = tempBibleSlidesToAdd;
            } else if (tempPraiseSlidesToAdd.length > 0) {
                slidesToSend = tempPraiseSlidesToAdd;
            }

            if (slidesToSend.length === 0) return;

            // 백엔드로 추가 명령 전송 (삽입 기준 아이디 지정)
            ws.send(JSON.stringify({
                type: "ADD_SLIDES_BULK",
                slides: slidesToSend,
                insertAfterId: targetInsertAfterSlideId
            }));

            // 결과 초기화 피드백
            if (tempBibleSlidesToAdd.length > 0) {
                const container = document.getElementById("bible-results-list");
                if (container) {
                    container.innerHTML = `<div style="color: #10b981; font-size: 0.78rem; text-align: center; margin: auto; padding: 20px 0;">🎉 성공적으로 슬라이드가 추가되었습니다.</div>`;
                }
                selectedBibleVerses = [];
                updateBibleExpectedSlides();
            } else if (tempPraiseSlidesToAdd.length > 0) {
                // 선택 초기화 및 세부 제어창 닫기
                selectedPraiseSongs = [];
                updatePraiseSelectionUI();
                const selectionControl = document.getElementById("praise-selection-control");
                if (selectionControl) {
                    selectionControl.style.display = "none";
                }
                // 검색창 비우기 및 전체 리스트 새로고침
                const searchInput = document.getElementById("input-praise-search");
                if (searchInput) {
                    searchInput.value = "";
                    fetchPraiseSongs("");
                }
                alert("🎉 찬양 슬라이드가 성공적으로 추가되었습니다.");
            }

            // 모달 닫기 및 임시 변수 해제
            document.getElementById("bible-insert-modal").style.display = "none";
            tempBibleSlidesToAdd = [];
            tempPraiseSlidesToAdd = [];
            targetInsertAfterSlideId = null;
        }

        // 글자수 기준 텍스트 분할 알고리즘
        function splitTextByLength(text, maxLen) {
            if (text.length <= maxLen) return [text];

            const words = text.split(" ");
            const chunks = [];
            let current = "";

            words.forEach(word => {
                if ((current + " " + word).trim().length > maxLen) {
                    if (current) chunks.push(current.trim());
                    current = word;
                } else {
                    current = (current + " " + word).trim();
                }
            });
            if (current) chunks.push(current.trim());

            return chunks;
        }

        // 슬라이드 데이터 객체 빌더
        function createBibleSlideObject(header, content) {
            const slideId = "slide_bible_" + Math.random().toString(36).substr(2, 8);

            return {
                id: slideId,
                name: `성경: ${header}`,
                elements: [
                    // 검정 사각형 배경 요소 추가 (전체 화면 꽉 참)
                    {
                        id: "elem_bible_bg_" + Math.random().toString(36).substr(2, 9),
                        type: "rect",
                        content: "",
                        x: 0.0,
                        y: 0.0,
                        width: 100.0,
                        height: 100.0,
                        style: {
                            fillColor: "#000000",
                            strokeColor: "transparent",
                            strokeWidth: 0,
                            cornerRadius: 0,
                            opacity: 1.0
                        }
                    },
                    {
                        id: "elem_bible_h_" + Math.random().toString(36).substr(2, 9),
                        type: "text",
                        content: header,
                        x: 7.2,
                        y: 14.8,
                        width: 85.0,
                        height: 5.0,
                        style: {
                            fontSize: "2.2vw",
                            fontColor: "#ffffff",
                            fontFamily: "Inter",
                            fontWeight: "600",
                            textAlign: "left"
                        }
                    },
                    {
                        id: "elem_bible_c_" + Math.random().toString(36).substr(2, 9),
                        type: "text",
                        content: content,
                        x: 7.2,
                        y: 22.5,
                        width: 85.6,
                        height: 60.0,
                        style: {
                            fontSize: "3.8vw",
                            fontColor: "#ffffff",
                            fontFamily: "Inter",
                            fontWeight: "700",
                            textAlign: "left"
                        }
                    }
                ]
            };
        }

        function deleteSlides(slideIds) {
            if (!projectData || !projectData.slides) return;

            // 1. 서버로 삭제 전송
            ws.send(JSON.stringify({ type: "DELETE_SLIDES", slideIds: slideIds }));

            // 2. 로컬 slides 배열 갱신
            projectData.slides = projectData.slides.filter(s => !slideIds.includes(s.id));

            // 3. 만약 slides가 완전히 비었다면 임시 슬라이드를 하나 가상으로 얹어줍니다.
            if (projectData.slides.length === 0) {
                projectData.slides.push({
                    id: "slide_placeholder",
                    name: "새 슬라이드 1",
                    elements: []
                });
            }

            // 4. 활성 슬라이드가 삭제 대상에 포함되어 있었다면 다른 슬라이드로 포커스 이동
            if (slideIds.includes(activeSlideId)) {
                const nextActiveId = projectData.slides[0].id;
                selectedSlideIds = [nextActiveId];
                selectSlideForEdit(nextActiveId);
            } else {
                selectedSlideIds = selectedSlideIds.filter(id => !slideIds.includes(id));
                if (selectedSlideIds.length === 0 && activeSlideId) {
                    selectedSlideIds = [activeSlideId];
                }
            }

            renderSlides();
        }

        // ==========================================================================
        // Praise Lyrics Integration Feature Logic
        // ==========================================================================
        let tempPraiseSlidesToAdd = [];
        let activeSelectedPraiseSong = null;
        let selectedPraiseSongs = [];
        let currentPraiseSongsList = [];
        let lastSelectedPraiseIndex = -1;
        let currentEditingPraiseSong = null;
        let praiseClipboardData = [];

        function updatePraiseExpectedCount() {
            const previewList = document.getElementById("praise-preview-list");
            const valExpected = document.getElementById("val-praise-expected-slides");
            const chkAllPraise = document.getElementById("chk-select-all-praise");
            if (!previewList || !valExpected) return;

            const checkboxes = previewList.querySelectorAll(".praise-preview-item-chk");
            const checkedCount = Array.from(checkboxes).filter(chk => chk.checked).length;
            valExpected.textContent = checkedCount;

            if (chkAllPraise && checkboxes.length > 0) {
                chkAllPraise.checked = (checkedCount === checkboxes.length);
            }
        }

        function hidePraiseMainViewer() {
            selectedPraiseSongs = [];
            updatePraiseSelectionUI();
        }

        function adjustPraisePanelLayout(isSelected) {
            const overlay = document.getElementById("praise-main-viewer-overlay");
            const selectionControl = document.getElementById("praise-selection-control");

            if (!overlay || !selectionControl) return;

            if (isSelected) {
                selectionControl.style.display = "flex";
                overlay.style.display = "flex";
            } else {
                selectionControl.style.display = "none";
                overlay.style.display = "none";
            }
        }

        function renderPraisePreview(song) {
            const previewList = document.getElementById("praise-preview-list");
            const chkAllPraise = document.getElementById("chk-select-all-praise");
            if (!previewList) return;

            previewList.innerHTML = "";
            if (chkAllPraise) chkAllPraise.checked = true;
            praiseLastClickedIndex = -1;

            if (!song || !song.lyrics) {
                previewList.innerHTML = `<div style="color: var(--text-muted); font-size: 0.7rem; text-align: center; padding: 10px 0;">분해된 가사가 없습니다.</div>`;
                updatePraiseExpectedCount();
                return;
            }

            const blocks = song.lyrics.split(/\n\s*\n/).map(s => s.trim()).filter(s => s !== "");
            if (blocks.length === 0) {
                previewList.innerHTML = `<div style="color: var(--text-muted); font-size: 0.7rem; text-align: center; padding: 10px 0;">분해된 가사가 없습니다.</div>`;
                updatePraiseExpectedCount();
                return;
            }

            blocks.forEach((block, idx) => {
                const itemDiv = document.createElement("div");
                itemDiv.className = "praise-preview-item-div";
                itemDiv.style.display = "flex";
                itemDiv.style.alignItems = "flex-start";
                itemDiv.style.gap = "6px";
                itemDiv.style.padding = "4px 2px";
                itemDiv.style.borderBottom = "1px dashed rgba(255,255,255,0.05)";
                itemDiv.style.cursor = "pointer";

                const chk = document.createElement("input");
                chk.type = "checkbox";
                chk.className = "praise-preview-item-chk";
                chk.style.cursor = "pointer";
                chk.style.marginTop = "2px";
                chk.checked = true;
                chk.dataset.index = idx;

                chk.onclick = (e) => {
                    e.stopPropagation(); // itemDiv.onclick 호출 방지
                    const checkboxes = previewList.querySelectorAll(".praise-preview-item-chk");

                    if (e.shiftKey && praiseLastClickedIndex !== -1) {
                        const start = Math.min(praiseLastClickedIndex, idx);
                        const end = Math.max(praiseLastClickedIndex, idx);
                        const baseChecked = chk.checked;

                        for (let k = start; k <= end; k++) {
                            checkboxes[k].checked = baseChecked;
                        }
                    } else {
                        praiseLastClickedIndex = idx;
                    }
                    updatePraiseExpectedCount();
                };

                const span = document.createElement("span");
                span.style.color = "var(--text-main)";
                span.style.wordBreak = "break-all";
                span.style.lineHeight = "1.2";

                // 가사 내용 줄바꿈 표현 지원 ( [1장] 표시 제거 )
                const escapedText = block.replace(/\n/g, "<br>");
                span.innerHTML = escapedText;

                itemDiv.onclick = (e) => {
                    const checkboxes = previewList.querySelectorAll(".praise-preview-item-chk");

                    if (e.shiftKey && praiseLastClickedIndex !== -1) {
                        const start = Math.min(praiseLastClickedIndex, idx);
                        const end = Math.max(praiseLastClickedIndex, idx);
                        const baseChecked = !chk.checked; // 토글될 값 기준

                        for (let k = start; k <= end; k++) {
                            checkboxes[k].checked = baseChecked;
                        }
                    } else {
                        chk.checked = !chk.checked;
                        praiseLastClickedIndex = idx;
                    }
                    updatePraiseExpectedCount();
                };

                itemDiv.appendChild(chk);
                itemDiv.appendChild(span);
                previewList.appendChild(itemDiv);
            });

            updatePraiseExpectedCount();
        }

        // 찬양곡 선택 UI 상태 동기화
        function updatePraiseSelectionUI() {
            const songsList = document.getElementById("praise-songs-list");
            const lblTitle = document.getElementById("lbl-selected-praise-title");
            const charCount = document.getElementById("val-praise-char-count");

            if (songsList) {
                const items = songsList.querySelectorAll(".bible-result-item");
                items.forEach((item) => {
                    const songTitle = item.dataset.title;
                    const isSel = selectedPraiseSongs.some(s => s.title === songTitle);
                    if (isSel) {
                        item.classList.add("selected");
                    } else {
                        item.classList.remove("selected");
                    }
                });
            }

            if (selectedPraiseSongs.length === 0) {
                activeSelectedPraiseSong = null;
                if (lblTitle) lblTitle.textContent = "없음";
                adjustPraisePanelLayout(false);
            } else if (selectedPraiseSongs.length === 1) {
                const s = selectedPraiseSongs[0];
                activeSelectedPraiseSong = s;
                const songMood = (s.moods && s.moods[0]) || s.mood || "기본/일반";
                const badgeStyle = typeof getMoodBadgeStyle === "function" ? getMoodBadgeStyle(songMood) : "background: rgba(148, 163, 184, 0.2); color: #94a3b8;";
                if (lblTitle) {
                    lblTitle.innerHTML = `${s.title} <span style="font-size: 0.68rem; font-weight: 600; padding: 2px 7px; border-radius: 10px; ${badgeStyle} margin-left: 6px; display: inline-block;">#${songMood}</span>`;
                }
                if (charCount) charCount.textContent = s.lyrics.length;
                adjustPraisePanelLayout(true);
                renderPraisePreview(s);
            } else {
                activeSelectedPraiseSong = selectedPraiseSongs[0];
                if (lblTitle) lblTitle.textContent = `${selectedPraiseSongs[0].title} 외 ${selectedPraiseSongs.length - 1}건 (총 ${selectedPraiseSongs.length}곡)`;
                if (charCount) charCount.textContent = selectedPraiseSongs.reduce((sum, s) => sum + s.lyrics.length, 0);
                adjustPraisePanelLayout(true);
                renderPraisePreview(selectedPraiseSongs[0]);
            }
        }

        // 찬양 수정 모달 열기
        function openEditPraiseModal(song) {
            if (!song) return;
            currentEditingPraiseSong = song;
            const addModal = document.getElementById("praise-add-modal");
            const headerTitle = document.getElementById("modal-praise-header-title");
            const inputTitle = document.getElementById("modal-praise-title");
            const inputLyrics = document.getElementById("modal-praise-lyrics");

            if (headerTitle) headerTitle.textContent = "🎵 찬양곡 수정";
            if (inputTitle) inputTitle.value = song.title;
            if (inputLyrics) inputLyrics.value = song.lyrics;

            const moodChipsContainer = document.getElementById("modal-praise-mood-chips");
            if (moodChipsContainer) {
                const targetMood = (song.moods && song.moods[0]) || song.mood || "경배/찬양";
                const chips = moodChipsContainer.querySelectorAll(".mood-chip");
                chips.forEach(chip => {
                    const m = chip.getAttribute("data-mood");
                    if (m === targetMood) {
                        chip.classList.add("active");
                        chip.style.background = "var(--primary)";
                        chip.style.borderColor = "var(--primary)";
                        chip.style.color = "#ffffff";
                    } else {
                        chip.classList.remove("active");
                        chip.style.background = "rgba(255,255,255,0.05)";
                        chip.style.borderColor = "var(--panel-border)";
                        chip.style.color = "#cbd5e1";
                    }
                });
            }

            if (addModal) addModal.style.display = "flex";
        }

        // 찬양 추가 모달 열기 (신규 등록)
        function openAddPraiseModal() {
            currentEditingPraiseSong = null;
            const addModal = document.getElementById("praise-add-modal");
            const headerTitle = document.getElementById("modal-praise-header-title");
            const inputTitle = document.getElementById("modal-praise-title");
            const inputLyrics = document.getElementById("modal-praise-lyrics");

            if (headerTitle) headerTitle.textContent = "🎵 신규 찬양곡 등록 및 가사 입력";
            if (inputTitle) inputTitle.value = "";
            if (inputLyrics) inputLyrics.value = "";

            const moodChipsContainer = document.getElementById("modal-praise-mood-chips");
            if (moodChipsContainer) {
                const chips = moodChipsContainer.querySelectorAll(".mood-chip");
                chips.forEach((chip, idx) => {
                    if (idx === 0) {
                        chip.classList.add("active");
                        chip.style.background = "var(--primary)";
                        chip.style.borderColor = "var(--primary)";
                        chip.style.color = "#ffffff";
                    } else {
                        chip.classList.remove("active");
                        chip.style.background = "rgba(255,255,255,0.05)";
                        chip.style.borderColor = "var(--panel-border)";
                        chip.style.color = "#cbd5e1";
                    }
                });
            }

            if (addModal) addModal.style.display = "flex";
        }

        // 선택된 찬양곡 삭제 처리
        async function deleteSelectedPraiseSongsWithConfirm(confirmRequired = true) {
            if (selectedPraiseSongs.length === 0) return;

            if (confirmRequired) {
                const titlesStr = selectedPraiseSongs.map(s => s.title).slice(0, 3).join(", ") + (selectedPraiseSongs.length > 3 ? ` 외 ${selectedPraiseSongs.length - 3}건` : "");
                if (!confirm(`선택한 찬양곡 (${selectedPraiseSongs.length}개: ${titlesStr})을 삭제하시겠습니까?`)) {
                    return;
                }
            }

            const ids = selectedPraiseSongs.filter(s => s.id).map(s => s.id);
            const titles = selectedPraiseSongs.map(s => s.title);
            const reqBody = ids.length > 0 ? { ids, titles } : { titles };

            try {
                const response = await fetch("/api/praise/delete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(reqBody)
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.detail || "삭제 실패");
                }

                selectedPraiseSongs = [];
                const searchInput = document.getElementById("input-praise-search");
                fetchPraiseSongs(searchInput ? searchInput.value : "");
            } catch (err) {
                alert("찬양 삭제 오류: " + err.message);
            }
        }

        // 복사 (Ctrl+C)
        function copySelectedPraiseSongs() {
            if (selectedPraiseSongs.length === 0) return;
            praiseClipboardData = JSON.parse(JSON.stringify(selectedPraiseSongs));
            try {
                navigator.clipboard.writeText(JSON.stringify({
                    subcastType: "praiseSongs",
                    data: praiseClipboardData
                }));
            } catch (err) {
                console.error("클립보드 저장 실패:", err);
            }
        }

        // 잘라내기 (Ctrl+X)
        function cutSelectedPraiseSongs() {
            if (selectedPraiseSongs.length === 0) return;
            copySelectedPraiseSongs();
            deleteSelectedPraiseSongsWithConfirm(false);
        }

        // 붙여넣기 (Ctrl+V)
        async function pastePraiseSongs() {
            let itemsToPaste = praiseClipboardData;
            try {
                const clipText = await navigator.clipboard.readText();
                if (clipText) {
                    const parsed = JSON.parse(clipText);
                    if (parsed && parsed.subcastType === "praiseSongs" && Array.isArray(parsed.data)) {
                        itemsToPaste = parsed.data;
                    }
                }
            } catch (e) {
                // 클립보드 읽기 실패 시 내부 메모리 사용
            }

            if (!itemsToPaste || itemsToPaste.length === 0) {
                return;
            }

            let successCount = 0;
            for (const song of itemsToPaste) {
                const newTitle = song.title + " (복사본)";
                try {
                    const resp = await fetch("/api/praise/save", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ title: newTitle, lyrics: song.lyrics })
                    });
                    if (resp.ok) successCount++;
                } catch (err) {
                    console.error("붙여넣기 저장 오류:", err);
                }
            }

            if (successCount > 0) {
                const searchInput = document.getElementById("input-praise-search");
                fetchPraiseSongs(searchInput ? searchInput.value : "");
            }
        }

        function initPraiseFeature() {
            const searchInput = document.getElementById("input-praise-search");
            const songsList = document.getElementById("praise-songs-list");
            const openAddModalBtn = document.getElementById("btn-praise-open-add-modal");
            const addSlidesBtn = document.getElementById("btn-add-praise-slides");

            const addModal = document.getElementById("praise-add-modal");
            const modalCloseBtn = document.getElementById("btn-praise-modal-close");
            const modalCancelBtn = document.getElementById("btn-praise-modal-cancel");
            const modalSaveBtn = document.getElementById("btn-praise-modal-save");

            const btnEditSelected = document.getElementById("btn-praise-edit-selected");
            const btnDeleteSelected = document.getElementById("btn-praise-delete-selected");

            const chkAllPraise = document.getElementById("chk-select-all-praise");
            const previewList = document.getElementById("praise-preview-list");

            const btnCloseViewer = document.getElementById("btn-close-praise-viewer");
            if (btnCloseViewer) {
                btnCloseViewer.onclick = hidePraiseMainViewer;
            }

            const filterChips = document.querySelectorAll(".praise-filter-chip");
            filterChips.forEach(chip => {
                chip.onclick = () => {
                    filterChips.forEach(c => {
                        c.classList.remove("active");
                        c.style.background = "rgba(255,255,255,0.05)";
                        c.style.borderColor = "var(--panel-border)";
                        c.style.color = "#cbd5e1";
                    });
                    chip.classList.add("active");
                    chip.style.background = "var(--primary)";
                    chip.style.borderColor = "var(--primary)";
                    chip.style.color = "#ffffff";

                    const filterVal = chip.getAttribute("data-filter");
                    if (filterVal === "all") {
                        if (searchInput) searchInput.value = "";
                        fetchPraiseSongs("");
                    } else {
                        if (searchInput) searchInput.value = filterVal;
                        fetchPraiseSongs(filterVal);
                    }
                };
            });

            const moodChipsContainer = document.getElementById("modal-praise-mood-chips");
            if (moodChipsContainer) {
                const chips = moodChipsContainer.querySelectorAll(".mood-chip");
                chips.forEach(chip => {
                    chip.onclick = () => {
                        chips.forEach(c => {
                            c.classList.remove("active");
                            c.style.background = "rgba(255,255,255,0.05)";
                            c.style.borderColor = "var(--panel-border)";
                            c.style.color = "#cbd5e1";
                        });
                        chip.classList.add("active");
                        chip.style.background = "var(--primary)";
                        chip.style.borderColor = "var(--primary)";
                        chip.style.color = "#ffffff";
                    };
                });
            }

            if (chkAllPraise && previewList) {
                chkAllPraise.onchange = (e) => {
                    const checkboxes = previewList.querySelectorAll(".praise-preview-item-chk");
                    checkboxes.forEach(chk => {
                        chk.checked = e.target.checked;
                    });
                    updatePraiseExpectedCount();
                };
            }

            // 디자인 컨트롤러 요소들
            const presetSelect = document.getElementById("select-praise-design-preset");
            const customPanel = document.getElementById("praise-custom-style-panel");
            const fontColorInput = document.getElementById("input-praise-font-color");
            const fontSizeInput = document.getElementById("input-praise-font-size");
            const fontSizeVal = document.getElementById("lbl-praise-font-size-val");
            const textAlignSelect = document.getElementById("select-praise-text-align");
            const positionSelect = document.getElementById("select-praise-position");
            const bgTypeSelect = document.getElementById("select-praise-bg-type");

            if (!searchInput || !songsList || !openAddModalBtn || !addSlidesBtn || !addModal) return;

            // 1) 최초 로드 시 DB 내 전체 찬양 목록 렌더링
            fetchPraiseSongs("");

            // 찬양 데이터 내보내기/가져오기 이벤트 바인딩
            const btnPraiseExport = document.getElementById("btn-praise-export");

            const exportPraiseAction = (idsArray) => {
                if (idsArray && idsArray.length > 0) {
                    window.location.href = `/api/praise/export?ids=${idsArray.join(",")}`;
                } else {
                    window.location.href = "/api/praise/export";
                }
            };

            if (btnPraiseExport) {
                btnPraiseExport.onclick = () => {
                    if (selectedPraiseSongs && selectedPraiseSongs.length > 0) {
                        const selectedIds = selectedPraiseSongs.map(s => s.id);
                        exportPraiseAction(selectedIds);
                    } else {
                        exportPraiseAction();
                    }
                };
            }

            const btnPraiseImport = document.getElementById("btn-praise-import");
            const fileImportPraise = document.getElementById("file-import-praise");
            if (btnPraiseImport && fileImportPraise) {
                btnPraiseImport.onclick = () => {
                    fileImportPraise.value = "";
                    fileImportPraise.click();
                };
                fileImportPraise.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;

                    const formData = new FormData();
                    formData.append("file", file);

                    try {
                        const res = await fetch("/api/praise/import", {
                            method: "POST",
                            body: formData
                        });
                        if (!res.ok) {
                            const errData = await res.json();
                            throw new Error(errData.detail || "찬양 가져오기 실패");
                        }
                        const data = await res.json();
                        alert(`성공적으로 ${data.imported_count || 0}곡의 찬양 데이터를 가져왔습니다.`);
                        fetchPraiseSongs(searchInput ? searchInput.value : "");
                    } catch (err) {
                        alert("찬양 데이터 가져오기 오류: " + err.message);
                    }
                };
            }

            // 2) 실시간 검색어 입력 시 목록 필터링
            searchInput.oninput = (e) => {
                fetchPraiseSongs(e.target.value);
            };

            // 3) 모달 열기/닫기 제어
            const closeAddModal = () => {
                addModal.style.display = "none";
                document.getElementById("modal-praise-title").value = "";
                document.getElementById("modal-praise-lyrics").value = "";
                currentEditingPraiseSong = null;
            };

            openAddModalBtn.onclick = openAddPraiseModal;
            if (modalCloseBtn) modalCloseBtn.onclick = closeAddModal;
            if (modalCancelBtn) modalCancelBtn.onclick = closeAddModal;

            if (btnEditSelected) {
                btnEditSelected.onclick = () => {
                    if (selectedPraiseSongs.length === 1) {
                        openEditPraiseModal(selectedPraiseSongs[0]);
                    } else if (selectedPraiseSongs.length > 1) {
                        alert("한 번에 하나의 찬양곡만 수정할 수 있습니다.");
                    }
                };
            }

            if (btnDeleteSelected) {
                btnDeleteSelected.onclick = () => {
                    deleteSelectedPraiseSongsWithConfirm();
                };
            }

            // 우클릭 컨텍스트 메뉴 이벤트 연결
            const menuEdit = document.getElementById("menu-praise-edit");
            const menuCopy = document.getElementById("menu-praise-copy");
            const menuCut = document.getElementById("menu-praise-cut");
            const menuPaste = document.getElementById("menu-praise-paste");
            const menuDelete = document.getElementById("menu-praise-delete");

            if (menuEdit) {
                menuEdit.onclick = () => {
                    hidePraiseContextMenu();
                    if (selectedPraiseSongs.length === 1) {
                        openEditPraiseModal(selectedPraiseSongs[0]);
                    }
                };
            }
            if (menuCopy) {
                menuCopy.onclick = () => {
                    hidePraiseContextMenu();
                    copySelectedPraiseSongs();
                };
            }
            if (menuCut) {
                menuCut.onclick = () => {
                    hidePraiseContextMenu();
                    cutSelectedPraiseSongs();
                };
            }
            if (menuPaste) {
                menuPaste.onclick = () => {
                    hidePraiseContextMenu();
                    pastePraiseSongs();
                };
            }
            if (menuDelete) {
                menuDelete.onclick = () => {
                    hidePraiseContextMenu();
                    deleteSelectedPraiseSongsWithConfirm();
                };
            }

            // 4) 모달 내 찬양 DB 신규 저장/수정
            if (modalSaveBtn) {
                modalSaveBtn.onclick = async () => {
                    const title = document.getElementById("modal-praise-title").value.trim();
                    const lyrics = document.getElementById("modal-praise-lyrics").value.trim();

                    if (!title || !lyrics) {
                        alert("제목과 가사를 모두 작성해 주세요.");
                        return;
                    }

                    modalSaveBtn.disabled = true;
                    modalSaveBtn.textContent = "⏳ 저장 중...";

                    let selectedMood = "경배/찬양";
                    const moodChipsContainer = document.getElementById("modal-praise-mood-chips");
                    if (moodChipsContainer) {
                        const activeChip = moodChipsContainer.querySelector(".mood-chip.active");
                        if (activeChip) {
                            const m = activeChip.getAttribute("data-mood");
                            if (m) selectedMood = m;
                        }
                    }

                    const savePayload = { title, lyrics, mood: selectedMood, moods: [selectedMood] };
                    if (currentEditingPraiseSong) {
                        if (currentEditingPraiseSong.id) {
                            savePayload.id = currentEditingPraiseSong.id;
                        }
                        savePayload.original_title = currentEditingPraiseSong.title;
                    }

                    try {
                        const response = await fetch("/api/praise/save", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(savePayload)
                        });

                        if (!response.ok) {
                            const err = await response.json();
                            throw new Error(err.detail || "저장 실패");
                        }

                        alert("찬양이 성공적으로 저장/업데이트 되었습니다.");
                        closeAddModal();
                        fetchPraiseSongs(searchInput.value); // 목록 새로고침
                    } catch (err) {
                        alert("오류 발생: " + err.message);
                    } finally {
                        modalSaveBtn.disabled = false;
                        modalSaveBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M12,10a4,4,0,1,0,4,4A4,4,0,0,0,12,10Zm0,6a2,2,0,1,1,2-2A2,2,0,0,1,12,16Z"/><path d="M22.536,4.122,19.878,1.464A4.966,4.966,0,0,0,16.343,0H5A5.006,5.006,0,0,0,0,5V19a5.006,5.006,0,0,0,5,5H19a5.006,5.006,0,0,0,5-5V7.657A4.966,4.966,0,0,0,22.536,4.122ZM17,2.08V3a3,3,0,0,1-3,3H10A3,3,0,0,1,7,3V2h9.343A2.953,2.953,0,0,1,17,2.08ZM22,19a3,3,0,0,1-3,3H5a3,3,0,0,1-3-3V5A3,3,0,0,1,5,2V3a5.006,5.006,0,0,0,5,5h4a4.991,4.991,0,0,0,4.962-4.624l2.16,2.16A3.02,3.02,0,0,1,22,7.657Z"/></svg> DB에 저장';
                    }
                };
            }

            // 곡 분위기에 맞는 고정 현장 배경 1개 매칭 헬퍼 함수
            function matchStageBgForSong(songMood) {
                const bgList = (projectData && projectData.settings && projectData.settings.stageBgLibrary && projectData.settings.stageBgLibrary.length > 0)
                    ? projectData.settings.stageBgLibrary
                    : (allStageBgFiles || []);

                if (!bgList || bgList.length === 0) return null;

                const targetMood = songMood ? songMood.trim() : "기본/일반";

                // 1차: 태그가 일치하는 배경 후보
                const matchingCandidates = bgList.filter(bg => {
                    const bgMood = bg.mood || bg.tag;
                    const bgMoods = bg.moods || (bgMood ? [bgMood] : []);
                    return bgMood === targetMood || bgMoods.includes(targetMood);
                });

                let chosenBg = null;
                if (matchingCandidates.length > 0) {
                    chosenBg = matchingCandidates[Math.floor(Math.random() * matchingCandidates.length)];
                } else {
                    // 2차: 기본/일반 후보
                    const defaultCandidates = bgList.filter(bg =>
                        bg.isDefault || bg.is_default || bg.mood === "기본/일반" || (bg.moods && bg.moods.includes("기본/일반"))
                    );
                    if (defaultCandidates.length > 0) {
                        chosenBg = defaultCandidates[Math.floor(Math.random() * defaultCandidates.length)];
                    } else {
                        // 3차: 라이브러리 내 전체 배경 중 하나
                        chosenBg = bgList[Math.floor(Math.random() * bgList.length)];
                    }
                }

                return chosenBg ? (chosenBg.id || chosenBg.name) : null;
            }

            // === 슬라이드 현장 배경 직접 지정 모달 제어 ===
            let activeTargetSlideForBgModal = null;

            function showSlideBgSelectModal(slide) {
                if (!slide) return;
                activeTargetSlideForBgModal = slide;

                const modal = document.getElementById("slide-bg-select-modal");
                if (!modal) return;

                const searchInput = document.getElementById("input-slide-bg-modal-search");
                if (searchInput) searchInput.value = "";

                const filterChips = document.querySelectorAll(".slide-bg-modal-chip");
                filterChips.forEach(chip => {
                    const isAll = chip.getAttribute("data-filter") === "all";
                    chip.classList.toggle("active", isAll);
                    if (isAll) {
                        chip.style.background = "var(--primary)";
                        chip.style.borderColor = "var(--primary)";
                        chip.style.color = "#ffffff";
                    } else {
                        chip.style.background = "rgba(255,255,255,0.05)";
                        chip.style.borderColor = "var(--panel-border)";
                        chip.style.color = "#cbd5e1";
                    }
                });

                const chkApplyAll = document.getElementById("chk-slide-bg-modal-apply-all-song");
                if (chkApplyAll) {
                    const isPraise = Boolean(slide.praiseGroupId || slide.songTitle);
                    chkApplyAll.checked = isPraise;
                    chkApplyAll.disabled = !isPraise;
                    const label = chkApplyAll.nextElementSibling;
                    if (label) {
                        label.textContent = isPraise
                            ? `🎵 해당 찬양 곡 [${slide.songTitle || slide.name}] 전체 슬라이드에 일괄 적용`
                            : "🎵 단일 일반 슬라이드 (곡 일괄 적용 불가)";
                    }
                }

                renderSlideBgModalGrid();
                modal.style.display = "flex";
            }

            function renderSlideBgModalGrid() {
                const container = document.getElementById("slide-bg-modal-grid-container");
                if (!container) return;

                const searchInput = document.getElementById("input-slide-bg-modal-search");
                const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

                const activeChip = document.querySelector(".slide-bg-modal-chip.active");
                const filterVal = activeChip ? activeChip.getAttribute("data-filter") : "all";

                const bgList = (projectData && projectData.settings && projectData.settings.stageBgLibrary && projectData.settings.stageBgLibrary.length > 0)
                    ? projectData.settings.stageBgLibrary
                    : (allStageBgFiles || []);

                let filtered = bgList.filter(bg => {
                    const nameMatch = !query || bg.name.toLowerCase().includes(query);
                    if (!nameMatch) return false;

                    if (filterVal === "all") return true;

                    const bgMood = bg.mood || bg.tag;
                    const bgMoods = bg.moods || (bgMood ? [bgMood] : []);
                    return bgMood === filterVal || bgMoods.includes(filterVal);
                });

                const currentOverrideId = activeTargetSlideForBgModal ? activeTargetSlideForBgModal.overrideBgId : null;

                let html = "";
                filtered.forEach(f => {
                    const filenameWOExt = f.name.substring(0, f.name.lastIndexOf('.'));
                    const isYt = filenameWOExt.length === 11 && !f.name.startsWith('upload_');
                    const thumbUrl = f.thumbnailUrl || (isYt ? `https://img.youtube.com/vi/${filenameWOExt}/hqdefault.jpg` : '');
                    const isSelected = currentOverrideId && (f.id === currentOverrideId || f.name === currentOverrideId);
                    const safeName = f.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                    const moodsList = f.moods || [];
                    const moodChipsHtml = moodsList.map(m => `<span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 0.62rem; padding: 1px 5px; border-radius: 8px;">#${m}</span>`).join(' ');

                    const borderStyle = isSelected ? '2px solid #38bdf8' : '1px solid var(--panel-border)';
                    const bgStyle = isSelected ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255,255,255,0.03)';

                    html += `
                        <div class="slide-bg-modal-item-card" data-id="${f.id || f.name}"
                            style="background: ${bgStyle}; border: ${borderStyle}; border-radius: 8px; padding: 8px; cursor: pointer; display: flex; flex-direction: column; gap: 6px; transition: all 0.15s; position: relative;">
                            ${isSelected ? `<span style="position: absolute; top: 6px; right: 6px; background: #0284c7; color: #fff; font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; z-index: 5;">✓ 지정됨</span>` : ''}
                            <div style="width: 100%; aspect-ratio: 16/9; background: #0f172a; border-radius: 4px; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                                ${thumbUrl ? `<img src="${thumbUrl}" style="width: 100%; height: 100%; object-fit: cover;">` : `<div style="color: #60a5fa; font-size: 1.5rem;">🎬</div>`}
                            </div>
                            <div style="font-size: 0.78rem; font-weight: 600; color: #fff; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" title="${safeName}">
                                ${safeName}
                            </div>
                            <div style="display: flex; flex-wrap: wrap; gap: 3px;">
                                ${moodChipsHtml || '<span style="color: var(--text-muted); font-size: 0.65rem;">태그 없음</span>'}
                            </div>
                        </div>
                    `;
                });

                if (filtered.length === 0) {
                    html = `<div style="grid-column: 1 / -1; padding: 30px; text-align: center; color: var(--text-muted); font-size: 0.82rem;">🔍 검색된 현장 배경이 없습니다.</div>`;
                }

                container.innerHTML = html;

                const cards = container.querySelectorAll(".slide-bg-modal-item-card");
                cards.forEach(card => {
                    card.onclick = () => {
                        const chosenBgId = card.getAttribute("data-id");
                        applySelectedBgToSlide(chosenBgId);
                    };
                });
            }

            function applySelectedBgToSlide(bgId) {
                if (!activeTargetSlideForBgModal || !projectData || !projectData.slides) return;

                const chkApplyAll = document.getElementById("chk-slide-bg-modal-apply-all-song");
                const applyAll = chkApplyAll ? chkApplyAll.checked : false;

                if (applyAll) {
                    const targetGroupId = activeTargetSlideForBgModal.praiseGroupId;
                    const targetSongTitle = activeTargetSlideForBgModal.songTitle;

                    projectData.slides.forEach(s => {
                        let isTarget = false;
                        if (targetGroupId && s.praiseGroupId === targetGroupId) {
                            isTarget = true;
                        } else if (!targetGroupId && targetSongTitle && s.songTitle === targetSongTitle) {
                            isTarget = true;
                        }

                        if (isTarget) {
                            s.overrideBgId = bgId;
                        }
                    });
                } else {
                    activeTargetSlideForBgModal.overrideBgId = bgId;
                }

                triggerAutoSave();
                renderSlides();

                const modal = document.getElementById("slide-bg-select-modal");
                if (modal) modal.style.display = "none";
            }

            function bindSlideBgModalEvents() {
                const modal = document.getElementById("slide-bg-select-modal");
                if (!modal) return;

                const closeBtn = document.getElementById("btn-slide-bg-modal-close");
                const cancelBtn = document.getElementById("btn-slide-bg-modal-cancel");
                const clearBtn = document.getElementById("btn-slide-bg-modal-clear-override");
                const searchInput = document.getElementById("input-slide-bg-modal-search");

                const closeModal = () => {
                    modal.style.display = "none";
                    activeTargetSlideForBgModal = null;
                };

                if (closeBtn) closeBtn.onclick = closeModal;
                if (cancelBtn) cancelBtn.onclick = closeModal;

                if (clearBtn) {
                    clearBtn.onclick = () => {
                        if (!confirm("이 슬라이드(또는 곡)의 고정 배경을 해제하고 자동 분위기 매칭으로 초기화하시겠습니까?")) return;
                        applySelectedBgToSlide(null);
                    };
                }

                if (searchInput) {
                    searchInput.oninput = () => {
                        renderSlideBgModalGrid();
                    };
                }

                const filterChips = document.querySelectorAll(".slide-bg-modal-chip");
                filterChips.forEach(chip => {
                    chip.onclick = () => {
                        filterChips.forEach(c => {
                            c.classList.remove("active");
                            c.style.background = "rgba(255,255,255,0.05)";
                            c.style.borderColor = "var(--panel-border)";
                            c.style.color = "#cbd5e1";
                        });
                        chip.classList.add("active");
                        chip.style.background = "var(--primary)";
                        chip.style.borderColor = "var(--primary)";
                        chip.style.color = "#ffffff";
                        renderSlideBgModalGrid();
                    };
                });
            }

            window.matchStageBgForSong = matchStageBgForSong;
            window.showSlideBgSelectModal = showSlideBgSelectModal;
            window.renderSlideBgModalGrid = renderSlideBgModalGrid;
            window.applySelectedBgToSlide = applySelectedBgToSlide;
            window.bindSlideBgModalEvents = bindSlideBgModalEvents;

            // 5) 디자인 프리셋 선택 반응형 이벤트 리스너
            const fontOpacityInput = document.getElementById("input-praise-font-opacity");
            const fontOpacityVal = document.getElementById("input-praise-font-opacity-val");

            if (presetSelect && customPanel) {
                // 최초 1회 동기화 실행
                syncPresetValues(presetSelect.value);

                presetSelect.onchange = (e) => {
                    syncPresetValues(e.target.value);
                };

                function updatePraiseTemplateOptions() {
                    const selectTpl = document.getElementById("select-praise-user-template");
                    if (!selectTpl || !projectData) return;
                    selectTpl.innerHTML = "";
                    if (!projectData.templates || projectData.templates.length === 0) {
                        const opt = document.createElement("option");
                        opt.value = "";
                        opt.textContent = "(등록된 템플릿 없음)";
                        selectTpl.appendChild(opt);
                        const selectBox = document.getElementById("select-praise-target-textbox");
                        if (selectBox) selectBox.innerHTML = "";
                        const container = document.getElementById("praise-textbox-select-container");
                        if (container) container.style.display = "none";
                        return;
                    }
                    projectData.templates.forEach(t => {
                        const opt = document.createElement("option");
                        opt.value = t.id;
                        opt.textContent = t.name;
                        selectTpl.appendChild(opt);
                    });

                    // 첫 템플릿 기준으로 텍스트 상자 옵션 로드
                    const firstTpl = projectData.templates[0];
                    updatePraiseTextboxOptions(firstTpl);
                }

                function updatePraiseTextboxOptions(targetTemplate) {
                    const selectBox = document.getElementById("select-praise-target-textbox");
                    const container = document.getElementById("praise-textbox-select-container");
                    if (!selectBox || !container) return;

                    const textElements = targetTemplate.elements.filter(el => el.type === "text");

                    if (textElements.length === 0) {
                        alert("선택한 디자인 템플릿에 자막 텍스트를 대입할 수 있는 텍스트 상자가 존재하지 않습니다. 다른 템플릿을 선택해 주세요.");
                        container.style.display = "none";
                        selectBox.innerHTML = "";
                        return;
                    }

                    if (textElements.length === 1) {
                        container.style.display = "none";
                        const locName = getGeometricLocationName(textElements[0].x, textElements[0].y);
                        selectBox.innerHTML = `<option value="${textElements[0].id}">${textElements[0].content || "텍스트 영역 1"} [${locName}] (${textElements[0].id})</option>`;
                    } else {
                        container.style.display = "flex";
                        selectBox.innerHTML = "";
                        textElements.forEach((el, index) => {
                            const previewText = el.content ? el.content.substring(0, 15) : `텍스트 영역 ${index + 1}`;
                            const locName = getGeometricLocationName(el.x, el.y);
                            const opt = document.createElement("option");
                            opt.value = el.id;
                            opt.textContent = `[텍스트 영역 ${index + 1}] [${locName}] ${previewText} (${el.id})`;
                            selectBox.appendChild(opt);
                        });
                    }
                }

                const selectTpl = document.getElementById("select-praise-user-template");
                if (selectTpl) {
                    selectTpl.onchange = (e) => {
                        const tplId = e.target.value;
                        const targetTpl = projectData && projectData.templates ? projectData.templates.find(t => t.id === tplId) : null;
                        if (targetTpl) {
                            updatePraiseTextboxOptions(targetTpl);
                        }
                    };
                }

                function syncPresetValues(preset) {
                    const tplContainer = document.getElementById("praise-template-select-container");
                    const boxContainer = document.getElementById("praise-textbox-select-container");

                    if (tplContainer) {
                        tplContainer.style.display = (preset === "template") ? "flex" : "none";
                    }
                    if (boxContainer && preset !== "template") {
                        boxContainer.style.display = "none";
                    }

                    if (preset === "template") {
                        customPanel.style.display = "none";
                        updatePraiseTemplateOptions();
                    } else if (preset === "custom") {
                        customPanel.style.display = "flex";
                        // 커스텀 상태일 때는 모든 제어 폼 활성화
                        fontColorInput.disabled = false;
                        if (fontOpacityInput) fontOpacityInput.disabled = false;
                        fontSizeInput.disabled = false;
                        textAlignSelect.disabled = false;
                        positionSelect.disabled = false;
                        bgTypeSelect.disabled = false;
                    } else {
                        customPanel.style.display = "none";
                        if (preset === "type-a") {
                            // 타입 A: 하단 좌측형, 투명배경, 흰색글자
                            fontColorInput.value = "#ffffff";
                            if (fontOpacityInput) fontOpacityInput.value = "100";
                            fontSizeInput.value = "3.5";
                            textAlignSelect.value = "left";
                            positionSelect.value = "bottom";
                            bgTypeSelect.value = "transparent";
                        } else if (preset === "type-b") {
                            // 타입 B: 상단 중앙형, 투명배경, 차콜글자
                            fontColorInput.value = "#222222";
                            if (fontOpacityInput) fontOpacityInput.value = "100";
                            fontSizeInput.value = "3.5";
                            textAlignSelect.value = "center";
                            positionSelect.value = "top";
                            bgTypeSelect.value = "transparent";
                        } else if (preset === "type-black") {
                            // 블랙 채우기: 중앙 정렬, 검은배경, 흰색글자
                            fontColorInput.value = "#ffffff";
                            if (fontOpacityInput) fontOpacityInput.value = "100";
                            fontSizeInput.value = "3.5";
                            textAlignSelect.value = "center";
                            positionSelect.value = "middle";
                            bgTypeSelect.value = "black";
                        }
                        if (fontSizeVal) fontSizeVal.textContent = fontSizeInput.value;
                        if (fontOpacityInput && fontOpacityVal) fontOpacityVal.textContent = fontOpacityInput.value + "%";
                    }
                }
            }

            // 글자 크기 슬라이더 밸류 동적 라벨 표시
            if (fontSizeInput && fontSizeVal) {
                fontSizeInput.oninput = (e) => {
                    fontSizeVal.textContent = e.target.value;
                };
            }

            // 글자 투명도 슬라이더 밸류 동적 라벨 표시
            if (fontOpacityInput && fontOpacityVal) {
                fontOpacityInput.oninput = (e) => {
                    fontOpacityVal.textContent = e.target.value + "%";
                };
            }

            // 6) 슬라이드 추가 모달 오픈 연동 (수정된 디자인 옵션 주입)
            addSlidesBtn.onclick = () => {
                if (!activeSelectedPraiseSong) return;

                const title = activeSelectedPraiseSong.title;
                const lyrics = activeSelectedPraiseSong.lyrics;
                const blocks = lyrics.split(/\n\s*\n/).map(s => s.trim()).filter(s => s !== "");

                // 선택된 슬라이드 인덱스 추출
                const previewChks = document.querySelectorAll(".praise-preview-item-chk");
                const checkedIndices = Array.from(previewChks)
                    .filter(chk => chk.checked)
                    .map(chk => parseInt(chk.dataset.index));

                if (checkedIndices.length === 0) {
                    alert("추가할 슬라이드를 선택해 주세요.");
                    return;
                }

                tempPraiseSlidesToAdd = [];

                const songMood = activeSelectedPraiseSong.mood || (activeSelectedPraiseSong.moods && activeSelectedPraiseSong.moods[0]) || "경배/찬양";
                const fixedBgId = matchStageBgForSong(songMood);
                const praiseGroupId = "praise_grp_" + Math.random().toString(36).substr(2, 9);

                if (presetSelect && presetSelect.value === "template") {
                    const selectTpl = document.getElementById("select-praise-user-template");
                    const tplId = selectTpl ? selectTpl.value : "";
                    const targetTpl = projectData && projectData.templates ? projectData.templates.find(t => t.id === tplId) : null;

                    if (!targetTpl) {
                        alert("적용할 디자인 템플릿을 선택하거나 먼저 등록해 주세요.");
                        return;
                    }

                    const selectBox = document.getElementById("select-praise-target-textbox");
                    const targetElementId = selectBox ? selectBox.value : "";

                    if (!targetElementId) {
                        alert("선택한 디자인 템플릿에 자막 텍스트를 대입할 수 있는 텍스트 상자가 존재하지 않습니다. 다른 템플릿을 선택해 주세요.");
                        return;
                    }

                    blocks.forEach((block, idx) => {
                        if (!checkedIndices.includes(idx)) return;
                        const headerText = `${title} (${idx + 1}/${blocks.length})`;
                        const slideObj = createSlideFromTemplateExplicit(targetTpl, headerText, block, targetElementId);
                        slideObj.mood = songMood;
                        slideObj.moods = [songMood];
                        slideObj.overrideBgId = fixedBgId;
                        slideObj.songTitle = title;
                        slideObj.praiseGroupId = praiseGroupId;
                        tempPraiseSlidesToAdd.push(slideObj);
                    });
                } else {
                    // 현재 디자인 옵션 수집 (RGBA 색상 변환 적용)
                    const opacityVal = fontOpacityInput ? fontOpacityInput.value : 100;
                    const fontColorRgba = hexAndOpacityToRgba(fontColorInput.value, opacityVal);

                    const styleOptions = {
                        fontColor: fontColorRgba,
                        fontSize: fontSizeInput.value + "vw",
                        textAlign: textAlignSelect.value,
                        position: positionSelect.value,
                        backgroundType: bgTypeSelect.value
                    };

                    blocks.forEach((block, idx) => {
                        if (!checkedIndices.includes(idx)) return;
                        const headerText = `${title} (${idx + 1}/${blocks.length})`;
                        const slideObj = createPraiseSlideObject(headerText, block, styleOptions);
                        slideObj.mood = songMood;
                        slideObj.moods = [songMood];
                        slideObj.overrideBgId = fixedBgId;
                        slideObj.songTitle = title;
                        slideObj.praiseGroupId = praiseGroupId;
                        tempPraiseSlidesToAdd.push(slideObj);
                    });
                }

                if (tempPraiseSlidesToAdd.length > 0) {
                    targetInsertAfterSlideId = null;
                    renderBibleModalSlideGrid();
                    const modalTitle = document.querySelector("#bible-insert-modal h3");
                    if (modalTitle) modalTitle.textContent = "📍 찬양 슬라이드 삽입 위치 선택";
                    document.getElementById("bible-insert-modal").style.display = "flex";
                }
            };
        }

        // DB에서 찬양 목록 가져오기 및 목록 그리기
        async function fetchPraiseSongs(query = "") {
            const songsList = document.getElementById("praise-songs-list");
            if (!songsList) return;

            // 영타 한글 자동 변환 적용
            const translatedQuery = typeof engTypeToKor === 'function' ? engTypeToKor(query) : query;

            try {
                const response = await fetch(`/api/praise/search?query=${encodeURIComponent(translatedQuery)}`);
                if (!response.ok) throw new Error("검색 실패");
                const results = await response.json();
                renderPraiseSongsList(results);
            } catch (err) {
                console.error("찬양 목록 조회 오류: ", err);
                songsList.innerHTML = `<div style="color: #ef4444; font-size: 0.75rem; text-align: center; padding: 10px;">목록 로드 오류</div>`;
            }
        }

        function getMoodBadgeStyle(mood) {
            switch(mood) {
                case "경배/찬양": return "background: rgba(99, 102, 241, 0.2); border: 1px solid rgba(129, 140, 248, 0.4); color: #818cf8;";
                case "잔잔/묵상": return "background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(52, 211, 153, 0.4); color: #34d399;";
                case "기도/회개": return "background: rgba(244, 63, 94, 0.2); border: 1px solid rgba(244, 63, 94, 0.4); color: #f43f5e;";
                case "결단/헌금": return "background: rgba(245, 158, 11, 0.2); border: 1px solid rgba(251, 191, 36, 0.4); color: #fbbf24;";
                case "웅장/선포": return "background: rgba(14, 165, 233, 0.2); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8;";
                case "절기/특별": return "background: rgba(168, 85, 247, 0.2); border: 1px solid rgba(168, 85, 247, 0.4); color: #a855f7;";
                default: return "background: rgba(148, 163, 184, 0.2); border: 1px solid rgba(148, 163, 184, 0.4); color: #94a3b8;";
            }
        }

        // 찬양 목록 UI 그리기
        function renderPraiseSongsList(songs) {
            const songsList = document.getElementById("praise-songs-list");
            if (!songsList) return;

            currentPraiseSongsList = songs || [];
            songsList.innerHTML = "";

            if (currentPraiseSongsList.length === 0) {
                songsList.innerHTML = `<div style="color: var(--text-muted); font-size: 0.78rem; text-align: center; margin: auto; padding: 20px 0;">등록된 찬양이 없습니다.</div>`;
                selectedPraiseSongs = [];
                updatePraiseSelectionUI();
                return;
            }

            // 이전 선택 정보가 유효한지 보정
            selectedPraiseSongs = selectedPraiseSongs.filter(sel => currentPraiseSongsList.some(s => s.title === sel.title));

            currentPraiseSongsList.forEach((song, index) => {
                const div = document.createElement("div");
                div.className = "bible-result-item";
                div.dataset.index = index;
                div.dataset.title = song.title;
                div.style.padding = "10px";
                div.style.cursor = "pointer";
                div.style.display = "flex";
                div.style.flexDirection = "column";
                div.style.gap = "4px";
                div.style.userSelect = "none";

                if (selectedPraiseSongs.some(s => s.title === song.title)) {
                    div.classList.add("selected");
                }

                const songMood = (song.moods && song.moods[0]) || song.mood || "기본/일반";
                const badgeStyle = getMoodBadgeStyle(songMood);

                // 가사 첫줄 미리보기
                const lines = song.lyrics.split("\n").filter(l => l.trim() !== "");
                const previewText = lines.length > 0 ? lines[0] : "";

                div.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; pointer-events: none;">
                        <span style="font-size: 0.81rem; font-weight: 600; color: var(--text-main); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 65%;">${song.title}</span>
                        <span style="font-size: 0.65rem; font-weight: 600; padding: 2px 7px; border-radius: 10px; ${badgeStyle} flex-shrink: 0;">#${songMood}</span>
                    </div>
                    <span style="font-size: 0.7rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; margin-top: 1px;">${previewText}</span>
                `;

                // 클릭 (다중 선택, Shift, Ctrl)
                div.onclick = (e) => {
                    if (e.ctrlKey || e.metaKey) {
                        const existsIdx = selectedPraiseSongs.findIndex(s => s.title === song.title);
                        if (existsIdx >= 0) {
                            selectedPraiseSongs.splice(existsIdx, 1);
                        } else {
                            selectedPraiseSongs.push(song);
                        }
                    } else if (e.shiftKey && lastSelectedPraiseIndex >= 0) {
                        const start = Math.min(lastSelectedPraiseIndex, index);
                        const end = Math.max(lastSelectedPraiseIndex, index);
                        const rangeSongs = currentPraiseSongsList.slice(start, end + 1);
                        rangeSongs.forEach(rs => {
                            if (!selectedPraiseSongs.some(s => s.title === rs.title)) {
                                selectedPraiseSongs.push(rs);
                            }
                        });
                    } else {
                        const isAlreadyOnly = (selectedPraiseSongs.length === 1 && selectedPraiseSongs[0].title === song.title);
                        if (isAlreadyOnly) {
                            selectedPraiseSongs = [];
                        } else {
                            selectedPraiseSongs = [song];
                        }
                    }
                    lastSelectedPraiseIndex = index;
                    updatePraiseSelectionUI();
                };

                // 우클릭 (컨텍스트 메뉴)
                div.oncontextmenu = (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const inSel = selectedPraiseSongs.some(s => s.title === song.title);
                    if (!inSel) {
                        selectedPraiseSongs = [song];
                        lastSelectedPraiseIndex = index;
                        updatePraiseSelectionUI();
                    }
                    showPraiseContextMenu(e.clientX, e.clientY);
                };

                songsList.appendChild(div);
            });

            updatePraiseSelectionUI();
        }

        // 찬양용 슬라이드 데이터 빌더 (커스텀 디자인 매핑 규격)
        function createPraiseSlideObject(header, content, styleOptions) {
            const slideId = "slide_praise_" + Math.random().toString(36).substr(2, 8);
            const elements = [];

            // 1. 배경 설정
            if (styleOptions.backgroundType === "black") {
                // 블랙 단색 채우기
                elements.push({
                    id: "elem_praise_bg_" + Math.random().toString(36).substr(2, 9),
                    type: "rect",
                    content: "",
                    x: 0.0,
                    y: 0.0,
                    width: 100.0,
                    height: 100.0,
                    style: {
                        fillColor: "#000000",
                        strokeColor: "transparent",
                        strokeWidth: 0,
                        cornerRadius: 0,
                        opacity: 1.0
                    }
                });
            } else if (styleOptions.backgroundType === "bar") {
                // 자막 바 (Band) 배치 - 하단 또는 상단 글자 위치에 맞춤
                let barY = 38.0; // middle
                if (styleOptions.position === "top") barY = 6.0;
                if (styleOptions.position === "bottom") barY = 70.0;

                elements.push({
                    id: "elem_praise_bg_bar_" + Math.random().toString(36).substr(2, 9),
                    type: "rect",
                    content: "",
                    x: 0.0,
                    y: barY,
                    width: 100.0,
                    height: 24.0,
                    style: {
                        fillColor: "#000000",
                        strokeColor: "transparent",
                        strokeWidth: 0,
                        cornerRadius: 0,
                        opacity: 0.65 // 반투명 65% 바
                    }
                });
            }

            // 2. 가사 텍스트 기하학적 Y축 좌표 및 정렬 연산
            let textY = 38.0; // middle default
            let textX = 7.2;
            let textWidth = 85.6;

            if (styleOptions.position === "top") {
                textY = 12.0;
            } else if (styleOptions.position === "bottom") {
                textY = 76.0;
            }

            // 타입 A 좌측 정렬인 경우 레이아웃 좌측 편향 여백 연산
            if (styleOptions.textAlign === "left") {
                textX = 7.2;
                textWidth = 85.6;
            }

            // 가사 본문 텍스트 요소 (제목 헤더 표시 부분 전면 제거됨)
            elements.push({
                id: "elem_praise_c_" + Math.random().toString(36).substr(2, 9),
                type: "text",
                content: content,
                x: textX,
                y: textY,
                width: textWidth,
                height: 20.0,
                style: {
                    fontSize: styleOptions.fontSize,
                    fontColor: styleOptions.fontColor,
                    fontFamily: "Inter",
                    fontWeight: "700",
                    textAlign: styleOptions.textAlign,
                    // 가독성을 위한 외곽선(특히 투명 배경 오버레이 시 극대화, 정수 검증 준수)
                    strokeColor: styleOptions.fontColor === "#ffffff" ? "#000000" : "transparent",
                    strokeWidth: styleOptions.fontColor === "#ffffff" ? 3 : 0
                }
            });

            return {
                id: slideId,
                name: `찬양: ${header}`,
                elements: elements
            };
        }

        function createSlideFromTemplateExplicit(tpl, header, contentBlock, targetElementId) {
            const slideId = "slide_praise_" + Math.random().toString(36).substr(2, 8);
            const clonedElements = JSON.parse(JSON.stringify(tpl.elements));

            clonedElements.forEach(elem => {
                const oldId = elem.id;
                // 복사 후 ID 고유값 충돌 방지
                elem.id = "elem_praise_" + Math.random().toString(36).substr(2, 9);

                // 사용자가 지정한 본래 템플릿의 엘리먼트 ID와 일치할 때 가사 대입
                if (elem.type === "text" && oldId === targetElementId) {
                    elem.content = contentBlock;
                }
            });

            return {
                id: slideId,
                name: `자막(템): ${header}`,
                elements: clonedElements
            };
        }

        // x, y 좌표 백분율을 기반으로 9분할 기하학적 위치 이름을 판단하는 헬퍼 함수
        function getGeometricLocationName(x, y) {
            let vPos = "";
            if (y < 33) {
                vPos = "상단";
            } else if (y <= 66) {
                vPos = "중앙";
            } else {
                vPos = "하단";
            }

            let hPos = "";
            if (x < 33) {
                hPos = "좌측";
            } else if (x <= 66) {
                hPos = "중앙";
            } else {
                hPos = "우측";
            }

            if (vPos === "중앙" && hPos === "중앙") {
                return "정중앙";
            }
            return vPos + " " + hPos;
        }

// === 현장 모니터 배경 연출 & 라이브러리 & PiP 미리보기 모듈 ===
let currentStageBg = {
    type: 'ambient',
    videoUrl: '',
    opacity: 0.8,
    blur: 0
};
let allStageBgFiles = [];
let selectedStageBgFiles = [];
let stageBgClipboardFiles = [];
let lastSelectedStageBgIndex = -1;
let _renderedStageBgFiles = [];
let pipAmbientAnimId = null;
let stageBgGridMinSize = 220;

function updateStageBgGridColumns() {
    const gridContainer = document.getElementById('stage-bg-main-grid');
    if (gridContainer) {
        gridContainer.style.gridTemplateColumns = `repeat(auto-fill, minmax(${stageBgGridMinSize}px, 1fr))`;
    }
}

// 현장 배경 복사 / 붙여넣기 / 삭제 함수
window.copySelectedStageBgFiles = function() {
    if (!selectedStageBgFiles || selectedStageBgFiles.length === 0) return;
    stageBgClipboardFiles = JSON.parse(JSON.stringify(selectedStageBgFiles));
    if (typeof showToast === 'function') {
        showToast(`${selectedStageBgFiles.length}개의 현장 배경이 복사되었습니다.`);
    }
};

window.pasteStageBgFiles = async function() {
    if (!stageBgClipboardFiles || stageBgClipboardFiles.length === 0) return;
    try {
        const res = await fetch('/api/backgrounds/duplicate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ names: stageBgClipboardFiles.map(f => f.name) })
        });
        if (res.ok) {
            const data = await res.json();
            if (typeof showToast === 'function') {
                showToast(`${data.new_files?.length || 0}개의 현장 배경이 붙여넣기 되었습니다.`);
            }
            await loadStageBgLibrary();
        } else {
            const err = await res.json().catch(() => ({}));
            alert("붙여넣기 실패: " + (err.detail || res.statusText));
        }
    } catch (e) {
        console.error("Failed to paste stage bg files", e);
    }
};

window.deleteSelectedStageBgFilesWithConfirm = async function(confirmRequired = true) {
    if (!selectedStageBgFiles || selectedStageBgFiles.length === 0) return;

    if (confirmRequired) {
        const namesStr = selectedStageBgFiles.map(f => f.name).slice(0, 3).join(", ") + (selectedStageBgFiles.length > 3 ? ` 외 ${selectedStageBgFiles.length - 3}건` : "");
        if (!confirm(`선택한 현장 배경 (${selectedStageBgFiles.length}개: ${namesStr})을 삭제하시겠습니까?`)) {
            return;
        }
    }

    const deletedNames = selectedStageBgFiles.map(f => f.name);

    // 1. 삭제 후 자동으로 선택 및 미리보기 재생할 다음 배경 영상 결정
    let nextFileToSelect = null;
    if (_renderedStageBgFiles && _renderedStageBgFiles.length > 0) {
        const firstDelIdx = _renderedStageBgFiles.findIndex(f => deletedNames.includes(f.name));
        const remainingFiles = _renderedStageBgFiles.filter(f => !deletedNames.includes(f.name));
        if (remainingFiles.length > 0) {
            if (firstDelIdx >= 0 && firstDelIdx < remainingFiles.length) {
                nextFileToSelect = remainingFiles[firstDelIdx];
            } else {
                nextFileToSelect = remainingFiles[remainingFiles.length - 1];
            }
        }
    }

    // 2. 프론트엔드 메모리 목록에서 삭제 대상 즉시 제거 (Optimistic UI Update)
    allStageBgFiles = allStageBgFiles.filter(f => !deletedNames.includes(f.name));
    _renderedStageBgFiles = _renderedStageBgFiles.filter(f => !deletedNames.includes(f.name));

    // 3. 삭제 대상 중 현재 적용 중인 비디오 배경이 있는 경우 미리보기 릴리즈
    const isDeletingCurrent = currentStageBg.type === 'video' && deletedNames.some(name => currentStageBg.videoUrl === `/static/backgrounds/${name}`);
    const pipVideo = document.getElementById('pip-bg-video');
    if (isDeletingCurrent || pipVideo) {
        if (pipVideo) {
            pipVideo.pause();
            pipVideo.removeAttribute('src');
            pipVideo.load();
        }
    }

    // 4. 즉시 다음 배경 영상으로 화면 선택 및 미리보기 전환 (남은 영상이 없으면 Ambient)
    if (nextFileToSelect) {
        selectedStageBgFiles = [nextFileToSelect];
        selectStageBg({ type: 'video', videoUrl: nextFileToSelect.url, title: nextFileToSelect.name }, true);
    } else {
        selectedStageBgFiles = [];
        selectStageBg({ type: 'ambient' }, true);
    }

    // 5. UI 카드 그리드 즉시 갱신 및 완료 토스트 출력 (사용자 화면에서 즉각 삭제 처리)
    filterAndRenderStageBgLibrary();
    if (typeof showToast === 'function') {
        showToast(`${deletedNames.length}개의 현장 배경이 삭제되었습니다.`);
    }

    // 6. 백엔드 비동기 삭제 API 호출 (백엔드가 메타 제거 및 백그라운드 파일 정리 수행)
    try {
        await fetch('/api/backgrounds/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ names: deletedNames })
        });
    } catch (e) {
        console.error("Failed to call background delete API", e);
    }
};

window.handleStageBgCardClick = function(e, index) {
    const fileObj = _renderedStageBgFiles[index];
    if (!fileObj) return;

    if (e.ctrlKey || e.metaKey) {
        const existsIdx = selectedStageBgFiles.findIndex(f => f.name === fileObj.name);
        if (existsIdx !== -1) {
            selectedStageBgFiles.splice(existsIdx, 1);
        } else {
            selectedStageBgFiles.push(fileObj);
        }
        lastSelectedStageBgIndex = index;
    } else if (e.shiftKey && lastSelectedStageBgIndex >= 0) {
        const start = Math.min(lastSelectedStageBgIndex, index);
        const end = Math.max(lastSelectedStageBgIndex, index);
        for (let i = start; i <= end; i++) {
            const targetFile = _renderedStageBgFiles[i];
            if (targetFile && !selectedStageBgFiles.some(f => f.name === targetFile.name)) {
                selectedStageBgFiles.push(targetFile);
            }
        }
    } else {
        selectedStageBgFiles = [fileObj];
        lastSelectedStageBgIndex = index;
        selectStageBg({type: 'video', videoUrl: fileObj.url, title: fileObj.name}, false);
    }

    filterAndRenderStageBgLibrary();
};

window.handleStageBgCardContextMenu = function(e, index) {
    e.preventDefault();
    e.stopPropagation();
    const fileObj = _renderedStageBgFiles[index];
    if (fileObj) {
        if (!selectedStageBgFiles.some(f => f.name === fileObj.name)) {
            selectedStageBgFiles = [fileObj];
            lastSelectedStageBgIndex = index;
            filterAndRenderStageBgLibrary();
        }
    }
    showStageBgContextMenu(e.clientX, e.clientY);
};

window.toggleSelectStageBgCard = function(e, index) {
    const fileObj = _renderedStageBgFiles[index];
    if (!fileObj) return;
    const existsIdx = selectedStageBgFiles.findIndex(f => f.name === fileObj.name);
    if (existsIdx !== -1) {
        selectedStageBgFiles.splice(existsIdx, 1);
    } else {
        selectedStageBgFiles.push(fileObj);
    }
    lastSelectedStageBgIndex = index;
    filterAndRenderStageBgLibrary();
};

window.updateStageBgBulkBar = function() {
    const bulkBar = document.getElementById('stage-bg-bulk-bar');
    const bulkCount = document.getElementById('stage-bg-bulk-count');
    if (!bulkBar || !bulkCount) return;

    if (selectedStageBgFiles && selectedStageBgFiles.length > 0) {
        bulkBar.style.display = 'flex';
        bulkCount.textContent = `☑ ${selectedStageBgFiles.length}개 배경 선택됨`;
    } else {
        bulkBar.style.display = 'none';
    }
};

function saveStageBgLibraryData() {
    if (projectData && projectData.settings) {
        projectData.settings.stageBgLibrary = allStageBgFiles;
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: "UPDATE_STAGE_BG_LIBRARY",
            library: allStageBgFiles
        }));
    }
    if (typeof triggerAutoSave === 'function') {
        triggerAutoSave();
    }
}

let _stageBgMoodTargets = [];
window.openStageBgMoodModal = function(targetFiles) {
    _stageBgMoodTargets = targetFiles || selectedStageBgFiles || [];
    if (_stageBgMoodTargets.length === 0) return;

    const modal = document.getElementById('stage-bg-mood-modal');
    const title = document.getElementById('modal-stage-bg-mood-title');
    const desc = document.getElementById('modal-stage-bg-mood-desc');
    const chipsContainer = document.getElementById('stage-bg-mood-chips-container');
    const bulkModeContainer = document.getElementById('stage-bg-bulk-mode-container');

    if (title) {
        title.textContent = _stageBgMoodTargets.length === 1 
            ? `🏷️ 배경 [${_stageBgMoodTargets[0].name}] 분위기 태그 설정` 
            : `🏷️ 선택한 ${_stageBgMoodTargets.length}개 배경 분위기 태그 일괄 설정`;
    }
    if (desc) {
        desc.textContent = _stageBgMoodTargets.length === 1
            ? "영상에 부여할 분위기 태그를 선택하거나 신규 추가해 주세요."
            : `선택된 ${_stageBgMoodTargets.length}개의 배경 영상에 일괄로 적용할 태그를 선택해 주세요.`;
    }
    if (bulkModeContainer) {
        bulkModeContainer.style.display = _stageBgMoodTargets.length > 1 ? 'flex' : 'none';
    }

    const standardPresets = ["경배/찬양", "잔잔/묵상", "기도/회개", "결단/헌금", "웅장/선포", "절기/특별", "기본/일반"];
    let currentSelectedMood = "경배/찬양";
    if (_stageBgMoodTargets.length > 0) {
        const firstBg = _stageBgMoodTargets[0];
        currentSelectedMood = (firstBg.moods && firstBg.moods[0]) || firstBg.mood || "경배/찬양";
    }

    function renderChips() {
        if (!chipsContainer) return;
        let html = '';
        standardPresets.forEach(m => {
            const isActive = m === currentSelectedMood;
            const style = isActive 
                ? 'padding: 5px 12px; font-size: 0.76rem; border-radius: 14px; border: 1px solid var(--primary); background: var(--primary); color: #fff; cursor: pointer; font-weight: 600;'
                : 'padding: 5px 12px; font-size: 0.76rem; border-radius: 14px; border: 1px solid var(--panel-border); background: rgba(255,255,255,0.05); color: #cbd5e1; cursor: pointer;';
            html += `<button type="button" class="stage-bg-mood-chip ${isActive ? 'active' : ''}" data-mood="${m}" style="${style}">#${m}</button>`;
        });
        chipsContainer.innerHTML = html;

        chipsContainer.querySelectorAll('.stage-bg-mood-chip').forEach(btn => {
            btn.onclick = () => {
                currentSelectedMood = btn.getAttribute('data-mood');
                renderChips();
            };
        });
    }

    renderChips();

    if (modal) modal.style.display = 'flex';
};

function initStageBgMoodModalEvents() {
    const modal = document.getElementById('stage-bg-mood-modal');
    const closeBtn = document.getElementById('btn-stage-bg-mood-modal-close');
    const cancelBtn = document.getElementById('btn-stage-bg-mood-modal-cancel');
    const saveBtn = document.getElementById('btn-stage-bg-mood-modal-save');

    const closeModal = () => { if (modal) modal.style.display = 'none'; };
    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;

    if (saveBtn) {
        saveBtn.onclick = () => {
            const activeChip = document.querySelector('.stage-bg-mood-chip.active');
            const selectedMood = activeChip ? activeChip.getAttribute('data-mood') : "기본/일반";

            _stageBgMoodTargets.forEach(targetBg => {
                targetBg.mood = selectedMood;
                targetBg.moods = [selectedMood];
                const matchInAll = allStageBgFiles.find(f => f.name === targetBg.name);
                if (matchInAll) {
                    matchInAll.mood = selectedMood;
                    matchInAll.moods = [selectedMood];
                }
            });

            saveStageBgLibraryData();
            filterAndRenderStageBgLibrary();
            closeModal();
        };
    }

    const btnBulkMoods = document.getElementById('btn-stage-bg-bulk-moods');
    if (btnBulkMoods) {
        btnBulkMoods.onclick = () => {
            openStageBgMoodModal(selectedStageBgFiles);
        };
    }

    const btnBulkDefault = document.getElementById('btn-stage-bg-bulk-default');
    if (btnBulkDefault) {
        btnBulkDefault.onclick = () => {
            if (!selectedStageBgFiles || selectedStageBgFiles.length === 0) return;
            const isDef = confirm(`선택한 ${selectedStageBgFiles.length}개 배경을 기본(Default) 배경으로 지정하시겠습니까?`);
            selectedStageBgFiles.forEach(f => {
                f.isDefault = isDef;
                const matchInAll = allStageBgFiles.find(item => item.name === f.name);
                if (matchInAll) {
                    matchInAll.isDefault = isDef;
                }
            });
            saveStageBgLibraryData();
            filterAndRenderStageBgLibrary();
        };
    }

    const btnBulkDelete = document.getElementById('btn-stage-bg-bulk-delete');
    if (btnBulkDelete) {
        btnBulkDelete.onclick = () => {
            if (typeof deleteSelectedStageBgFilesWithConfirm === 'function') {
                deleteSelectedStageBgFilesWithConfirm();
            }
        };
    }

    const btnBulkClear = document.getElementById('btn-stage-bg-bulk-clear');
    if (btnBulkClear) {
        btnBulkClear.onclick = () => {
            selectedStageBgFiles = [];
            filterAndRenderStageBgLibrary();
        };
    }
}

// 현장 배경 메인 뷰어 열기/닫기
function showStageBgMainViewer() {
    initStageBgMoodModalEvents();
    const overlay = document.getElementById('stage-bg-main-viewer-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
    }

    const gridBody = document.getElementById('stage-bg-main-grid-body');
    if (gridBody && !gridBody.dataset.wheelBound) {
        gridBody.dataset.wheelBound = "true";
        gridBody.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                e.stopPropagation();
                const delta = e.deltaY > 0 ? -20 : 20;
                stageBgGridMinSize = Math.max(100, Math.min(420, stageBgGridMinSize + delta));
                updateStageBgGridColumns();
            }
        }, { passive: false });
    }

    updateStageBgGridColumns();
    loadStageBgLibrary();
    initPipPreview();
    const pipContainer = document.getElementById('pip-stage-preview-container');
    if (pipContainer) pipContainer.style.display = 'flex';
}

function hideStageBgMainViewer() {
    const overlay = document.getElementById('stage-bg-main-viewer-overlay');
    if (overlay) overlay.style.display = 'none';
}

// 백엔드 API에서 배경 라이브러리 목록 로드
async function loadStageBgLibrary() {
    try {
        const res = await fetch('/api/backgrounds/list');
        if (res.ok) {
            const data = await res.json();
            allStageBgFiles = data.files || [];
            filterAndRenderStageBgLibrary();
        }
    } catch (e) {
        console.error("Failed to load stage bg list", e);
    }
}

// 오른쪽 메인 칸 배경 라이브러리 그리드 & 검색 필터링 렌더링
function filterAndRenderStageBgLibrary() {
    const gridContainer = document.getElementById('stage-bg-main-grid');
    if (!gridContainer) return;

    updateStageBgGridColumns();

    const searchInput = document.getElementById('input-stage-bg-search');
    const filterSelect = document.getElementById('select-stage-bg-filter');

    const searchVal = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const filterVal = filterSelect ? filterSelect.value : 'all';

    let filesToRender = allStageBgFiles.filter(f => {
        if (searchVal && !f.name.toLowerCase().includes(searchVal)) return false;
        if (filterVal === 'video') return true;
        if (filterVal === 'ambient') return false;
        return true;
    });

    _renderedStageBgFiles = filesToRender;

    let html = '';

    filesToRender.forEach((f, idx) => {
        const isCurrent = currentStageBg.type === 'video' && currentStageBg.videoUrl === f.url;
        const isSelected = selectedStageBgFiles.some(sel => sel.name === f.name);
        const filenameWOExt = f.name.substring(0, f.name.lastIndexOf('.'));
        const isYt = filenameWOExt.length === 11 && !f.name.startsWith('upload_');
        const thumbUrl = f.thumbnailUrl || (isYt ? `https://img.youtube.com/vi/${filenameWOExt}/hqdefault.jpg` : '');
        const escOldName = f.name.replace(/'/g, "\\'");
        const safeName = f.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const borderStyle = isSelected ? '2px solid #38bdf8' : (isCurrent ? '2px solid #0284c7' : '2px solid var(--panel-border, #3f3f46)');
        const bgStyle = isSelected ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255,255,255,0.04)';

        const moodsList = f.moods || [];
        const moodChipsHtml = moodsList.map(m => `<span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 0.65rem; padding: 2px 6px; border-radius: 10px; border: 1px solid rgba(56, 189, 248, 0.3);">#${m}</span>`).join(' ');
        const defaultBadgeHtml = (f.isDefault || f.is_default) ? `<span style="background: #eab308; color: #000; font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 4px;">⭐ 기본</span>` : '';

        html += `
            <div class="stage-bg-card-main ${isCurrent ? 'active' : ''} ${isSelected ? 'selected' : ''}" 
                onclick="handleStageBgCardClick(event, ${idx})" 
                oncontextmenu="handleStageBgCardContextMenu(event, ${idx})"
                style="background: ${bgStyle}; border: ${borderStyle}; border-radius: 8px; padding: 12px; cursor: pointer; display: flex; flex-direction: column; gap: 10px; transition: all 0.2s; position: relative;">
                <input type="checkbox" ${isSelected ? 'checked' : ''} 
                       onclick="event.stopPropagation(); toggleSelectStageBgCard(event, ${idx})" 
                       style="position: absolute; top: 10px; left: 10px; z-index: 10; width: 16px; height: 16px; cursor: pointer;">
                <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 4px; z-index: 5;">
                    ${defaultBadgeHtml}
                    ${isCurrent ? `<span style="background: #0284c7; color: #fff; font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 4px;">적용 중</span>` : ''}
                </div>
                <div style="width: 100%; aspect-ratio: 16/9; max-height: 140px; background: #0f172a; border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; position: relative;">
                    ${thumbUrl ? `<img src="${thumbUrl}" style="width: 100%; height: 100%; object-fit: cover;">` : `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: #60a5fa;"><span style="font-size: 2rem;">🎬</span><span style="font-size: 0.68rem; color: var(--text-muted);">로컬 미디어</span></div>`}
                </div>
                <div>
                    <div class="stage-bg-title" 
                         style="font-size: 0.85rem; font-weight: 600; color: #fff; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; margin-bottom: 4px; cursor: text;" 
                         title="두 번 클릭하여 제목 수정" 
                         onclick="event.stopPropagation();" 
                         ondblclick="event.stopPropagation(); startInlineRenameStageBg(this, '${escOldName}')">
                        ${safeName}
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
                        ${moodChipsHtml || '<span style="color: var(--text-muted); font-size: 0.68rem;">태그 없음</span>'}
                    </div>
                </div>
            </div>
        `;
    });

    if (filesToRender.length === 0) {
        html = `
            <div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
                🔍 검색 조건에 일치하는 현장 배경이 없습니다.
            </div>
        `;
    }

    gridContainer.innerHTML = html;
    updateStageBgBulkBar();
}

// 배경 라이브러리 더블 클릭 인라인 이름 변경
window.startInlineRenameStageBg = function(containerEl, oldName) {
    if (containerEl.querySelector('input')) return;

    // 확장자 및 순수 이름 분리 (예: test.mp4 -> base: test, ext: .mp4)
    const lastDotIdx = oldName.lastIndexOf('.');
    const ext = lastDotIdx !== -1 ? oldName.substring(lastDotIdx) : '';
    const baseOldName = lastDotIdx !== -1 ? oldName.substring(0, lastDotIdx) : oldName;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'stage-bg-name-input';
    input.value = baseOldName;
    input.style.cssText = "width: 100%; padding: 3px 6px; background: rgba(0,0,0,0.9); border: 1.5px solid #38bdf8; border-radius: 4px; color: #fff; font-size: 0.82rem; outline: none; font-weight: 600; box-shadow: 0 0 6px rgba(56, 189, 248, 0.4);";

    const stopEvents = (e) => e.stopPropagation();
    input.onmousedown = stopEvents;
    input.onclick = stopEvents;
    input.ondblclick = stopEvents;

    let isSaved = false;
    const saveRename = async () => {
        if (isSaved) return;
        isSaved = true;

        let inputVal = input.value.trim();
        if (!inputVal) {
            if (typeof showToast === 'function') showToast('변경할 제목을 입력해주세요.');
            containerEl.textContent = oldName;
            return;
        }

        // 입력값에 원래 확장자가 없으면 자동 결합
        let finalNewName = inputVal;
        if (ext && !finalNewName.toLowerCase().endsWith(ext.toLowerCase())) {
            finalNewName += ext;
        }

        if (finalNewName === oldName) {
            containerEl.textContent = oldName;
            return;
        }

        try {
            const res = await fetch('/api/backgrounds/rename', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ old_name: oldName, new_name: finalNewName })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || '제목 변경 실패');
            }

            const data = await res.json();
            if (typeof showToast === 'function') showToast('라이브러리 제목이 변경되었습니다.');

            // 만약 현재 적용 중인 비디오 배경이었다면 videoUrl 업데이트
            if (currentStageBg.type === 'video' && currentStageBg.videoUrl === `/static/backgrounds/${oldName}`) {
                currentStageBg.videoUrl = data.videoUrl;
                applyAndBroadcastStageBg();
            }

            await loadStageBgLibrary();
        } catch (err) {
            alert('제목 변경 오류: ' + err.message);
            containerEl.textContent = oldName;
        }
    };

    input.onblur = saveRename;
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            saveRename();
        } else if (e.key === 'Escape') {
            isSaved = true;
            containerEl.textContent = oldName;
        }
    };

    containerEl.innerHTML = '';
    containerEl.appendChild(input);
    input.focus();
    input.select();
};

window.selectStageBg = function(config, shouldRender = true) {
    currentStageBg.type = config.type;
    if (config.type === 'ambient') {
        selectedStageBgFiles = [];
    }
    if (config.videoUrl) currentStageBg.videoUrl = config.videoUrl;
    applyAndBroadcastStageBg();
    if (shouldRender) {
        filterAndRenderStageBgLibrary();
    }
};

function applyAndBroadcastStageBg() {
    const opacityInput = document.getElementById('range-stage-bg-opacity');
    const blurInput = document.getElementById('range-stage-bg-blur');

    const valOpacity = opacityInput ? opacityInput.value : 80;
    const valBlur = blurInput ? blurInput.value : 0;

    currentStageBg.opacity = parseFloat(valOpacity) / 100;
    currentStageBg.blur = parseInt(valBlur) || 0;

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'SET_STAGE_BACKGROUND',
            background: currentStageBg
        }));
    }

    updatePipBgLayer();
}

// === PiP (Picture-in-Picture) 미리보기 구현 ===
window.togglePipPreview = function() {
    const pipContainer = document.getElementById('pip-stage-preview-container');
    if (!pipContainer) return;
    if (pipContainer.style.display === 'none' || !pipContainer.style.display) {
        pipContainer.style.display = 'flex';
        initPipPreview();
    } else {
        pipContainer.style.display = 'none';
    }
};

function initPipPreview() {
    initPipDragging();
    initPipResizing();
    updatePipCanvasDimensions();
    updatePipBgLayer();
    updatePipSlideOverlay();

    if (canvas && !canvas._pipBound) {
        canvas.on('after:render', () => {
            updatePipSlideOverlay();
        });
        canvas._pipBound = true;
    }
}

function initPipDragging() {
    const pipContainer = document.getElementById('pip-stage-preview-container');
    const pipHeader = document.getElementById('pip-header');
    if (!pipContainer || !pipHeader || pipHeader._dragBound) return;

    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    pipHeader.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        const rect = pipContainer.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        pipContainer.style.bottom = 'auto';
        pipContainer.style.right = 'auto';
        pipContainer.style.left = initialLeft + 'px';
        pipContainer.style.top = initialTop + 'px';

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        pipContainer.style.left = Math.max(0, Math.min(window.innerWidth - pipContainer.offsetWidth, initialLeft + dx)) + 'px';
        pipContainer.style.top = Math.max(0, Math.min(window.innerHeight - pipContainer.offsetHeight, initialTop + dy)) + 'px';
    }

    function onMouseUp() {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }

    pipHeader._dragBound = true;
}

function initPipResizing() {
    const pipContainer = document.getElementById('pip-stage-preview-container');
    if (!pipContainer || pipContainer._resizeBound) return;

    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
            updatePipCanvasDimensions();
            updatePipSlideOverlay();
        });
        ro.observe(pipContainer);
    }
    pipContainer._resizeBound = true;
}

function updatePipCanvasDimensions() {
    const pipBody = document.getElementById('pip-body');
    const slideCanvas = document.getElementById('pip-slide-canvas');
    const ambientCanvas = document.getElementById('pip-bg-ambient-canvas');

    if (!pipBody) return;
    const w = pipBody.clientWidth || 340;
    const h = pipBody.clientHeight || 180;

    if (slideCanvas) {
        slideCanvas.width = w;
        slideCanvas.height = h;
    }
    if (ambientCanvas) {
        ambientCanvas.width = w;
        ambientCanvas.height = h;
    }
}

function updatePipBgLayer() {
    const video = document.getElementById('pip-bg-video');
    const ambientCanvas = document.getElementById('pip-bg-ambient-canvas');
    if (!video || !ambientCanvas) return;

    if (currentStageBg.type === 'video' && currentStageBg.videoUrl) {
        ambientCanvas.style.display = 'none';
        video.style.display = 'block';
        if (video.src !== window.location.origin + currentStageBg.videoUrl && !video.src.endsWith(currentStageBg.videoUrl)) {
            video.src = currentStageBg.videoUrl;
        }
        video.style.opacity = currentStageBg.opacity;
        video.style.filter = `blur(${currentStageBg.blur}px)`;
        video.play().catch(() => {});
        if (pipAmbientAnimId) {
            cancelAnimationFrame(pipAmbientAnimId);
            pipAmbientAnimId = null;
        }
    } else {
        video.style.display = 'none';
        video.pause();
        ambientCanvas.style.display = 'block';
        ambientCanvas.style.opacity = currentStageBg.opacity;
        ambientCanvas.style.filter = `blur(${currentStageBg.blur}px)`;
        startPipAmbientLoop();
    }
}

function startPipAmbientLoop() {
    if (pipAmbientAnimId) cancelAnimationFrame(pipAmbientAnimId);
    const canvasEl = document.getElementById('pip-bg-ambient-canvas');
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    let t = 0;

    function render() {
        t += 0.015;
        const w = canvasEl.width || 340;
        const h = canvasEl.height || 180;

        const grad = ctx.createLinearGradient(
            (Math.sin(t) * 0.5 + 0.5) * w,
            0,
            (Math.cos(t) * 0.5 + 0.5) * w,
            h
        );
        grad.addColorStop(0, '#0b0f19');
        grad.addColorStop(0.5, '#0369a1');
        grad.addColorStop(1, '#1e1b4b');

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        for (let i = 0; i < 15; i++) {
            const x = (Math.sin(t + i * 1.3) * 0.5 + 0.5) * w;
            const y = (Math.cos(t * 0.8 + i * 1.7) * 0.5 + 0.5) * h;
            const r = (Math.sin(t + i) * 0.5 + 0.5) * 3 + 1;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        pipAmbientAnimId = requestAnimationFrame(render);
    }
    render();
}

let pipTempCanvas = null;
let isPipUpdating = false;

function updatePipSlideOverlay() {
    if (isPipUpdating) return;
    const slideCanvas = document.getElementById('pip-slide-canvas');
    if (!slideCanvas) return;
    const ctx = slideCanvas.getContext('2d');
    ctx.clearRect(0, 0, slideCanvas.width, slideCanvas.height);

    if (!canvas) return;

    try {
        isPipUpdating = true;
        const baseW = (typeof BASE_WIDTH !== 'undefined' && BASE_WIDTH) ? BASE_WIDTH : 1920;
        const baseH = (typeof BASE_HEIGHT !== 'undefined' && BASE_HEIGHT) ? BASE_HEIGHT : 1080;

        if (!pipTempCanvas) {
            pipTempCanvas = document.createElement('canvas');
        }
        if (pipTempCanvas.width !== baseW || pipTempCanvas.height !== baseH) {
            pipTempCanvas.width = baseW;
            pipTempCanvas.height = baseH;
        }

        const tempCtx = pipTempCanvas.getContext('2d');
        tempCtx.clearRect(0, 0, baseW, baseH);

        // 에디터 캔버스 줌(canvasZoom) 및 여백 변환(transform)을 제외하고 1:1 슬라이드 원본 해상도로 고정 렌더링
        tempCtx.save();
        tempCtx.setTransform(1, 0, 0, 1, 0, 0);

        const objects = canvas.getObjects();
        for (let i = 0; i < objects.length; i++) {
            const obj = objects[i];
            if (obj && obj.visible !== false) {
                obj.render(tempCtx);
            }
        }
        tempCtx.restore();

        // 슬라이드 원본 레이어(1920x1080) 전체를 PiP 화면에 풀 스케일로 꽉 채워 합성
        ctx.drawImage(pipTempCanvas, 0, 0, slideCanvas.width, slideCanvas.height);
    } catch (e) {
        console.error("Failed to render PiP slide overlay", e);
    } finally {
        isPipUpdating = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadStageBgLibrary();

    const searchInput = document.getElementById('input-stage-bg-search');
    const filterSelect = document.getElementById('select-stage-bg-filter');
    if (searchInput) searchInput.addEventListener('input', filterAndRenderStageBgLibrary);
    if (filterSelect) filterSelect.addEventListener('change', filterAndRenderStageBgLibrary);

    const btnPipClose = document.getElementById('btn-pip-close');
    const btnPipMin = document.getElementById('btn-pip-toggle-min');
    if (btnPipClose) {
        btnPipClose.addEventListener('click', () => {
            const container = document.getElementById('pip-stage-preview-container');
            if (container) container.style.display = 'none';
        });
    }
    if (btnPipMin) {
        btnPipMin.addEventListener('click', () => {
            const body = document.getElementById('pip-body');
            const container = document.getElementById('pip-stage-preview-container');
            if (body && container) {
                if (body.style.display === 'none') {
                    body.style.display = 'flex';
                    container.style.height = '215px';
                } else {
                    body.style.display = 'none';
                    container.style.height = '36px';
                }
            }
        });
    }

    const opacityInput = document.getElementById('range-stage-bg-opacity');
    const opacityVal = document.getElementById('val-stage-bg-opacity');
    if (opacityInput) {
        opacityInput.addEventListener('input', (e) => {
            if (opacityVal) opacityVal.innerText = `${e.target.value}%`;
            applyAndBroadcastStageBg();
        });
    }

    const blurInput = document.getElementById('range-stage-bg-blur');
    const blurVal = document.getElementById('val-stage-bg-blur');
    if (blurInput) {
        blurInput.addEventListener('input', (e) => {
            if (blurVal) blurVal.innerText = `${e.target.value}px`;
            applyAndBroadcastStageBg();
        });
    }

    const btnUploadFile = document.getElementById('btn-upload-bg-file');
    const inputUploadFile = document.getElementById('file-upload-bg-input');

    async function handleLocalFileUpload(fileInput) {
        if (!fileInput || !fileInput.files || !fileInput.files[0]) return;
        const file = fileInput.files[0];
        const formData = new FormData();
        formData.append('file', file);

        updateYtStatus(`⏳ 로컬 비디오 파일 업로드 중... 0%`, '#fbbf24');

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/backgrounds/upload', true);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                updateYtStatus(`⏳ 로컬 비디오 파일 업로드 중... ${percent}%`, '#fbbf24');
            }
        };

        xhr.onload = async () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const data = JSON.parse(xhr.responseText);
                    if (data.success) {
                        updateYtStatus(`✅ 업로드 완료! 100% (${file.name})`, '#34d399');
                        selectStageBg({ type: 'video', videoUrl: data.videoUrl, title: data.filename });
                        await loadStageBgLibrary();
                    } else {
                        updateYtStatus(`❌ 업로드 실패: ${data.detail || '오류 발생'}`, '#ef4444');
                    }
                } catch (e) {
                    updateYtStatus(`❌ 응답 처리 오류: ${e.message}`, '#ef4444');
                }
            } else {
                updateYtStatus(`❌ 업로드 실패: HTTP ${xhr.status}`, '#ef4444');
            }
            fileInput.value = '';
        };

        xhr.onerror = () => {
            updateYtStatus(`❌ 업로드 통신 오류 발생`, '#ef4444');
            fileInput.value = '';
        };

        xhr.send(formData);
    }

    if (btnUploadFile && inputUploadFile) {
        btnUploadFile.addEventListener('click', () => inputUploadFile.click());
        inputUploadFile.addEventListener('change', () => handleLocalFileUpload(inputUploadFile));
    }
});

/* 모니터링 화면 자유 캔버스 레이아웃 편집기 */
let isMonitorEditMode = false;

function syncMonitorNumericInputs() {
    if (!canvas || !isMonitorEditMode) return;
    const currObj = canvas.getObjects().find(o => o.monitorRole === 'current');
    const nextObj = canvas.getObjects().find(o => o.monitorRole === 'next');

    const updateInputs = (obj, role) => {
        if (!obj) return;
        const actualW = obj.width * (obj.scaleX || 1);
        const actualH = obj.height * (obj.scaleY || 1);
        const leftPct = Math.max(0, Math.min(100, Math.round((obj.left / 1920) * 100)));
        const topPct = Math.max(0, Math.min(100, Math.round((obj.top / 1080) * 100)));
        const widthPct = Math.max(5, Math.min(100, Math.round((actualW / 1920) * 100)));
        const heightPct = Math.max(5, Math.min(100, Math.round((actualH / 1080) * 100)));

        const elX = document.getElementById(`num-monitor-${role}-x`);
        const elY = document.getElementById(`num-monitor-${role}-y`);
        const elW = document.getElementById(`num-monitor-${role}-w`);
        const elH = document.getElementById(`num-monitor-${role}-h`);

        if (elX) elX.value = leftPct;
        if (elY) elY.value = topPct;
        if (elW) elW.value = widthPct;
        if (elH) elH.value = heightPct;
    };

    updateInputs(currObj, 'curr');
    updateInputs(nextObj, 'next');
}

function bindMonitorCanvasEvents() {
    if (!canvas) return;
    canvas.off('object:moving');
    canvas.off('object:scaling');

    const constrain = (e) => {
        const obj = e.target;
        if (!obj || !obj.monitorRole) return;

        obj.setCoords();
        const actualW = obj.width * (obj.scaleX || 1);
        const actualH = obj.height * (obj.scaleY || 1);

        if (obj.left < 0) obj.left = 0;
        if (obj.top < 0) obj.top = 0;
        if (obj.left + actualW > 1920) obj.left = 1920 - actualW;
        if (obj.top + actualH > 1080) obj.top = 1080 - actualH;

        syncMonitorNumericInputs();
    };

    canvas.on('object:moving', constrain);
    canvas.on('object:scaling', constrain);
}

function createMonitorRectBox(role, sampleText, left, top, width, height, bgColor, textColor, strokeColor) {
    return new fabric.Rect({
        left: left,
        top: top,
        width: width,
        height: height,
        fill: bgColor,
        stroke: strokeColor,
        strokeWidth: 4,
        rx: 16,
        ry: 16,
        cornerColor: strokeColor,
        cornerSize: 14,
        cornerStyle: 'circle',
        transparentCorners: false,
        lockRotation: true,
        hasRotatingPoint: false,
        monitorRole: role,
        id: `monitor_${role}_box`,
        sampleText: sampleText,
        textColor: textColor
    });
}

function loadMonitorCanvasToEditor() {
    if (!canvas) return;
    try {
        canvas.clear();
        canvas.backgroundColor = '#0b0f17';

        const saved = JSON.parse(localStorage.getItem("subcast_monitor_settings") || "{}");

        // 성경 구절 옵션 및 색상 피커 초기화
        const bibleVal = saved.bibleMode || "summary";
        const bibleRadio = document.querySelector(`input[name="ed-monitor-bible"][value="${bibleVal}"]`);
        if (bibleRadio) bibleRadio.checked = true;

        const currentBg = saved.currentBox?.bgColor || saved.currentBg || "#1E1E1E";
        const currentTextColor = saved.currentBox?.textColor || saved.currentTextColor || "#FFFFFF";
        const nextBg = saved.nextBox?.bgColor || saved.nextBg || "#181818";
        const nextTextColor = saved.nextBox?.textColor || saved.nextTextColor || "#A0A0A0";

        if (document.getElementById("color-monitor-curr-bg")) document.getElementById("color-monitor-curr-bg").value = currentBg;
        if (document.getElementById("color-monitor-curr-text")) document.getElementById("color-monitor-curr-text").value = currentTextColor;
        if (document.getElementById("color-monitor-next-bg")) document.getElementById("color-monitor-next-bg").value = nextBg;
        if (document.getElementById("color-monitor-next-text")) document.getElementById("color-monitor-next-text").value = nextTextColor;

        // 좌표 안전 계산 (캔버스 1920x1080 내부로 제한)
        const sanitizeCoord = (valPct, defaultPct, maxPct) => {
            if (valPct === undefined || isNaN(valPct)) return defaultPct;
            return Math.max(0, Math.min(maxPct, valPct));
        };

        const cLeftPct = sanitizeCoord(saved.currentBox?.leftPct, 5, 90);
        const cTopPct = sanitizeCoord(saved.currentBox?.topPct, 5, 90);
        const cWidthPct = sanitizeCoord(saved.currentBox?.widthPct, 90, 95);
        const cHeightPct = Math.min(100 - cTopPct, sanitizeCoord(saved.currentBox?.heightPct, 42, 90));

        const nLeftPct = sanitizeCoord(saved.nextBox?.leftPct, 5, 90);
        const nTopPct = sanitizeCoord(saved.nextBox?.topPct, 51, 90);
        const nWidthPct = sanitizeCoord(saved.nextBox?.widthPct, 90, 95);
        const nHeightPct = Math.min(100 - nTopPct, sanitizeCoord(saved.nextBox?.heightPct, 42, 90));

        const cLeft = (cLeftPct / 100) * 1920;
        const cTop = (cTopPct / 100) * 1080;
        const cWidth = (cWidthPct / 100) * 1920;
        const cHeight = (cHeightPct / 100) * 1080;

        const nLeft = (nLeftPct / 100) * 1920;
        const nTop = (nTopPct / 100) * 1080;
        const nWidth = (nWidthPct / 100) * 1920;
        const nHeight = (nHeightPct / 100) * 1080;

        // 🔴 CURRENT 카드 및 🔵 NEXT 카드 생성 (Fabric.Rect)
        const currentBoxObj = createMonitorRectBox('current', '🔴 CURRENT (현재 송출 슬라이드)', cLeft, cTop, cWidth, cHeight, currentBg, currentTextColor, '#ef4444');
        const nextBoxObj = createMonitorRectBox('next', '🔵 NEXT (다음 슬라이드)', nLeft, nTop, nWidth, nHeight, nextBg, nextTextColor, '#3b82f6');

        canvas.add(currentBoxObj, nextBoxObj);
        bindMonitorCanvasEvents();
        canvas.setActiveObject(currentBoxObj);
        canvas.renderAll();
        syncMonitorNumericInputs();
    } catch(e) {
        console.error("Failed to load monitor canvas", e);
    }
}

function updateMonitorEditorSettings() {
    if (!canvas || !isMonitorEditMode) return;
    const currentBg = document.getElementById("color-monitor-curr-bg")?.value || "#1E1E1E";
    const currentTextColor = document.getElementById("color-monitor-curr-text")?.value || "#FFFFFF";
    const nextBg = document.getElementById("color-monitor-next-bg")?.value || "#181818";
    const nextTextColor = document.getElementById("color-monitor-next-text")?.value || "#A0A0A0";

    const currObj = canvas.getObjects().find(o => o.monitorRole === 'current');
    const nextObj = canvas.getObjects().find(o => o.monitorRole === 'next');

    if (currObj) {
        currObj.set({ fill: currentBg, textColor: currentTextColor });
    }
    if (nextObj) {
        nextObj.set({ fill: nextBg, textColor: nextTextColor });
    }
    canvas.renderAll();
}

function applyMonitorNumericInputs() {
    if (!canvas || !isMonitorEditMode) return;
    const currObj = canvas.getObjects().find(o => o.monitorRole === 'current');
    const nextObj = canvas.getObjects().find(o => o.monitorRole === 'next');

    const updateObjFromInputs = (obj, role) => {
        if (!obj) return;
        const xPct = parseFloat(document.getElementById(`num-monitor-${role}-x`)?.value) || 0;
        const yPct = parseFloat(document.getElementById(`num-monitor-${role}-y`)?.value) || 0;
        const wPct = parseFloat(document.getElementById(`num-monitor-${role}-w`)?.value) || 10;
        const hPct = parseFloat(document.getElementById(`num-monitor-${role}-h`)?.value) || 10;

        obj.set({
            left: (xPct / 100) * 1920,
            top: (yPct / 100) * 1080,
            width: (wPct / 100) * 1920,
            height: (hPct / 100) * 1080,
            scaleX: 1,
            scaleY: 1
        });
        obj.setCoords();
    };

    updateObjFromInputs(currObj, 'curr');
    updateObjFromInputs(nextObj, 'next');
    canvas.renderAll();
}

function alignMonitorCanvasBoxes(mode) {
    if (!canvas || !isMonitorEditMode) return;
    const currObj = canvas.getObjects().find(o => o.monitorRole === 'current');
    const nextObj = canvas.getObjects().find(o => o.monitorRole === 'next');

    if (!currObj || !nextObj) return;

    if (mode === 'swap') {
        const cLeft = currObj.left;
        const cTop = currObj.top;
        const cW = currObj.width * (currObj.scaleX || 1);
        const cH = currObj.height * (currObj.scaleY || 1);

        currObj.set({
            left: nextObj.left,
            top: nextObj.top,
            width: nextObj.width * (nextObj.scaleX || 1),
            height: nextObj.height * (nextObj.scaleY || 1),
            scaleX: 1, scaleY: 1
        });
        nextObj.set({
            left: cLeft,
            top: cTop,
            width: cW,
            height: cH,
            scaleX: 1, scaleY: 1
        });
    }
    canvas.renderAll();
    syncMonitorNumericInputs();
}

function saveMonitorSettingsFromEditor() {
    if (!canvas) return;
    try {
        const currObj = canvas.getObjects().find(o => o.monitorRole === 'current');
        const nextObj = canvas.getObjects().find(o => o.monitorRole === 'next');

        const bibleMode = document.querySelector('input[name="ed-monitor-bible"]:checked')?.value || "summary";
        const currentBg = document.getElementById("color-monitor-curr-bg")?.value || "#1E1E1E";
        const currentTextColor = document.getElementById("color-monitor-curr-text")?.value || "#FFFFFF";
        const nextBg = document.getElementById("color-monitor-next-bg")?.value || "#181818";
        const nextTextColor = document.getElementById("color-monitor-next-text")?.value || "#A0A0A0";

        const calcMetrics = (obj, defaultLeft, defaultTop, defaultW, defaultH) => {
            if (!obj) {
                return {
                    leftPct: defaultLeft,
                    topPct: defaultTop,
                    widthPct: defaultW,
                    heightPct: defaultH
                };
            }
            const actualW = obj.width * (obj.scaleX || 1);
            const actualH = obj.height * (obj.scaleY || 1);
            return {
                leftPct: Math.max(0, Math.min(95, Math.round(((obj.left) / 1920) * 1000) / 10)),
                topPct: Math.max(0, Math.min(95, Math.round(((obj.top) / 1080) * 1000) / 10)),
                widthPct: Math.max(5, Math.min(100, Math.round((actualW / 1920) * 1000) / 10)),
                heightPct: Math.max(5, Math.min(100, Math.round((actualH / 1080) * 1000) / 10))
            };
        };

        const currentMetrics = calcMetrics(currObj, 5, 5, 90, 42);
        const nextMetrics = calcMetrics(nextObj, 5, 51, 90, 42);

        const settings = {
            layoutMode: "custom_canvas",
            layout: "5:5",
            bibleMode,
            currentBg,
            currentTextColor,
            nextBg,
            nextTextColor,
            currentBox: {
                ...currentMetrics,
                bgColor: currentBg,
                textColor: currentTextColor
            },
            nextBox: {
                ...nextMetrics,
                bgColor: nextBg,
                textColor: nextTextColor
            }
        };

        localStorage.setItem("subcast_monitor_settings", JSON.stringify(settings));

        // 실시간 Multi-Tab / Multi-Window 전송 (BroadcastChannel & Storage Event)
        try {
            const bc = new BroadcastChannel("subcast_monitor_channel");
            bc.postMessage({ type: "MONITOR_SETTINGS_UPDATED", settings });
            bc.close();
        } catch(err) {}
        window.dispatchEvent(new CustomEvent("subcast_monitor_updated", { detail: settings }));

        if (typeof showToast === "function") {
            showToast("🖥️ 모니터링 레이아웃이 저장되었습니다!");
        } else {
            alert("🖥️ 모니터링 레이아웃이 저장되었습니다!");
        }
    } catch(e) {
        console.error("Failed to save monitor settings", e);
        if (typeof showToast === "function") {
            showToast("⚠️ 저장 중 오류가 발생했습니다.");
        }
    }
}

function resetMonitorCanvasLayout() {
    try {
        localStorage.removeItem("subcast_monitor_settings");
        loadMonitorCanvasToEditor();
        if (typeof showToast === "function") {
            showToast("🔄 모니터링 레이아웃이 기본값(5:5)으로 초기화되었습니다.");
        }
    } catch(e) {
        console.error("Failed to reset monitor canvas layout", e);
    }
}

function restoreNormalCanvas() {
    if (!canvas) return;
    try {
        canvas.off('object:moving');
        canvas.off('object:scaling');
        canvas.clear();
        if (typeof renderCurrentSlide === "function") {
            renderCurrentSlide();
        } else if (typeof renderSlideToCanvas === "function" && typeof currentSlideIndex !== "undefined") {
            renderSlideToCanvas(currentSlideIndex);
        }
    } catch(e) {
        console.error("Failed to restore normal canvas", e);
    }
}




