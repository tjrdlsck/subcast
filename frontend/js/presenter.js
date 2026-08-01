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
        let currentLiveIndex = -1;
        let selectedSlideId = null;
        let canvas = null;
        let targetWidth = 1920;
        let targetHeight = 1080;

        // 백그라운드에서 썸네일을 자동 생성하는 함수
        function autoGenerateThumbnail(slide) {
            if (slide.thumbnail) return Promise.resolve(slide.thumbnail);

            return new Promise((resolve) => {
                // 1. fabric.StaticCanvas용 임시 캔버스 생성 및 요소 렌더링
                const fabricCanvasEl = document.createElement('canvas');
                fabricCanvasEl.width = 768;
                fabricCanvasEl.height = 432;

                const tempCanvas = new fabric.StaticCanvas(fabricCanvasEl, {
                    backgroundColor: '#000000'
                });

                slide.elements.forEach(elem => {
                    const obj = deserializeElement(elem, 768, 432);
                    if (obj) tempCanvas.add(obj);
                });

                tempCanvas.renderAll();

                // 2. 최종 출력용 캔버스에 검정 배경을 먼저 확실히 칠한 뒤
                //    fabric 렌더링 결과를 그 위에 합성 (fabric의 backgroundColor 미적용 버그 방지)
                const outputCanvasEl = document.createElement('canvas');
                outputCanvasEl.width = 768;
                outputCanvasEl.height = 432;
                const ctx = outputCanvasEl.getContext('2d');
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, 768, 432);
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

        // 캔버스 초기화
        function initCanvas() {
            if (!document.getElementById('presenter-preview-canvas')) return;
            if (canvas) {
                canvas.dispose();
            }

            // 프리뷰는 상호작용이 없는 StaticCanvas를 사용
            canvas = new fabric.StaticCanvas('presenter-preview-canvas', {
                width: 480,
                height: 270,
                backgroundColor: '#000000'
            });

            updateCanvasDimensions();
        }

        // 창 크기나 프리뷰 영역 크기에 맞춰 캔버스 크기 조정
        function updateCanvasDimensions() {
            if (!canvas) return;

            const previewScreen = document.querySelector(".preview-screen");
            if (!previewScreen) return;

            const rect = previewScreen.getBoundingClientRect();
            // 종횡비 유지를 위해 width 기준으로 height 조절하거나 16:9 비율 유지
            const w = rect.width;
            const h = rect.width * (9 / 16);

            canvas.setWidth(w);
            canvas.setHeight(h);

            // 캔버스 요소를 중앙에 정렬하기 위해 컨테이너 마진 설정
            const canvasEl = canvas.getElement().parentNode;
            if (canvasEl) {
                canvasEl.style.width = `${w}px`;
                canvasEl.style.height = `${h}px`;
            }

            renderCurrentLiveSlide();
        }

        // 공용 역직렬화 (Deserialize) 함수: 백분율 데이터를 Fabric 객체로 변환
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
                    fontSize = match ? (parseFloat(match[1]) / 100) * (isInsideGroup ? groupW : canvasWidth) : parseInt(elem.style.fontSize) || 20;
                }
                // Textbox를 사용하여 w 너비 기준 자동 줄바꿈(Word Wrap) 지원
                const textOptions = {
                    left: x,
                    top: y,
                    width: w > 50 ? w : 250,
                    fontSize: fontSize,
                    fill: elem.style?.fontColor || '#ffffff',
                    stroke: elem.style?.strokeColor || 'transparent',
                    strokeWidth: elem.style?.strokeWidth !== undefined ? elem.style.strokeWidth : 0,
                    fontFamily: elem.style?.fontFamily || 'Inter',
                    fontWeight: elem.style?.fontWeight || 'normal',
                    fontStyle: elem.style?.fontStyle || 'normal',
                    textAlign: elem.style?.textAlign || 'left',
                    opacity: opacity,
                    selectable: false,
                    paintFirst: 'stroke'
                };
                obj = isInsideGroup ?
                    new fabric.Text(elem.content, textOptions) :
                    new fabric.Textbox(elem.content, Object.assign(textOptions, { splitByGrapheme: false }));
            } else if (elem.type === 'rect') {
                obj = new fabric.Rect({ left: x, top: y, width: w, height: h, rx: elem.style?.cornerRadius || 0, ry: elem.style?.cornerRadius || 0, fill: elem.style?.fillColor || '#4f46e5', stroke: elem.style?.strokeColor || 'transparent', strokeWidth: elem.style?.strokeWidth !== undefined ? (elem.style.strokeWidth / 1920) * canvasWidth : 0, opacity: opacity, selectable: false });
            } else if (elem.type === 'circle') {
                obj = new fabric.Circle({ left: x, top: y, radius: w / 2 || 30, fill: elem.style?.fillColor || '#06b6d4', stroke: elem.style?.strokeColor || 'transparent', strokeWidth: elem.style?.strokeWidth !== undefined ? (elem.style.strokeWidth / 1920) * canvasWidth : 0, opacity: opacity, selectable: false });
            } else if (elem.type === 'triangle') {
                obj = new fabric.Triangle({ left: x, top: y, width: w, height: h, fill: elem.style?.fillColor || '#10b981', stroke: elem.style?.strokeColor || 'transparent', strokeWidth: elem.style?.strokeWidth !== undefined ? (elem.style.strokeWidth / 1920) * canvasWidth : 0, opacity: opacity, selectable: false });
            } else if (elem.type === 'line') {
                obj = new fabric.Line([x, y, x + w, y], { stroke: elem.style?.fillColor || elem.style?.strokeColor || '#f59e0b', strokeWidth: elem.style?.strokeWidth !== undefined && elem.style?.strokeWidth > 0 ? (elem.style.strokeWidth / 1920) * canvasWidth : 4, opacity: opacity, selectable: false });
            } else if (elem.type === 'group' && elem.children) {
                const members = elem.children.map(child => deserializeElement(child, canvasWidth, canvasHeight, true, w, h));
                obj = new fabric.Group(members, { left: x, top: y, opacity: opacity, selectable: false });
            }
            return obj;
        }

        // 현재 라이브 슬라이드 그리기
        function renderCurrentLiveSlide() {
            if (!canvas || !projectData) return;

            canvas.clear();

            const currentLiveSlideId = projectData.settings?.currentLiveSlideId;
            if (!currentLiveSlideId) return;

            const currentSlide = projectData.slides.find(s => s.id === currentLiveSlideId);
            if (!currentSlide) return;

            // 절대 해상도(targetWidth, targetHeight)를 기준으로 렌더링하고 setZoom으로 배율을 맞춥니다.
            const scale = canvas.getWidth() / targetWidth;
            canvas.setZoom(scale);

            currentSlide.elements.forEach(elem => {
                const obj = deserializeElement(elem, targetWidth, targetHeight);
                if (obj) {
                    canvas.add(obj);
                }
            });

            canvas.renderAll();
        }

        // UI 갱신
        function renderDeck() {
            const listEl = document.getElementById("slide-list");
            listEl.innerHTML = "";

            if (!projectData || !projectData.slides) return;

            document.getElementById("slide-count").innerText = `${projectData.slides.length} Slides`;

            // 상단 LIVE 배지 아이콘 상태 및 클릭 이벤트 업데이트
            const liveBadge = document.getElementById("live-status-badge");
            const hasLiveSlide = !!projectData.settings?.currentLiveSlideId;
            if (liveBadge) {
                liveBadge.style.cursor = "pointer";
                if (hasLiveSlide) {
                    liveBadge.classList.add("on");
                } else {
                    liveBadge.classList.remove("on");
                }
                liveBadge.onclick = () => {
                    if (hasLiveSlide) {
                        // 송출 중일 때는 송출 끄기 (OFF)
                        changeSlide(null);
                    } else {
                        // 송출 OFF일 때는 현재 선택된(초록색) 슬라이드를 송출 (LIVE ON)
                        if (selectedSlideId) {
                            changeSlide(selectedSlideId);
                        } else if (projectData.slides.length > 0) {
                            changeSlide(projectData.slides[0].id);
                        }
                    }
                };
            }

            projectData.slides.forEach((slide, index) => {
                const item = document.createElement("div");
                item.className = "slide-item";
                item.id = `slide-item-${slide.id}`;

                const isLive = slide.id === projectData.settings?.currentLiveSlideId;
                const isSelected = slide.id === selectedSlideId;

                if (isLive) {
                    item.classList.add("live");
                    currentLiveIndex = index;
                } else if (isSelected) {
                    item.classList.add("selected");
                }

                const isLocked = lockedSlides[slide.id] !== undefined;
                if (isLocked) {
                    item.classList.add("locked");
                }

                // 배지 색상 구분: LIVE면 빨간색, Selected(대기)면 초록색, 기본 보라색
                let badgeBg = "var(--primary)";
                let badgeShadow = "0 2px 5px rgba(0,0,0,0.5)";
                if (isLive) {
                    badgeBg = "var(--accent-live)";
                    badgeShadow = "0 0 8px var(--accent-live-glow)";
                } else if (isSelected) {
                    badgeBg = "var(--green-online)";
                    badgeShadow = "0 0 8px rgba(16, 185, 129, 0.5)";
                }

                item.innerHTML = `
                    <!-- 슬라이드 순번 배지 -->
                    <div style="position: absolute; top: -8px; left: -8px; background: ${badgeBg}; color: #fff; font-size: 0.7rem; font-weight: 800; min-width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; border-radius: 50%; border: 1.5px solid var(--bg-color); z-index: 20; font-family: 'Outfit', sans-serif; box-shadow: ${badgeShadow};">
                        ${index + 1}
                    </div>
                    <div class="slide-thumbnail-wrapper">
                        ${slide.thumbnail ? `<img src="${slide.thumbnail}">` : `<span style="font-size: 0.72rem; color: var(--text-muted);">미리보기 없음</span>`}
                    </div>
                    ${isLocked ? `<div class="slide-lock-indicator">🔒 ${lockedSlides[slide.id] || ''} 편집 중</div>` : ''}
                `;

                // 클릭 시 슬라이드 선택 (LIVE ON 상태이면 클릭 시 즉시 라이브 전환!)
                item.onclick = () => {
                    selectedSlideId = slide.id;
                    if (projectData.settings?.currentLiveSlideId) {
                        changeSlide(slide.id);
                    } else {
                        renderDeck();
                    }
                };

                listEl.appendChild(item);
            });

            // 상단 퀵 네비게이션 인디케이터 업데이트
            const indicatorEl = document.getElementById("slide-indicator");
            if (indicatorEl) {
                indicatorEl.innerText = `${currentLiveIndex !== -1 ? String(currentLiveIndex + 1).padStart(2, '0') : '00'} / ${String(projectData.slides.length).padStart(2, '0')}`;
            }

            // 피어 스크롤 동기화 (활성 슬라이드로 자동 스크롤)
            const activeItem = document.querySelector(".slide-item.live");
            if (activeItem) {
                activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }

            // 라이브 프리뷰 업데이트
            renderCurrentLiveSlide();
        }

        // 슬라이드 전환 명령 송신
        function changeSlide(slideId) {
            if (!ws || ws.readyState !== WebSocket.OPEN) return;
            ws.send(JSON.stringify({
                type: "SLIDE_CHANGE",
                slideId: slideId
            }));

            if (projectData && projectData.slides) {
                const targetSlide = projectData.slides.find(s => s.id === slideId);
                if (targetSlide) {
                    ws.send(JSON.stringify({
                        type: "SELECT_STAGE_BACKGROUND_BY_MOOD",
                        slideMood: targetSlide.mood || (targetSlide.moods && targetSlide.moods[0]) || "기본/일반",
                        slideMoods: targetSlide.moods || (targetSlide.mood ? [targetSlide.mood] : ["기본/일반"]),
                        overrideBgId: targetSlide.overrideBgId || null
                    }));
                }
            }
        }

        // 이전/다음 슬라이드 전환
        function navigateSlide(direction) {
            if (!projectData || !projectData.slides) return;
            const len = projectData.slides.length;
            if (len === 0) return;

            let baseIdx = currentLiveIndex !== -1 ? currentLiveIndex : projectData.slides.findIndex(s => s.id === selectedSlideId);
            if (baseIdx === -1) baseIdx = 0;

            let nextIdx = baseIdx;
            if (direction === 'next') {
                nextIdx = (baseIdx + 1) % len;
            } else if (direction === 'prev') {
                nextIdx = (baseIdx - 1 + len) % len;
            }

            const targetSlideId = projectData.slides[nextIdx].id;
            selectedSlideId = targetSlideId;

            if (projectData.settings?.currentLiveSlideId) {
                changeSlide(targetSlideId);
            } else {
                renderDeck();
            }
        }

        // 웹소켓 연결
        function connectWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws?role=presenter`;

            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                const badge = document.getElementById("status-badge");
                badge.classList.add("connected");
                document.getElementById("status-text").innerText = "Connected";
            };

            ws.onmessage = (event) => {
                const message = JSON.parse(event.data);

                if (message.type === 'INITIAL_SYNC') {
                    projectData = message.data;
                    lockedSlides = message.lockedSlides || {};

                    if (projectData.settings) {
                        document.getElementById("width-input").value = projectData.settings.targetWidth || 1920;
                        document.getElementById("height-input").value = projectData.settings.targetHeight || 1080;
                        const stageWInput = document.getElementById("stage-width-input");
                        const stageHInput = document.getElementById("stage-height-input");
                        if (stageWInput) stageWInput.value = projectData.settings.stageTargetWidth || 1920;
                        if (stageHInput) stageHInput.value = projectData.settings.stageTargetHeight || 1080;

                        targetWidth = projectData.settings.targetWidth || 1920;
                        targetHeight = projectData.settings.targetHeight || 1080;

                        const bgMode = projectData.settings.backgroundMode || "transparent";
                        const radioEl = document.getElementById(`bg-${bgMode}`);
                        if (radioEl) radioEl.checked = true;
                    }
                    initCanvas();
                    renderDeck();

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
                            renderDeck();
                        });
                    }
                }
                else if (message.type === 'SET_BACKGROUND_MODE') {
                    if (projectData && projectData.settings) {
                        projectData.settings.backgroundMode = message.mode;
                    }
                    const radioEl = document.getElementById(`bg-${message.mode}`);
                    if (radioEl) radioEl.checked = true;
                }
                else if (message.type === 'SLIDE_CHANGE') {
                    if (projectData) {
                        projectData.settings.currentLiveSlideId = message.slideId;
                        if (message.slideId) {
                            selectedSlideId = message.slideId;
                        }
                        renderDeck();
                    }
                }
                else if (message.type === 'UPDATE_RESOLUTION') {
                    document.getElementById("width-input").value = message.width;
                    document.getElementById("height-input").value = message.height;
                    targetWidth = message.width;
                    targetHeight = message.height;
                    updateCanvasDimensions();
                }
                else if (message.type === 'UPDATE_STAGE_RESOLUTION') {
                    const stageWInput = document.getElementById("stage-width-input");
                    const stageHInput = document.getElementById("stage-height-input");
                    if (stageWInput) stageWInput.value = message.width;
                    if (stageHInput) stageHInput.value = message.height;
                }
                else if (message.type === 'SLIDE_LOCKED') {
                    lockedSlides[message.slideId] = message.editorName;
                    renderDeck();
                }
                else if (message.type === 'SLIDE_UNLOCKED') {
                    delete lockedSlides[message.slideId];
                    renderDeck();
                }
                else if (message.type === 'SLIDE_UPDATED') {
                    // 슬라이드 데이터 변경 감지 (Presenter 화면에서도 미리보기 조용히 갱신)
                    if (projectData) {
                        const idx = projectData.slides.findIndex(s => s.id === message.slideId);
                        if (idx !== -1) {
                            projectData.slides[idx] = message.slide;
                        } else {
                            projectData.slides.push(message.slide);
                        }
                        renderDeck();
                    }
                }
            };

            ws.onclose = () => {
                const badge = document.getElementById("status-badge");
                badge.classList.remove("connected");
                document.getElementById("status-text").innerText = "Disconnected";
                setTimeout(connectWebSocket, 3000);
            };
        }

        window.onload = () => {
            connectWebSocket();

            // 설정 모달 제어 이벤트 바인딩
            const modal = document.getElementById("settings-modal");
            const openBtn = document.getElementById("btn-open-settings");
            const closeBtn = document.getElementById("btn-close-settings");

            if (openBtn && modal) {
                openBtn.onclick = () => modal.classList.add("active");
            }
            if (closeBtn && modal) {
                closeBtn.onclick = () => modal.classList.remove("active");
            }
            if (modal) {
                modal.onclick = (e) => {
                    if (e.target === modal) {
                        modal.classList.remove("active");
                    }
                };
            }

            // Ctrl + 마우스 휠로 슬라이드 격자 확대/축소 및 반응형 열 동적 조절
            let cardMinWidth = 220;
            const MIN_CARD_WIDTH = 120;
            const MAX_CARD_WIDTH = 500;

            const workspaceEl = document.querySelector(".workspace");
            if (workspaceEl) {
                workspaceEl.addEventListener("wheel", (e) => {
                    if (e.ctrlKey) {
                        e.preventDefault();
                        if (e.deltaY < 0) {
                            // 휠 위로: 확대 (카드 크기 증가, 열 감소)
                            cardMinWidth = Math.min(MAX_CARD_WIDTH, cardMinWidth + 16);
                        } else if (e.deltaY > 0) {
                            // 휠 아래로: 축소 (카드 크기 감소, 빈 공간만큼 열 자동 증가)
                            cardMinWidth = Math.max(MIN_CARD_WIDTH, cardMinWidth - 16);
                        }
                        document.documentElement.style.setProperty("--card-min-width", `${cardMinWidth}px`);
                    }
                }, { passive: false });
            }

            // 이전/다음 버튼 리스너
            const btnPrev = document.getElementById("btn-prev");
            if (btnPrev) btnPrev.onclick = () => navigateSlide('prev');
            const btnNext = document.getElementById("btn-next");
            if (btnNext) btnNext.onclick = () => navigateSlide('next');

            // 해상도 및 배경 모드 전송 버튼 리스너
            document.getElementById("btn-apply-res").onclick = () => {
                const w = parseInt(document.getElementById("width-input").value) || 1920;
                const h = parseInt(document.getElementById("height-input").value) || 1080;
                const stageWInput = document.getElementById("stage-width-input");
                const stageHInput = document.getElementById("stage-height-input");
                const stageW = stageWInput ? (parseInt(stageWInput.value) || 1920) : 1920;
                const stageH = stageHInput ? (parseInt(stageHInput.value) || 1080) : 1080;

                if (ws && ws.readyState === WebSocket.OPEN) {
                    // 1. OBS 해상도 설정 전송
                    ws.send(JSON.stringify({
                        type: "UPDATE_RESOLUTION",
                        width: w,
                        height: h
                    }));

                    // 2. 현장 모니터 해상도 설정 전송
                    ws.send(JSON.stringify({
                        type: "UPDATE_STAGE_RESOLUTION",
                        width: stageW,
                        height: stageH
                    }));

                    // 3. 배경 설정 전송
                    const checkedRadio = document.querySelector('input[name="bg-mode"]:checked');
                    if (checkedRadio) {
                        ws.send(JSON.stringify({
                            type: "SET_BACKGROUND_MODE",
                            mode: checkedRadio.value
                        }));
                    }
                }
                if (modal) {
                    modal.classList.remove("active");
                }
            };

            // 키보드 단축키
            window.onkeydown = (e) => {
                const activeEl = document.activeElement;
                if (activeEl && activeEl.tagName === 'INPUT') return; // 입력 필드 조작 중인 경우 무시

                if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
                    e.preventDefault();
                    navigateSlide('next');
                } else if (e.key === 'ArrowLeft' || e.key === 'Backspace' || e.key === 'PageUp') {
                    e.preventDefault();
                    navigateSlide('prev');
                }
            };

            // 리사이즈 이벤트 연결
            window.addEventListener('resize', updateCanvasDimensions);
        };
