// ==========================================================================
// Subcast Module: editor-init.js
// ==========================================================================





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
                    if (window.subcastMonitorEditor && window.subcastMonitorEditor.isMonitorMode && window.subcastMonitorEditor.isMonitorMode()) {
                        if (typeof window.subcastMonitorEditor.notifyMonitorChanged === 'function') {
                            window.subcastMonitorEditor.notifyMonitorChanged();
                        }
                    }
                }
            };

            document.getElementById("fontsize-editor").oninput = (e) => {
                if (currentEditingElement && (currentEditingElement.type === 'textbox' || currentEditingElement.type === 'text')) {
                    const pxSize = Math.max(1, parseInt(e.target.value, 10) || 24);
                    let curWidth = Math.min(BASE_WIDTH * 0.95, currentEditingElement.width * (currentEditingElement.scaleX || 1));
                    if (curWidth <= 10) curWidth = BASE_WIDTH * 0.9;

                    currentEditingElement.set({
                        fontSize: pxSize,
                        scaleX: 1,
                        scaleY: 1,
                        width: curWidth,
                        splitByGrapheme: true
                    });
                    canvas.renderAll();
                    if (window.subcastMonitorEditor && window.subcastMonitorEditor.isMonitorMode && window.subcastMonitorEditor.isMonitorMode()) {
                        if (typeof window.subcastMonitorEditor.notifyMonitorChanged === 'function') {
                            window.subcastMonitorEditor.notifyMonitorChanged();
                        }
                    }
                }
            };
            document.getElementById("fontsize-editor").onchange = () => {
                saveStateToHistory();
            };

            const textLhInput = document.getElementById("text-lineheight");
            if (textLhInput) {
                textLhInput.oninput = (e) => {
                    if (currentEditingElement && (currentEditingElement.type === 'textbox' || currentEditingElement.type === 'text')) {
                        const lh = Math.max(0.8, Math.min(3.0, parseFloat(e.target.value) || 1.35));
                        currentEditingElement.set({ lineHeight: lh });
                        canvas.renderAll();
                        if (window.subcastMonitorEditor && window.subcastMonitorEditor.isMonitorMode && window.subcastMonitorEditor.isMonitorMode()) {
                            if (typeof window.subcastMonitorEditor.notifyMonitorChanged === 'function') {
                                window.subcastMonitorEditor.notifyMonitorChanged();
                            }
                        }
                    }
                };
                textLhInput.onchange = () => {
                    saveStateToHistory();
                };
            }

            // 속성 패널 접기 / 동그라미 아이콘 복원 토글
            const btnMinimizeInspector = document.getElementById("btn-minimize-inspector");
            const btnRestoreInspector = document.getElementById("btn-restore-inspector");
            const rightInspectorPanel = document.querySelector(".right-inspector-panel");

            if (btnMinimizeInspector && rightInspectorPanel && btnRestoreInspector) {
                btnMinimizeInspector.onclick = (e) => {
                    if (e) e.stopPropagation();
                    rightInspectorPanel.classList.add("collapsed");
                    btnRestoreInspector.style.display = "flex";
                };
                btnRestoreInspector.onclick = (e) => {
                    if (e) e.stopPropagation();
                    rightInspectorPanel.classList.remove("collapsed");
                    btnRestoreInspector.style.display = "none";
                };
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
                    if (window.subcastMonitorEditor && window.subcastMonitorEditor.isMonitorMode && window.subcastMonitorEditor.isMonitorMode()) {
                        if (typeof window.subcastMonitorEditor.saveMonitorStateToHistory === 'function') {
                            window.subcastMonitorEditor.saveMonitorStateToHistory();
                        }
                    }
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
                    currentEditingElement.set({ stroke: rgba, paintFirst: 'stroke' });
                    canvas.renderAll();
                    if (window.subcastMonitorEditor && window.subcastMonitorEditor.isMonitorMode && window.subcastMonitorEditor.isMonitorMode()) {
                        if (typeof window.subcastMonitorEditor.saveMonitorStateToHistory === 'function') {
                            window.subcastMonitorEditor.saveMonitorStateToHistory();
                        }
                    }
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

            // 텍스트 테두리 두께 조절 핸들러
            const textStrokeWidthInput = document.getElementById("text-strokewidth");
            if (textStrokeWidthInput) {
                textStrokeWidthInput.oninput = (e) => {
                    if (currentEditingElement && (currentEditingElement.type === 'textbox' || currentEditingElement.type === 'text')) {
                        const widthVal = parseInt(e.target.value) || 0;
                        currentEditingElement.set({ strokeWidth: widthVal, paintFirst: 'stroke' });
                        canvas.renderAll();
                        if (window.subcastMonitorEditor && window.subcastMonitorEditor.isMonitorMode && window.subcastMonitorEditor.isMonitorMode()) {
                            if (typeof window.subcastMonitorEditor.saveMonitorStateToHistory === 'function') {
                                window.subcastMonitorEditor.saveMonitorStateToHistory();
                            }
                        }
                    }
                };
                textStrokeWidthInput.onchange = () => saveStateToHistory();
            }

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

            // 텍스트 그림자 적용 체크박스 및 컨트롤 핸들러
            const shadowEnabledInput = document.getElementById("text-shadow-enabled");
            if (shadowEnabledInput) {
                shadowEnabledInput.onchange = (e) => {
                    if (!currentEditingElement || (currentEditingElement.type !== 'textbox' && currentEditingElement.type !== 'text')) return;
                    const isChecked = e.target.checked;
                    const shadowControls = document.getElementById("text-shadow-controls");
                    if (isChecked) {
                        const color = document.getElementById("text-shadow-color").value || "#000000";
                        const opacity = document.getElementById("text-shadow-color-opacity").value || 100;
                        const blur = parseInt(document.getElementById("text-shadow-blur").value) || 5;
                        const offsetX = parseInt(document.getElementById("text-shadow-offsetx").value) || 3;
                        const offsetY = parseInt(document.getElementById("text-shadow-offsety").value) || 3;
                        const rgba = hexAndOpacityToRgba(color, opacity);

                        currentEditingElement.set('shadow', new fabric.Shadow({
                            color: rgba,
                            blur: blur,
                            offsetX: offsetX,
                            offsetY: offsetY
                        }));

                        if (shadowControls) {
                            shadowControls.style.opacity = "1";
                            shadowControls.style.pointerEvents = "auto";
                        }
                        ['text-shadow-color', 'text-shadow-color-hex', 'text-shadow-color-opacity', 'text-shadow-blur', 'text-shadow-offsetx', 'text-shadow-offsety'].forEach(id => {
                            const el = document.getElementById(id);
                            if (el) el.disabled = false;
                        });
                    } else {
                        currentEditingElement.set('shadow', null);
                        if (shadowControls) {
                            shadowControls.style.opacity = "0.5";
                            shadowControls.style.pointerEvents = "none";
                        }
                        ['text-shadow-color', 'text-shadow-color-hex', 'text-shadow-color-opacity', 'text-shadow-blur', 'text-shadow-offsetx', 'text-shadow-offsety'].forEach(id => {
                            const el = document.getElementById(id);
                            if (el) el.disabled = true;
                        });
                    }
                    canvas.renderAll();
                    saveStateToHistory();
                };
            }

            const updateTextShadowProps = () => {
                if (currentEditingElement && (currentEditingElement.type === 'textbox' || currentEditingElement.type === 'text') && currentEditingElement.shadow) {
                    const blur = parseInt(document.getElementById("text-shadow-blur").value) || 0;
                    const offsetX = parseInt(document.getElementById("text-shadow-offsetx").value) || 0;
                    const offsetY = parseInt(document.getElementById("text-shadow-offsety").value) || 0;
                    currentEditingElement.shadow.blur = blur;
                    currentEditingElement.shadow.offsetX = offsetX;
                    currentEditingElement.shadow.offsetY = offsetY;
                    canvas.renderAll();
                }
            };

            ['text-shadow-blur', 'text-shadow-offsetx', 'text-shadow-offsety'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.oninput = () => updateTextShadowProps();
                    el.onchange = () => saveStateToHistory();
                }
            });

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
            const alignLeftBtn = document.getElementById("btn-align-element-left");
            const alignCenterHBtn = document.getElementById("btn-align-center-h");
            const alignRightBtn = document.getElementById("btn-align-element-right");
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
            const btnDeleteEl = document.getElementById("btn-delete");
            if (btnDeleteEl) btnDeleteEl.onclick = deleteElement;

            // 키보드 단축키 및 클립보드 이벤트 리스너 초기화 (editor-shortcuts.js)
            initKeyboardShortcuts();
            initPasteListener();

            // 저장/취소 리스너
            document.getElementById("btn-save").onclick = saveSlideData;
            document.getElementById("btn-cancel").onclick = cancelEditing;

            // 우측 인스펙터 패널 드래그 이동 활성화
            const inspectorPanel = document.querySelector(".right-inspector-panel");
            const inspectorHeader = document.querySelector(".right-inspector-panel .panel-header");
            if (inspectorPanel && inspectorHeader) {
                makeElementDraggable(inspectorPanel, inspectorHeader);
            }

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

