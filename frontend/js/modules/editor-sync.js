// ==========================================================================
// Subcast Module: editor-sync.js
// ==========================================================================

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


        function releaseActiveLock() {
            if (ws && ws.readyState === WebSocket.OPEN && activeSlideId) {
                ws.send(JSON.stringify({ type: "UNLOCK_SLIDE", slideId: activeSlideId }));
            }
        }


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
            if (window.subcastMonitorEditor && window.subcastMonitorEditor.isMonitorMode && window.subcastMonitorEditor.isMonitorMode()) return;
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
            if (window.subcastMonitorEditor && window.subcastMonitorEditor.isMonitorMode && window.subcastMonitorEditor.isMonitorMode()) return;
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


