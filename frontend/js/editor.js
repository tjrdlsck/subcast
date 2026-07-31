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
            if (!activeSlideId || !projectData || isMonitorEditMode) return;
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
            if (isUndoingRedoing || isMonitorEditMode) return;
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
                if (activeObj.scaleX && activeObj.scaleX !== 1) {
                    const newFontSize = Math.round(activeObj.fontSize * activeObj.scaleX);
                    const newWidth = Math.round(activeObj.width * activeObj.scaleX);
                    activeObj.set({
                        fontSize: newFontSize,
                        width: newWidth,
                        scaleX: 1,
                        scaleY: 1
                    });
                }
                activeObj.originalVwSize = `${((activeObj.fontSize / BASE_WIDTH) * 100).toFixed(2)}vw`;
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

        function saveAsTemplate() {
            if (!activeSlideId || !canvas || isMonitorEditMode) return;
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

