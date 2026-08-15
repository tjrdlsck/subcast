// CanvasTextBaseline 패치: 브라우저 확장 프로그램 등에서 'alphabetical'을 넣어 발생하는 경고 우회
        (function() {
            if (typeof CanvasRenderingContext2D !== 'undefined') {
                const descriptor = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'textBaseline');
                if (descriptor && descriptor.set) {
                    const originalSet = descriptor.set;
                    Object.defineProperty(CanvasRenderingContext2D.prototype, 'textBaseline', {
                        set: function(value) {
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

        let canvas = null;
        let ws = null;
        let projectData = null;
        let targetWidth = 1920;
        let targetHeight = 1080;

        // 캔버스 초기화
        function initCanvas() {
            if (canvas) {
                canvas.dispose();
            }

            const urlParams = new URLSearchParams(window.location.search);
            const channel = urlParams.get('channel');
            const isMonitor = urlParams.get('mode') === 'monitor' || channel === 'monitor' || channel === 'preview' || channel === 'monitor_preview';
            
            // 뷰어는 상호작용이 없는 StaticCanvas를 사용
            canvas = new fabric.StaticCanvas('viewer-canvas', {
                width: window.innerWidth,
                height: window.innerHeight,
                backgroundColor: isMonitor ? '#000000' : 'transparent'
            });

            if (isMonitor) {
                document.body.style.backgroundColor = '#000000';
            }
            
            updateCanvasDimensions();
        }

        // 창 크기에 비례하여 캔버스를 반응형으로 크기 조정하거나 
        // 설정된 해상도 비율(가로세로 비율)을 유지하도록 설정
        function updateCanvasDimensions() {
            if (!canvas) return;

            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;
            
            // 타겟 해상도 종횡비 유지 (Contain / Letterbox)
            const targetRatio = (targetWidth && targetHeight) ? (targetWidth / targetHeight) : (16 / 9);
            const windowRatio = windowWidth / windowHeight;
            
            let drawWidth, drawHeight;
            
            if (windowRatio > targetRatio) {
                // 창이 더 넓음 -> 높이에 맞춤
                drawHeight = windowHeight;
                drawWidth = windowHeight * targetRatio;
            } else {
                // 창이 더 좁음 -> 너비에 맞춤
                drawWidth = windowWidth;
                drawHeight = windowWidth / targetRatio;
            }

            canvas.setWidth(drawWidth);
            canvas.setHeight(drawHeight);

            // 캔버스 래퍼(.canvas-container)를 뷰포트 정중앙에 정확히 조율
            const canvasWrapper = canvas.getElement().parentNode;
            if (canvasWrapper && canvasWrapper.classList.contains('canvas-container')) {
                canvasWrapper.style.width = `${drawWidth}px`;
                canvasWrapper.style.height = `${drawHeight}px`;
                canvasWrapper.style.position = 'absolute';
                canvasWrapper.style.top = '50%';
                canvasWrapper.style.left = '50%';
                canvasWrapper.style.transform = 'translate(-50%, -50%)';
                canvasWrapper.style.margin = '0';
            }

            renderCurrentSlide();
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
                if (elem.style?.shadow) {
                    textOptions.shadow = new fabric.Shadow({
                        color: elem.style.shadow.color || '#000000',
                        blur: elem.style.shadow.blur || 0,
                        offsetX: elem.style.shadow.offsetX || 0,
                        offsetY: elem.style.shadow.offsetY || 0
                    });
                }
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

        // 슬라이드 렌더링
        function renderCurrentSlide() {
            if (!canvas || !projectData) return;

            const urlParams = new URLSearchParams(window.location.search);
            const channel = urlParams.get('channel');
            const isMonitor = urlParams.get('mode') === 'monitor' || channel === 'monitor' || channel === 'preview' || channel === 'monitor_preview';
            const isStage = channel === 'stage' || urlParams.get('mode') === 'stage';
            const isBroadcast = !isStage && !isMonitor;

            canvas.clear();

            if (isMonitor) {
                canvas.backgroundColor = '#000000';
                document.body.style.backgroundColor = '#000000';
            } else {
                canvas.backgroundColor = 'transparent';
            }

            const currentSlideId = projectData.settings?.currentLiveSlideId;
            if (!currentSlideId) return;

            const currentSlide = projectData.slides.find(s => s.id === currentSlideId);
            if (!currentSlide) return;

            // 반응형 줌 비율(Scale Ratio) 계산 및 캔버스 적용
            const scale = canvas.getWidth() / targetWidth;
            canvas.setZoom(scale);

            // 찬양 슬라이드 전용 판별 (찬양 가사 등록 또는 찬양 템플릿 슬라이드)
            const isPraise = !!(currentSlide && (
                currentSlide.slideType === 'praise' || 
                currentSlide.isPraise || 
                (currentSlide.id && typeof currentSlide.id === 'string' && currentSlide.id.startsWith('slide_praise_')) || 
                (currentSlide.name && typeof currentSlide.name === 'string' && (currentSlide.name.startsWith('찬양:') || currentSlide.name.startsWith('자막(템):') || currentSlide.name.startsWith('자막:'))) ||
                (currentSlide.elements && currentSlide.elements.some(e => e.id && typeof e.id === 'string' && e.id.startsWith('elem_praise_')))
            ));

            // 찬양 슬라이드의 방송 화면 송출 시: 사용자가 '방송 화면' 탭에서 커스텀한 레이아웃 적용
            if (isBroadcast && isPraise) {
                let savedLayout = projectData.settings?.praiseBroadcastLayout;
                if (!savedLayout) {
                    try {
                        const local = localStorage.getItem("subcast_praise_broadcast_layout");
                        if (local) savedLayout = JSON.parse(local);
                    } catch (e) {}
                }

                const layout = Object.assign({
                    x: 7.2,
                    y: 76.0,
                    width: 85.6,
                    height: 18.0,
                    fontSize: "3.5vw",
                    fontFamily: "Inter",
                    fontWeight: "700",
                    textAlign: "center",
                    fontColor: "#ffffff",
                    strokeColor: "#000000",
                    strokeWidth: 3,
                    hasBgBar: false,
                    bgBarColor: "rgba(0,0,0,0.65)",
                    bgBarY: 72.0,
                    bgBarHeight: 22.0
                }, savedLayout || {});

                // 1. 반투명 자막 바 (활성화된 경우)
                if (layout.hasBgBar) {
                    const barObj = deserializeElement({
                        id: "elem_praise_broadcast_bar",
                        type: "rect",
                        x: 0,
                        y: layout.bgBarY !== undefined ? layout.bgBarY : 72.0,
                        width: 100,
                        height: layout.bgBarHeight !== undefined ? layout.bgBarHeight : 22.0,
                        style: {
                            fillColor: layout.bgBarColor || "rgba(0,0,0,0.65)",
                            strokeColor: "transparent",
                            strokeWidth: 0,
                            opacity: 1.0
                        }
                    }, targetWidth, targetHeight);
                    if (barObj) canvas.add(barObj);
                }

                // 2. 가사 텍스트 재귀 추출 및 커스텀 위치/크기 렌더링
                function extractLyricText(elements) {
                    for (const e of elements) {
                        if (e.type === 'text' && e.content && e.content.trim().length > 0) {
                            return e.content;
                        }
                        if (e.type === 'group' && e.children) {
                            const found = extractLyricText(e.children);
                            if (found) return found;
                        }
                    }
                    return "";
                }

                const lyricContent = extractLyricText(currentSlide.elements || []);

                const lyricObj = deserializeElement({
                    id: "elem_praise_broadcast_lyric",
                    type: "text",
                    content: lyricContent,
                    x: layout.x,
                    y: layout.y,
                    width: layout.width,
                    height: layout.height,
                    style: {
                        fontSize: layout.fontSize || "3.5vw",
                        fontFamily: layout.fontFamily || "Inter",
                        fontWeight: layout.fontWeight || "700",
                        textAlign: layout.textAlign || "center",
                        fontColor: layout.fontColor || "#ffffff",
                        strokeColor: layout.strokeColor || "#000000",
                        strokeWidth: layout.strokeWidth !== undefined ? layout.strokeWidth : 3,
                        opacity: 1.0
                    }
                }, targetWidth, targetHeight);
                if (lyricObj) canvas.add(lyricObj);

            } else {
                // 일반 슬라이드, 성경 슬라이드 및 현장 화면(Stage): 슬라이드 원본 1:1 그대로 렌더링
                currentSlide.elements.forEach(elem => {
                    const obj = deserializeElement(elem, targetWidth, targetHeight);
                    if (obj) {
                        canvas.add(obj);
                    }
                });
            }

            canvas.renderAll();
        }

        // 웹소켓 연결
        function connectWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws?role=viewer`;

            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log("WebSocket connected as Viewer");
                document.body.classList.remove('system-disconnected');
            };

            ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                
                if (message.type === 'INITIAL_SYNC') {
                    projectData = message.data;
                    if (projectData.settings) {
                        const urlParams = new URLSearchParams(window.location.search);
                        const channel = urlParams.get('channel');
                        const isStageMode = channel === 'stage' || urlParams.get('mode') === 'stage';

                        if (isStageMode && projectData.settings.stageTargetWidth && projectData.settings.stageTargetHeight) {
                            targetWidth = projectData.settings.stageTargetWidth;
                            targetHeight = projectData.settings.stageTargetHeight;
                        } else {
                            targetWidth = projectData.settings.targetWidth || 1920;
                            targetHeight = projectData.settings.targetHeight || 1080;
                        }

                        const bgMode = projectData.settings.backgroundMode || 'transparent';
                        document.body.classList.toggle('chromakey-mode', bgMode === 'chromakey');
                        if (projectData.settings.stageBackground) {
                            applyStageBackground(projectData.settings.stageBackground);
                        }
                    }
                    updateCanvasDimensions();
                    updateMonitorFromProjectData();
                } 
                else if (message.type === 'SET_BACKGROUND_MODE') {
                    if (projectData && projectData.settings) {
                        projectData.settings.backgroundMode = message.mode;
                    }
                    document.body.classList.toggle('chromakey-mode', message.mode === 'chromakey');
                }
                else if (message.type === 'SET_STAGE_BACKGROUND') {
                    if (projectData && projectData.settings) {
                        projectData.settings.stageBackground = message.background;
                    }
                    applyStageBackground(message.background);
                }
                else if (message.type === 'SLIDE_CHANGE') {
                    if (projectData) {
                        projectData.settings.currentLiveSlideId = message.slideId;
                        renderCurrentSlide();
                        updateMonitorFromProjectData();
                    }
                } 
                else if (message.type === 'UPDATE_RESOLUTION') {
                    const urlParams = new URLSearchParams(window.location.search);
                    const channel = urlParams.get('channel');
                    const isStageMode = channel === 'stage' || urlParams.get('mode') === 'stage';
                    if (!isStageMode) {
                        targetWidth = message.width;
                        targetHeight = message.height;
                        updateCanvasDimensions();
                    }
                } 
                else if (message.type === 'UPDATE_STAGE_RESOLUTION') {
                    const urlParams = new URLSearchParams(window.location.search);
                    const channel = urlParams.get('channel');
                    const isStageMode = channel === 'stage' || urlParams.get('mode') === 'stage';
                    if (isStageMode) {
                        targetWidth = message.width;
                        targetHeight = message.height;
                        updateCanvasDimensions();
                    }
                } 
                else if (message.type === 'PRAISE_BROADCAST_LAYOUT_UPDATED') {
                    if (projectData && projectData.settings) {
                        projectData.settings.praiseBroadcastLayout = message.layout;
                        renderCurrentSlide();
                    }
                }
                else if (message.type === 'SLIDE_UPDATED') {
                    // 슬라이드 갱신 (송출 중인 라이브 슬라이드 갱신인 경우에만 렌더링)
                    if (projectData) {
                        const idx = projectData.slides.findIndex(s => s.id === message.slideId);
                        if (idx !== -1) {
                            projectData.slides[idx] = message.slide;
                        } else {
                            projectData.slides.push(message.slide);
                        }
                        
                        if (message.isLive) {
                            renderCurrentSlide();
                        }
                    }
                }
            };

            ws.onclose = () => {
                console.warn("WebSocket connection closed. Reconnecting...");
                document.body.classList.add('system-disconnected');
                if (canvas) {
                    canvas.clear();
                    canvas.renderAll();
                }
                setTimeout(connectWebSocket, 3000); // 3초 후 재연결 시도
            };

            ws.onerror = (error) => {
                console.error("WebSocket error:", error);
                document.body.classList.add('system-disconnected');
                if (canvas) {
                    canvas.clear();
                    canvas.renderAll();
                }
            };
        }

        let monitorFontSize = 125;
        let fontToastTimeout = null;

        function showFontToast(size) {
            let toast = document.getElementById("monitor-font-toast");
            if (!toast) {
                toast = document.createElement("div");
                toast.id = "monitor-font-toast";
                toast.style.cssText = `
                    position: fixed;
                    bottom: 24px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(17, 24, 39, 0.95);
                    color: #ffffff;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    padding: 8px 18px;
                    border-radius: 20px;
                    font-size: 0.88rem;
                    font-weight: 600;
                    z-index: 9999;
                    pointer-events: none;
                    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
                    transition: opacity 0.2s ease;
                `;
                document.body.appendChild(toast);
            }
            toast.innerText = `🔍 글꼴 크기: ${Math.round(size)}% (Ctrl+Wheel)`;
            toast.style.opacity = "1";

            if (fontToastTimeout) clearTimeout(fontToastTimeout);
            fontToastTimeout = setTimeout(() => {
                if (toast) toast.style.opacity = "0";
            }, 1200);
        }

        function updateMonitorFontSize() {
            const baseFontSize = (monitorFontSize / 100) * 1.8;
            document.documentElement.style.setProperty("--monitor-font-size", `${baseFontSize}rem`);
        }

        function saveCurrentMonitorFontSize() {
            try {
                const settings = JSON.parse(localStorage.getItem("subcast_monitor_settings") || "{}");
                settings.fontSize = Math.round(monitorFontSize).toString();
                localStorage.setItem("subcast_monitor_settings", JSON.stringify(settings));
            } catch (e) {
                console.error("Failed to save monitor font size", e);
            }
        }

        function applyStageBackground(bgConfig) {
            const urlParams = new URLSearchParams(window.location.search);
            const channel = urlParams.get('channel');
            const isStageMode = channel === 'stage' || urlParams.get('mode') === 'stage';
            if (!isStageMode) return;

            document.body.classList.add('stage-mode');

            let activeVideoIndex = window._activeStageVideoIndex || 1;
            const videoEl1 = document.getElementById('stage-video-bg-1');
            const videoEl2 = document.getElementById('stage-video-bg-2');
            const legacyVideoEl = document.getElementById('stage-video-bg');
            if (legacyVideoEl) legacyVideoEl.style.display = 'none';

            const motionCanvas = document.getElementById('stage-motion-bg');
            const opacityTarget = bgConfig && bgConfig.opacity !== undefined ? bgConfig.opacity : 0.8;
            const blurTarget = bgConfig && bgConfig.blur !== undefined ? bgConfig.blur : 0;

            if (!bgConfig || bgConfig.type === 'ambient') {
                [videoEl1, videoEl2].forEach(v => {
                    if (v) {
                        v.style.opacity = '0';
                        setTimeout(() => {
                            v.style.display = 'none';
                            v.pause();
                            v.removeAttribute('src');
                            v.load();
                        }, 800);
                    }
                });
                initStageMotionBg();
                if (motionCanvas) motionCanvas.style.display = 'block';
            } else if (bgConfig.type === 'video' && bgConfig.videoUrl) {
                if (motionCanvas) motionCanvas.style.display = 'none';
                
                const activeEl = activeVideoIndex === 1 ? videoEl1 : videoEl2;
                const nextEl = activeVideoIndex === 1 ? videoEl2 : videoEl1;
                if (!activeEl || !nextEl) return;

                const fullUrl = bgConfig.videoUrl.startsWith('http') ? bgConfig.videoUrl : window.location.origin + bgConfig.videoUrl;

                // 이미 동일한 영상이 재생 중인 경우
                if (activeEl.src === fullUrl && activeEl.style.display !== 'none' && parseFloat(activeEl.style.opacity) > 0) {
                    activeEl.style.filter = blurTarget > 0 ? `blur(${blurTarget}px)` : 'none';
                    activeEl.style.opacity = opacityTarget;
                    if (activeEl.paused) activeEl.play().catch(e => console.warn("Video play failed:", e));
                    return;
                }

                // 새로운 비디오로 디졸브 교체
                nextEl.style.display = 'block';
                nextEl.style.filter = blurTarget > 0 ? `blur(${blurTarget}px)` : 'none';
                
                const onCanPlay = () => {
                    nextEl.play().then(() => {
                        nextEl.style.opacity = opacityTarget;
                        activeEl.style.opacity = '0';
                        setTimeout(() => {
                            activeEl.style.display = 'none';
                            activeEl.pause();
                        }, 800);
                        window._activeStageVideoIndex = activeVideoIndex === 1 ? 2 : 1;
                    }).catch(e => console.warn("Video autoplay prevented:", e));
                };

                if (nextEl.src !== fullUrl) {
                    nextEl.src = bgConfig.videoUrl;
                    nextEl.load();
                    nextEl.addEventListener('canplay', onCanPlay, { once: true });
                } else {
                    onCanPlay();
                }
            }
        }

        function initStageMotionBg() {
            document.body.classList.add('stage-mode');
            if (document.getElementById('stage-motion-bg')) return;
            
            const bgCanvas = document.createElement('canvas');
            bgCanvas.id = 'stage-motion-bg';
            document.body.prepend(bgCanvas);
            
            const ctx = bgCanvas.getContext('2d');
            let width = bgCanvas.width = window.innerWidth;
            let height = bgCanvas.height = window.innerHeight;
            
            window.addEventListener('resize', () => {
                width = bgCanvas.width = window.innerWidth;
                height = bgCanvas.height = window.innerHeight;
            });

            const particles = Array.from({ length: 24 }, () => ({
                x: Math.random() * width,
                y: Math.random() * height,
                radius: Math.random() * 180 + 70,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                hue: Math.random() * 70 + 190,
                alpha: Math.random() * 0.28 + 0.08
            }));

            function animate() {
                ctx.clearRect(0, 0, width, height);
                particles.forEach(p => {
                    p.x += p.vx;
                    p.y += p.vy;
                    if (p.x < -p.radius) p.x = width + p.radius;
                    if (p.x > width + p.radius) p.x = -p.radius;
                    if (p.y < -p.radius) p.y = height + p.radius;
                    if (p.y > height + p.radius) p.y = -p.radius;

                    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
                    grad.addColorStop(0, `hsla(${p.hue}, 80%, 60%, ${p.alpha})`);
                    grad.addColorStop(1, `hsla(${p.hue}, 80%, 60%, 0)`);
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                    ctx.fill();
                });
                requestAnimationFrame(animate);
            }
            animate();
        }

        // === 무대 전용 모니터 뷰어 (Stage Confidence Monitor) 렌더러 모듈 ===
        let monitorViewerSettings = {
            currentBox: { leftPct: 5.0, topPct: 5.0, widthPct: 90.0, heightPct: 42.0, fontSize: 28, textColor: "#FFFFFF" },
            nextBox: { leftPct: 5.0, topPct: 51.0, widthPct: 90.0, heightPct: 42.0, fontSize: 22, textColor: "#A0A0A0" }
        };

        async function fetchMonitorViewerSettings() {
            try {
                const res = await fetch("/api/v1/monitor/settings");
                if (res.ok) {
                    const json = await res.json();
                    if (json.status === "success" && json.data) {
                        monitorViewerSettings = json.data;
                        localStorage.setItem("subcast_monitor_settings", JSON.stringify(monitorViewerSettings));
                    }
                }
            } catch (e) {
                console.warn("Failed to fetch monitor settings from API", e);
            }
            const local = localStorage.getItem("subcast_monitor_settings");
            if (local) {
                try { monitorViewerSettings = JSON.parse(local); } catch (e) {}
            }
        }

        function renderMonitorViewerLayout() {
            const container = document.getElementById("monitor-viewer-container");
            if (!container || container.style.display === "none") return;

            const screenW = window.innerWidth;
            const screenH = window.innerHeight;

            const cur = monitorViewerSettings.currentBox || {};
            const curCard = document.getElementById("monitor-current-card");
            const curText = document.getElementById("monitor-current-text");
            if (curCard && cur) {
                curCard.style.left = `${(cur.leftPct / 100) * screenW}px`;
                curCard.style.top = `${(cur.topPct / 100) * screenH}px`;
                curCard.style.width = `${(cur.widthPct / 100) * screenW}px`;
                curCard.style.height = `${(cur.heightPct / 100) * screenH}px`;
                let curFontSize = "3.8vw";
                if (cur.fontSize) {
                    curFontSize = (typeof cur.fontSize === 'string' && cur.fontSize.includes('vw')) ? cur.fontSize : `${cur.fontSize}px`;
                }
                if (curText) {
                    curText.style.fontSize = curFontSize;
                    if (cur.textColor) curText.style.color = cur.textColor;
                    if (cur.fontWeight) curText.style.fontWeight = cur.fontWeight;
                    if (cur.fontStyle) curText.style.fontStyle = cur.fontStyle;
                    if (cur.fontFamily) curText.style.fontFamily = cur.fontFamily;
                    if (cur.textAlign) curText.style.justifyContent = cur.textAlign === 'left' ? 'flex-start' : (cur.textAlign === 'right' ? 'flex-end' : 'center');
                    if (cur.textAlign) curText.style.textAlign = cur.textAlign;
                    if (cur.opacity !== undefined) curText.style.opacity = cur.opacity;
                    const curLh = cur.lineHeight !== undefined ? cur.lineHeight : 1.2;
                    curText.style.lineHeight = `${curLh}`;
                    if (cur.strokeColor && cur.strokeColor !== 'transparent' && cur.strokeWidth > 0) {
                        curText.style.webkitTextStroke = `${cur.strokeWidth}px ${cur.strokeColor}`;
                        curText.style.paintOrder = 'stroke fill';
                    } else {
                        curText.style.webkitTextStroke = '0px transparent';
                    }
                }
            }

            const nxt = monitorViewerSettings.nextBox || {};
            const nxtCard = document.getElementById("monitor-next-card");
            const nxtText = document.getElementById("monitor-next-text");
            if (nxtCard && nxt) {
                nxtCard.style.left = `${(nxt.leftPct / 100) * screenW}px`;
                nxtCard.style.top = `${(nxt.topPct / 100) * screenH}px`;
                nxtCard.style.width = `${(nxt.widthPct / 100) * screenW}px`;
                nxtCard.style.height = `${(nxt.heightPct / 100) * screenH}px`;
                let nxtFontSize = "6.5vw";
                if (nxt.fontSize) {
                    nxtFontSize = (typeof nxt.fontSize === 'string' && nxt.fontSize.includes('vw')) ? nxt.fontSize : `${nxt.fontSize}px`;
                }
                if (nxtText) {
                    nxtText.style.fontSize = nxtFontSize;
                    if (nxt.textColor) nxtText.style.color = nxt.textColor;
                    if (nxt.fontWeight) nxtText.style.fontWeight = nxt.fontWeight;
                    if (nxt.fontStyle) nxtText.style.fontStyle = nxt.fontStyle;
                    if (nxt.fontFamily) nxtText.style.fontFamily = nxt.fontFamily;
                    if (nxt.textAlign) nxtText.style.justifyContent = nxt.textAlign === 'left' ? 'flex-start' : (nxt.textAlign === 'right' ? 'flex-end' : 'center');
                    if (nxt.textAlign) nxtText.style.textAlign = nxt.textAlign;
                    if (nxt.opacity !== undefined) nxtText.style.opacity = nxt.opacity;
                    const nxtLh = nxt.lineHeight !== undefined ? nxt.lineHeight : 1.2;
                    nxtText.style.lineHeight = `${nxtLh}`;
                    if (nxt.strokeColor && nxt.strokeColor !== 'transparent' && nxt.strokeWidth > 0) {
                        nxtText.style.webkitTextStroke = `${nxt.strokeWidth}px ${nxt.strokeColor}`;
                        nxtText.style.paintOrder = 'stroke fill';
                    } else {
                        nxtText.style.webkitTextStroke = '0px transparent';
                    }
                }
            }

            renderMonitorCustomElements(container, monitorViewerSettings.customElements, screenW, screenH);
        }

        function renderMonitorCustomElements(container, customElements, screenW, screenH) {
            let customLayer = document.getElementById("monitor-custom-elements-layer");
            if (!customLayer) {
                customLayer = document.createElement("div");
                customLayer.id = "monitor-custom-elements-layer";
                customLayer.style.position = "absolute";
                customLayer.style.top = "0";
                customLayer.style.left = "0";
                customLayer.style.width = "100%";
                customLayer.style.height = "100%";
                customLayer.style.pointerEvents = "none";
                customLayer.style.zIndex = "5";
                container.appendChild(customLayer);
            }
            customLayer.innerHTML = "";

            if (!Array.isArray(customElements) || customElements.length === 0) return;

            customElements.forEach(elem => {
                const leftPx = (elem.x / 100) * screenW;
                const topPx = (elem.y / 100) * screenH;
                const widthPx = (elem.width / 100) * screenW;
                const heightPx = (elem.height / 100) * screenH;

                const el = document.createElement("div");
                el.style.position = "absolute";
                el.style.left = `${leftPx}px`;
                el.style.top = `${topPx}px`;
                el.style.width = `${widthPx}px`;
                el.style.height = `${heightPx}px`;
                el.style.opacity = elem.style?.opacity !== undefined ? elem.style.opacity : 1.0;
                el.style.boxSizing = "border-box";

                const fillColor = elem.style?.fillColor || "transparent";
                const strokeColor = elem.style?.strokeColor || "transparent";
                const strokeWidth = elem.style?.strokeWidth ? (elem.style.strokeWidth * (screenW / 768)) : 0;

                if (elem.type === 'rect') {
                    el.style.backgroundColor = fillColor;
                    if (strokeWidth > 0 && strokeColor !== 'transparent') {
                        el.style.border = `${strokeWidth}px solid ${strokeColor}`;
                    }
                    if (elem.style?.cornerRadius) {
                        el.style.borderRadius = `${elem.style.cornerRadius * (screenW / 768)}px`;
                    }
                } else if (elem.type === 'circle') {
                    el.style.backgroundColor = fillColor;
                    el.style.borderRadius = "50%";
                    if (strokeWidth > 0 && strokeColor !== 'transparent') {
                        el.style.border = `${strokeWidth}px solid ${strokeColor}`;
                    }
                } else if (elem.type === 'triangle') {
                    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                    svg.setAttribute("width", "100%");
                    svg.setAttribute("height", "100%");
                    svg.setAttribute("viewBox", "0 0 100 100");
                    svg.setAttribute("preserveAspectRatio", "none");

                    const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
                    polygon.setAttribute("points", "50,0 100,100 0,100");
                    polygon.setAttribute("fill", fillColor);
                    if (strokeWidth > 0 && strokeColor !== 'transparent') {
                        polygon.setAttribute("stroke", strokeColor);
                        polygon.setAttribute("stroke-width", strokeWidth);
                    }
                    svg.appendChild(polygon);
                    el.appendChild(svg);
                } else if (elem.type === 'line') {
                    el.style.backgroundColor = fillColor !== 'transparent' ? fillColor : strokeColor;
                    el.style.height = `${Math.max(2, strokeWidth || 4)}px`;
                } else if (elem.type === 'image' || (elem.style && elem.style.src)) {
                    const imgSrc = elem.style?.src || elem.src;
                    if (imgSrc) {
                        const img = document.createElement("img");
                        img.src = imgSrc;
                        img.style.width = "100%";
                        img.style.height = "100%";
                        img.style.objectFit = "contain";
                        el.appendChild(img);
                    }
                } else if (elem.type === 'text') {
                    el.style.color = elem.style?.fontColor || "#ffffff";
                    el.style.fontSize = `${Math.round((parseInt(elem.style?.fontSize) || 20) * (screenW / 768))}px`;
                    el.style.fontFamily = elem.style?.fontFamily || "Inter";
                    el.style.fontWeight = elem.style?.fontWeight || "normal";
                    el.style.textAlign = elem.style?.textAlign || "left";
                    el.innerText = elem.content || "";
                }

                customLayer.appendChild(el);
            });
        }

        function isPraiseSlide(slide) {
            if (!slide) return false;
            if (slide.slideType === 'praise' || slide.isPraise === true) return true;
            if (slide.id && typeof slide.id === 'string' && slide.id.startsWith('slide_praise_')) return true;
            if (slide.name && typeof slide.name === 'string' && (slide.name.startsWith('찬양:') || slide.name.startsWith('자막(템):'))) return true;
            return false;
        }

        function updateMonitorViewerTexts(currentContent, nextContent, isLastSlide = false, isPraise = true) {
            const monitorContainer = document.getElementById("monitor-viewer-container");
            const canvasContainer = document.getElementById("canvas-container");
            const curText = document.getElementById("monitor-current-text");
            const nxtText = document.getElementById("monitor-next-text");
            const nxtCard = document.getElementById("monitor-next-card");

            if (!isPraise) {
                // 찬양이 아닌 성경/일반 슬라이드: 모니터 2분할 텍스트 뷰어 숨기고, 원본 슬라이드 디자인 캔버스 출력
                if (monitorContainer) monitorContainer.style.display = "none";
                if (canvasContainer) canvasContainer.style.display = "block";
                renderCurrentSlide();
            } else {
                // 찬양 슬라이드: 모니터 2분할(CURRENT + NEXT) 텍스트 뷰어 출력
                if (monitorContainer) monitorContainer.style.display = "block";
                if (canvasContainer) canvasContainer.style.display = "none";

                if (curText) {
                    curText.textContent = currentContent || "(내용 없음)";
                }
                if (nxtText && nxtCard) {
                    nxtCard.style.display = "flex";
                    if (isLastSlide) {
                        nxtText.textContent = "[마지막 슬라이드입니다]";
                        nxtCard.style.opacity = "0.4";
                    } else {
                        nxtText.textContent = nextContent || "(다음 슬라이드 없음)";
                        nxtCard.style.opacity = "1.0";
                    }
                }
            }
        }

        function extractSlideText(slide, fallbackName = "") {
            if (!slide || !slide.elements) return fallbackName;
            const texts = slide.elements
                .filter(e => e.type === "text" || e.type === "i-text" || e.type === "textbox")
                .map(e => e.content || "")
                .filter(Boolean)
                .join("\n");
            return texts || fallbackName || slide.name || "";
        }

        function updateMonitorFromProjectData() {
            const urlParams = new URLSearchParams(window.location.search);
            const channel = urlParams.get('channel');
            const isMonitor = urlParams.get('mode') === 'monitor' || channel === 'monitor' || channel === 'preview' || channel === 'monitor_preview';
            if (!isMonitor || !projectData || !projectData.slides) return;

            const currentSlideId = projectData.settings?.currentLiveSlideId || (projectData.slides[0] ? projectData.slides[0].id : null);
            let currentIndex = projectData.slides.findIndex(s => s.id === currentSlideId);
            if (currentIndex === -1) currentIndex = 0;

            const curSlide = projectData.slides[currentIndex];
            const isLastSlide = (currentIndex + 1 >= projectData.slides.length);
            const nextSlide = isLastSlide ? null : projectData.slides[currentIndex + 1];

            const curText = curSlide ? extractSlideText(curSlide, curSlide.name || `슬라이드 ${currentIndex + 1}`) : "";
            const nextText = isLastSlide ? "[마지막 슬라이드입니다]" : (nextSlide ? extractSlideText(nextSlide, nextSlide.name || `슬라이드 ${currentIndex + 2}`) : "");

            const isPraise = isPraiseSlide(curSlide);
            updateMonitorViewerTexts(curText, nextText, isLastSlide, isPraise);
        }

        async function initMonitorModeViewer() {
            if (!canvas && typeof initCanvas === 'function') {
                initCanvas();
            }
            const monitorContainer = document.getElementById("monitor-viewer-container");
            const canvasContainer = document.getElementById("canvas-container");

            await fetchMonitorViewerSettings();
            renderMonitorViewerLayout();
            updateMonitorFromProjectData();

            // BroadcastChannel 리스너 수신
            if (window.BroadcastChannel) {
                const bc = new BroadcastChannel("subcast_monitor_channel");
                bc.onmessage = (e) => {
                    const data = e.data;
                    if (!data) return;
                    const urlParams = new URLSearchParams(window.location.search);
                    const channel = urlParams.get('channel');
                    if (data.type === "MONITOR_LAYOUT_UPDATE" && data.settings) {
                        monitorViewerSettings = data.settings;
                        renderMonitorViewerLayout();
                    } else if (data.type === "MONITOR_PREVIEW_UPDATE" && data.settings && (channel === 'preview' || channel === 'monitor_preview')) {
                        monitorViewerSettings = data.settings;
                        renderMonitorViewerLayout();
                    } else if (data.type === "SLIDE_CHANGE") {
                        updateMonitorViewerTexts(data.currentContent, data.nextContent, data.isLastSlide, data.isPraise !== undefined ? data.isPraise : true);
                    }
                };
            }

            // LocalStorage 이벤트 폴백
            window.addEventListener("storage", (e) => {
                if (e.key === "subcast_monitor_settings" && e.newValue) {
                    try {
                        monitorViewerSettings = JSON.parse(e.newValue);
                        renderMonitorViewerLayout();
                    } catch (err) {}
                }
            });
        }

        window.onload = () => {
            const urlParams = new URLSearchParams(window.location.search);
            const channel = urlParams.get('channel');
            const mode = urlParams.get('mode');
            const isMonitorMode = mode === 'monitor' || channel === 'monitor' || channel === 'preview' || channel === 'monitor_preview';
            const isStageMode = channel === 'stage' || mode === 'stage';

            if (isMonitorMode) {
                initMonitorModeViewer();
            } else {
                if (isStageMode) {
                    initStageMotionBg();
                }
                initCanvas();
            }
            connectWebSocket();

            // 찬양 방송 자막 실시간 BroadcastChannel 수신 (0초 즉시 동기화)
            if (window.BroadcastChannel) {
                const bcastBc = new BroadcastChannel("subcast_broadcast_channel");
                bcastBc.onmessage = (e) => {
                    const data = e.data;
                    if (data && data.type === "PRAISE_BROADCAST_LAYOUT_UPDATED" && data.layout) {
                        if (!projectData) projectData = {};
                        if (!projectData.settings) projectData.settings = {};
                        projectData.settings.praiseBroadcastLayout = data.layout;
                        renderCurrentSlide();
                    }
                };
            }

            // LocalStorage 변경 실시간 감지 폴백
            window.addEventListener("storage", (e) => {
                if (e.key === "subcast_praise_broadcast_layout" && e.newValue) {
                    try {
                        if (!projectData) projectData = {};
                        if (!projectData.settings) projectData.settings = {};
                        projectData.settings.praiseBroadcastLayout = JSON.parse(e.newValue);
                        renderCurrentSlide();
                    } catch (err) {}
                }
            });
        };

        window.onresize = () => {
            const urlParams = new URLSearchParams(window.location.search);
            const channel = urlParams.get('channel');
            if (urlParams.get('mode') === 'monitor' || channel === 'monitor' || channel === 'preview' || channel === 'monitor_preview') {
                requestAnimationFrame(renderMonitorViewerLayout);
            } else {
                updateCanvasDimensions();
            }
        };
