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
            
            // 뷰어는 상호작용이 없는 StaticCanvas를 사용
            canvas = new fabric.StaticCanvas('viewer-canvas', {
                width: window.innerWidth,
                height: window.innerHeight,
                backgroundColor: 'transparent'
            });
            
            updateCanvasDimensions();
        }

        // 창 크기에 비례하여 캔버스를 반응형으로 크기 조정하거나 
        // 설정된 해상도 비율(가로세로 비율)을 유지하도록 설정
        function updateCanvasDimensions() {
            if (!canvas) return;

            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;
            
            // 타겟 해상도 종횡비 유지 (Letterboxing)
            const targetRatio = targetWidth / targetHeight;
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

            // 캔버스 요소를 중앙에 정렬하기 위해 컨테이너 마진 설정 가능
            const canvasEl = canvas.getElement().parentNode;
            if (canvasEl) {
                canvasEl.style.width = `${drawWidth}px`;
                canvasEl.style.height = `${drawHeight}px`;
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

            canvas.clear();

            const currentSlideId = projectData.settings?.currentLiveSlideId;
            if (!currentSlideId) return;

            const currentSlide = projectData.slides.find(s => s.id === currentSlideId);
            if (!currentSlide) return;

            // 반응형 줌 비율(Scale Ratio) 계산 및 캔버스 적용
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
                        targetWidth = projectData.settings.targetWidth || 1920;
                        targetHeight = projectData.settings.targetHeight || 1080;
                        const bgMode = projectData.settings.backgroundMode || 'transparent';
                        document.body.classList.toggle('chromakey-mode', bgMode === 'chromakey');
                        if (projectData.settings.stageBackground) {
                            applyStageBackground(projectData.settings.stageBackground);
                        }
                    }
                    updateCanvasDimensions();
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
                    }
                } 
                else if (message.type === 'UPDATE_RESOLUTION') {
                    targetWidth = message.width;
                    targetHeight = message.height;
                    updateCanvasDimensions();
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

            const videoEl = document.getElementById('stage-video-bg');
            const motionCanvas = document.getElementById('stage-motion-bg');

            if (!bgConfig || bgConfig.type === 'ambient') {
                if (videoEl) {
                    videoEl.pause();
                    videoEl.style.display = 'none';
                }
                initStageMotionBg();
                if (motionCanvas) motionCanvas.style.display = 'block';
            } else if (bgConfig.type === 'video' && bgConfig.videoUrl) {
                if (motionCanvas) motionCanvas.style.display = 'none';
                if (videoEl) {
                    videoEl.style.display = 'block';
                    const fullUrl = bgConfig.videoUrl.startsWith('http') ? bgConfig.videoUrl : window.location.origin + bgConfig.videoUrl;
                    if (videoEl.src !== fullUrl) {
                        videoEl.src = bgConfig.videoUrl;
                        videoEl.load();
                        videoEl.play().catch(e => console.warn("Video autoplay prevented:", e));
                    } else if (videoEl.paused) {
                        videoEl.play().catch(e => console.warn("Video play failed:", e));
                    }
                    const opacity = bgConfig.opacity !== undefined ? bgConfig.opacity : 0.8;
                    videoEl.style.opacity = opacity;
                    const blur = bgConfig.blur !== undefined ? bgConfig.blur : 0;
                    videoEl.style.filter = blur > 0 ? `blur(${blur}px)` : 'none';
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

        window.onload = () => {
            const urlParams = new URLSearchParams(window.location.search);
            const isMonitorMode = urlParams.get('mode') === 'monitor';
            const channel = urlParams.get('channel');
            const isStageMode = channel === 'stage' || urlParams.get('mode') === 'stage';

            if (isStageMode && !isMonitorMode) {
                initStageMotionBg();
            }

            if (isMonitorMode) {
                document.body.classList.add('monitor-mode');

                const savedSettings = JSON.parse(localStorage.getItem("subcast_monitor_settings") || "{}");
                monitorFontSize = parseFloat(savedSettings.fontSize) || 125;
                updateMonitorFontSize();

                // Ctrl + 마우스 휠로 글꼴 크기 자유 조절
                window.addEventListener('wheel', (e) => {
                    if (e.ctrlKey) {
                        e.preventDefault();
                        const delta = e.deltaY < 0 ? 5 : -5;
                        monitorFontSize = Math.min(Math.max(50, monitorFontSize + delta), 300);
                        updateMonitorFontSize();
                        showFontToast(monitorFontSize);
                    }
                }, { passive: false });

                // 창을 닫을 때 조정한 글씨 크기 파악하여 기본 설정으로 저장
                window.addEventListener("beforeunload", saveCurrentMonitorFontSize);
                window.addEventListener("pagehide", saveCurrentMonitorFontSize);

                // 모니터링 전용 스타일 추가
                const styleEl = document.createElement('style');
                styleEl.innerHTML = `
                    body.monitor-mode {
                        background: #09090b !important;
                        color: #ffffff;
                        overflow: hidden;
                        display: flex;
                        flex-direction: column;
                    }
                    body.monitor-mode #canvas-container {
                        display: none !important;
                    }
                    .monitor-wrapper {
                        display: flex;
                        flex-direction: column;
                        width: 100vw;
                        height: 100vh;
                        padding: 16px;
                        gap: 16px;
                        box-sizing: border-box;
                    }
                    .monitor-section {
                        background: rgba(255, 255, 255, 0.04);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: 12px;
                        padding: 20px 24px;
                        display: flex;
                        flex-direction: column;
                        position: relative;
                        overflow: hidden;
                    }
                    .monitor-section.current {
                        border-color: rgba(239, 68, 68, 0.6);
                        background: rgba(239, 68, 68, 0.05);
                        flex: 1;
                    }
                    .monitor-section.next {
                        border-color: rgba(79, 70, 229, 0.5);
                        background: rgba(79, 70, 229, 0.05);
                        flex: 1;
                    }
                    .monitor-tag {
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                        font-size: 0.8rem;
                        font-weight: 800;
                        padding: 4px 10px;
                        border-radius: 6px;
                        margin-bottom: 12px;
                        width: fit-content;
                    }
                    .monitor-section.current .monitor-tag {
                        background: #ef4444;
                        color: #fff;
                    }
                    .monitor-section.next .monitor-tag {
                        background: #4f46e5;
                        color: #fff;
                    }
                    .monitor-content {
                        font-size: var(--monitor-font-size, 2rem);
                        line-height: 1.5;
                        font-weight: 600;
                        white-space: pre-wrap;
                        word-break: keep-all;
                        overflow: hidden;
                    }
                    .bible-badge {
                        display: inline-block;
                        background: rgba(255, 255, 255, 0.15);
                        padding: 2px 8px;
                        border-radius: 4px;
                        font-size: 0.85em;
                        color: #fbbf24;
                        margin-right: 8px;
                    }
                `;
                document.head.appendChild(styleEl);

                const monitorDiv = document.createElement('div');
                monitorDiv.className = 'monitor-wrapper';
                monitorDiv.id = 'monitor-wrapper';
                monitorDiv.innerHTML = `
                    <div class="monitor-section current" id="monitor-current-section">
                        <div class="monitor-tag">🔴 CURRENT (현재 송출 슬라이드)</div>
                        <div class="monitor-content" id="monitor-current-text">송출 중인 슬라이드가 없습니다.</div>
                    </div>
                    <div class="monitor-section next" id="monitor-next-section">
                        <div class="monitor-tag">🔵 NEXT (다음 슬라이드)</div>
                        <div class="monitor-content" id="monitor-next-text">다음 슬라이드가 없습니다.</div>
                    </div>
                `;
                document.body.appendChild(monitorDiv);
            }

            initCanvas();
            connectWebSocket();
        };

        // 렌더링 함수 가로채기 (모니터링 모드 지원)
        const origRenderCurrentSlide = renderCurrentSlide;
        renderCurrentSlide = function() {
            origRenderCurrentSlide();
            
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('mode') === 'monitor' && projectData && projectData.slides) {
                renderMonitorView();
            }
        };

        function renderMonitorView() {
            const settings = JSON.parse(localStorage.getItem("subcast_monitor_settings") || "{}");
            const layoutRatio = settings.layout || "5:5";
            const bibleMode = settings.bibleMode || "summary";

            const currentSec = document.getElementById("monitor-current-section");
            const nextSec = document.getElementById("monitor-next-section");
            const currentTextEl = document.getElementById("monitor-current-text");
            const nextTextEl = document.getElementById("monitor-next-text");

            if (!currentSec || !nextSec) return;

            // 폰트 크기 및 비율 적용
            updateMonitorFontSize();

            if (layoutRatio === "7:3") {
                currentSec.style.flex = "7";
                nextSec.style.flex = "3";
            } else if (layoutRatio === "3:7") {
                currentSec.style.flex = "3";
                nextSec.style.flex = "7";
            } else {
                currentSec.style.flex = "1";
                nextSec.style.flex = "1";
            }

            const currentLiveId = projectData.settings?.currentLiveSlideId;
            const slides = projectData.slides;
            const currentIdx = slides.findIndex(s => s.id === currentLiveId);

            function extractSlideText(slide) {
                if (!slide || !slide.elements) return "";
                const texts = [];
                function traverse(elems) {
                    elems.forEach(el => {
                        if (el.type === 'text' && el.content) {
                            texts.push(el.content.trim());
                        } else if (el.type === 'group' && el.children) {
                            traverse(el.children);
                        }
                    });
                }
                traverse(slide.elements);
                return texts.join("\n");
            }

            if (currentIdx !== -1) {
                const currentSlide = slides[currentIdx];
                currentTextEl.innerText = extractSlideText(currentSlide) || "(빈 슬라이드)";

                // 다음 슬라이드
                if (currentIdx + 1 < slides.length) {
                    const nextSlide = slides[currentIdx + 1];
                    let nextText = extractSlideText(nextSlide) || "(빈 슬라이드)";

                    // 성경 모드 처리
                    if (bibleMode === "ref_only") {
                        const match = nextText.match(/([가-힣]+\s*\d+:\d+)/);
                        if (match) {
                            nextText = `${match[1]} (성경 구절 대기)`;
                        }
                    } else if (bibleMode === "summary") {
                        if (nextText.length > 60) {
                            nextText = nextText.substring(0, 60) + "...";
                        }
                    }
                    nextTextEl.innerText = nextText;
                } else {
                    nextTextEl.innerText = "다음 슬라이드가 없습니다 (마지막)";
                }
            } else {
                currentTextEl.innerText = "송출 중인 슬라이드가 없습니다.";
                if (slides.length > 0) {
                    nextTextEl.innerText = `[대기 1번 슬라이드] ` + extractSlideText(slides[0]);
                } else {
                    nextTextEl.innerText = "등록된 슬라이드가 없습니다.";
                }
            }
        }

        window.onresize = () => {
            updateCanvasDimensions();
        };
