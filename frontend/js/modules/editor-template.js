// ==========================================================================
// Subcast Module: editor-template.js
// ==========================================================================

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


