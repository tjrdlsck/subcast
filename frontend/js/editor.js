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




        let autoSaveTimeoutId = null;











        let isUpdatingLayerList = false;










        function layerUp() { if (currentEditingElement) { canvas.bringForward(currentEditingElement); canvas.renderAll(); saveStateToHistory(); } }
        function layerDown() { if (currentEditingElement) { canvas.sendBackwards(currentEditingElement); canvas.renderAll(); saveStateToHistory(); } }
        function layerFront() { if (currentEditingElement) { canvas.bringToFront(currentEditingElement); canvas.renderAll(); saveStateToHistory(); } }



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



        let modalSelectedSlideIds = [];
        let modalLastCheckedIndex = -1;






        let selectedTemplateIds = [];
        let lastSelectedTemplateId = null;




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



        }


