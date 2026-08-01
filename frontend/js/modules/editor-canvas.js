// ==========================================================================
// Subcast Module: editor-canvas.js
// ==========================================================================

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
            ['btn-layer-up', 'btn-layer-down', 'btn-layer-front', 'btn-layer-back', 'btn-delete'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.disabled = false;
            });

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
                const alignBtnIds = ["btn-align-element-left", "btn-align-center-h", "btn-align-element-right", "btn-align-top", "btn-align-center-v", "btn-align-bottom"];
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
                document.getElementById("fontsize-editor").value = Math.round(activeObj.fontSize || 24);

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
                const alignBtnIds = ["btn-align-element-left", "btn-align-center-h", "btn-align-element-right", "btn-align-top", "btn-align-center-v", "btn-align-bottom"];
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
                const fontSizeEl = document.getElementById("fontsize-editor");
                if (fontSizeEl) fontSizeEl.value = Math.round(activeObj.fontSize || 24);
            }
        }


        function cancelEditing() { if (activeSlideId) loadSlideToCanvas(activeSlideId); }



