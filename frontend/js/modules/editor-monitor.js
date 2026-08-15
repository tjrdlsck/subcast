// ==========================================================================
// Subcast Module: editor-monitor.js (무대 모니터링 레이아웃 전용 편집기)
// ==========================================================================

let monitorCanvas = null;
let currentGuideBox = null;
let nextGuideBox = null;
let isMonitorOverlayActive = false;

const DEFAULT_MONITOR_SETTINGS = {
    layoutMode: "custom_canvas",
    currentBox: {
        leftPct: 5.0,
        topPct: 5.0,
        widthPct: 90.0,
        heightPct: 42.0,
        fontSize: "6.5vw",
        textColor: "#FFFFFF",
        strokeColor: "#000000",
        strokeWidth: 2,
        fontWeight: "bold",
        fontStyle: "normal",
        fontFamily: "Inter",
        textAlign: "center",
        lineHeight: 1.2,
        opacity: 1.0
    },
    nextBox: {
        leftPct: 5.0,
        topPct: 51.0,
        widthPct: 90.0,
        heightPct: 42.0,
        fontSize: "6.5vw",
        textColor: "#94a3b8",
        strokeColor: "#000000",
        strokeWidth: 1,
        fontWeight: "600",
        fontStyle: "normal",
        fontFamily: "Inter",
        textAlign: "center",
        lineHeight: 1.2,
        opacity: 1.0
    }
};

let monitorSettings = JSON.parse(JSON.stringify(DEFAULT_MONITOR_SETTINGS));

const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

function getNormalizedVwNumber(fontSizeVal, fallbackVw = 6.5) {
    if (typeof fontSizeVal === 'string') {
        const match = fontSizeVal.match(/^(\d+(?:\.\d+)?)\s*vw$/);
        if (match) {
            const num = parseFloat(match[1]);
            return clamp(num, 1.0, 10.0);
        }
        const parsed = parseFloat(fontSizeVal);
        if (!isNaN(parsed)) {
            if (parsed > 10.0) {
                return fallbackVw;
            }
            return clamp(parsed, 1.0, 10.0);
        }
    } else if (typeof fontSizeVal === 'number') {
        if (fontSizeVal > 10.0) {
            return fallbackVw;
        }
        return clamp(fontSizeVal, 1.0, 10.0);
    }
    return fallbackVw;
}

function parseFontSizeVw(fontSizeVal, defaultVw, canvasW) {
    const vwNum = getNormalizedVwNumber(fontSizeVal, defaultVw);
    return (vwNum / 100) * canvasW;
}

// 1. 모니터 설정 로드 (API -> LocalStorage 폴백)
async function loadMonitorSettings() {
    try {
        const res = await fetch("/api/v1/monitor/settings");
        if (res.ok) {
            const json = await res.json();
            if (json.status === "success" && json.data) {
                monitorSettings = { ...DEFAULT_MONITOR_SETTINGS, ...json.data };
                localStorage.setItem("subcast_monitor_settings", JSON.stringify(monitorSettings));
                syncMonitorUIControls(monitorSettings);
                return;
            }
        }
    } catch (e) {
        console.warn("Failed to fetch monitor settings from API, using LocalStorage fallback", e);
    }

    const local = localStorage.getItem("subcast_monitor_settings");
    if (local) {
        try {
            monitorSettings = { ...DEFAULT_MONITOR_SETTINGS, ...JSON.parse(local) };
        } catch (e) {
            console.error("Failed to parse local monitor settings", e);
            monitorSettings = JSON.parse(JSON.stringify(DEFAULT_MONITOR_SETTINGS));
        }
    }
    syncMonitorUIControls(monitorSettings);
}

// 2. 모니터 설정 저장 및 브로드캐스트 (저장 버튼 클릭 시에만 실행)
async function saveMonitorSettings(syncCanvasFirst = true) {
    if (syncCanvasFirst) {
        syncCanvasToMonitorSettings();
    }
    localStorage.setItem("subcast_monitor_settings", JSON.stringify(monitorSettings));
    try {
        await fetch("/api/v1/monitor/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(monitorSettings)
        });
    } catch (e) {
        console.error("Failed to save monitor settings to API", e);
    }

    broadcastMonitorSettings();
    if (typeof showToast === 'function') {
        showToast("무대 모니터 레이아웃이 저장 및 적용되었습니다.");
    } else {
        alert("무대 모니터 레이아웃이 저장 및 적용되었습니다.");
    }
}

function broadcastMonitorSettings() {
    if (window.BroadcastChannel) {
        try {
            const bc = new BroadcastChannel("subcast_monitor_channel");
            bc.postMessage({ type: "MONITOR_LAYOUT_UPDATE", settings: monitorSettings });
            bc.close();
        } catch (e) {
            console.error("Failed to post message to BroadcastChannel", e);
        }
    }
}

function broadcastMonitorPreviewSettings() {
    if (window.BroadcastChannel) {
        try {
            const bc = new BroadcastChannel("subcast_monitor_channel");
            bc.postMessage({ type: "MONITOR_PREVIEW_UPDATE", settings: monitorSettings });
            bc.close();
        } catch (e) {
            console.error("Failed to post preview message to BroadcastChannel", e);
        }
    }
}

// 3. 슬라이드 텍스트 추출 함수
function extractSlidePlainText(slide, fallbackName = "") {
    if (!slide || !slide.elements) return fallbackName;
    const texts = slide.elements
        .filter(e => e.type === "text" || e.type === "i-text" || e.type === "textbox")
        .map(e => e.content || "")
        .filter(Boolean)
        .join("\n");
    return texts || fallbackName || slide.name || "";
}

function getCurrentAndNextSlideTexts() {
    const slides = (window.projectData && window.projectData.slides) || [];
    if (!slides.length) {
        return {
            curText: "[현재 슬라이드 내용이 없습니다]",
            nextText: "[다음 슬라이드가 없습니다]"
        };
    }

    let currentIndex = slides.findIndex(s => s.id === window.activeSlideId);
    if (currentIndex === -1) currentIndex = 0;

    const curSlide = slides[currentIndex];
    const isLastSlide = (currentIndex + 1 >= slides.length);
    const nextSlide = isLastSlide ? null : slides[currentIndex + 1];

    const curText = curSlide ? extractSlidePlainText(curSlide, `슬라이드 ${currentIndex + 1}`) : "[현재 슬라이드 내용]";
    const nextText = isLastSlide ? "[마지막 슬라이드입니다]" : (nextSlide ? extractSlidePlainText(nextSlide, `슬라이드 ${currentIndex + 2}`) : "[다음 슬라이드 내용]");

    return { curText, nextText };
}

// 4. 무대 모니터 메인 뷰어 오버레이 표시/숨김
function showMonitorMainViewer() {
    const overlay = document.getElementById("monitor-main-viewer-overlay");
    if (overlay) {
        overlay.style.display = "flex";
        isMonitorOverlayActive = true;
        setTimeout(() => {
            initMonitorLayoutCanvas();
        }, 50);
    }
}

function hideMonitorMainViewer() {
    const overlay = document.getElementById("monitor-main-viewer-overlay");
    if (overlay) {
        overlay.style.display = "none";
    }
    isMonitorOverlayActive = false;
    if (monitorCanvas) {
        monitorCanvas.dispose();
        monitorCanvas = null;
    }
}

// 5. 전용 Fabric 캔버스 초기화
function initMonitorLayoutCanvas() {
    const canvasContainer = document.getElementById("monitor-canvas-container");
    if (!canvasContainer) return;

    loadMonitorSettings();

    // 부모 컨테이너 크기에 맞춰 16:9 비율 설정
    const rect = canvasContainer.parentElement.getBoundingClientRect();
    const maxW = Math.max(320, rect.width - 40);
    const maxH = Math.max(180, rect.height - 40);

    let renderW = maxW;
    let renderH = (maxW * 9) / 16;
    if (renderH > maxH) {
        renderH = maxH;
        renderW = (maxH * 16) / 9;
    }

    canvasContainer.style.width = `${renderW}px`;
    canvasContainer.style.height = `${renderH}px`;

    // 이전 Fabric 캔버스 및 중복 래퍼 DOM 찌꺼기 완전 소멸
    if (monitorCanvas) {
        monitorCanvas.dispose();
        monitorCanvas = null;
    }
    canvasContainer.innerHTML = '<canvas id="monitor-editor-canvas"></canvas>';

    monitorCanvas = new fabric.Canvas("monitor-editor-canvas", {
        width: renderW,
        height: renderH,
        backgroundColor: "#090d16",
        selection: true,
        renderOnAddRemove: true
    });

    renderMonitorCanvasObjects(renderW, renderH);
    syncMonitorUIControls(monitorSettings);
}

// 6. 8방향 자유 조절 카드 컨테이너(Group) 생성 함수
function createMonitorCardGroup(boxType, text, boxConfig, canvasW, canvasH) {
    const isCurrent = (boxType === 'currentBox');
    const color = isCurrent ? '#ef4444' : '#3b82f6';

    const w = (boxConfig.widthPct / 100) * canvasW;
    const h = (boxConfig.heightPct / 100) * canvasH;
    const left = (boxConfig.leftPct / 100) * canvasW;
    const top = (boxConfig.topPct / 100) * canvasH;
    const scale = canvasW / 1920;
    const fontSize = parseFontSizeVw(boxConfig.fontSize, 6.5, canvasW);

    // 1. 카드 배경 박스 (가이드 테두리)
    const cardBg = new fabric.Rect({
        left: 0,
        top: 0,
        originX: 'center',
        originY: 'center',
        width: w,
        height: h,
        fill: isCurrent ? 'rgba(239, 68, 68, 0.08)' : 'rgba(59, 130, 246, 0.08)',
        stroke: color,
        strokeWidth: 1.5,
        strokeDashArray: [5, 4],
        rx: 6,
        ry: 6,
        selectable: false,
        evented: false,
        objectCaching: false
    });

    // 2. 내부 텍스트 박스 (자동 줄바꿈 & 수직/수평 중앙 정렬)
    const textbox = new fabric.Textbox(text, {
        left: 0,
        top: 0,
        originX: 'center',
        originY: 'center',
        width: Math.max(50, w - 24),
        fontSize: fontSize,
        fill: boxConfig.textColor || (isCurrent ? '#ffffff' : '#94a3b8'),
        stroke: boxConfig.strokeColor || '#000000',
        strokeWidth: boxConfig.strokeWidth !== undefined ? boxConfig.strokeWidth * scale : 1,
        fontWeight: boxConfig.fontWeight || 'bold',
        fontStyle: boxConfig.fontStyle || 'normal',
        fontFamily: boxConfig.fontFamily || 'Inter',
        textAlign: boxConfig.textAlign || 'center',
        opacity: boxConfig.opacity !== undefined ? boxConfig.opacity : 1.0,
        lineHeight: boxConfig.lineHeight !== undefined ? boxConfig.lineHeight : 1.2,
        splitByGrapheme: false,
        editable: false,
        selectable: false,
        evented: false,
        paintFirst: 'stroke',
        objectCaching: false
    });

    // 3. 통합 그룹 생성 (캐싱 비활성화로 잔상 완벽 제거)
    const group = new fabric.Group([cardBg, textbox], {
        left: left,
        top: top,
        originX: 'left',
        originY: 'top',
        width: w,
        height: h,
        lockRotation: true,
        hasRotatingPoint: false,
        transparentCorners: false,
        borderColor: color,
        cornerColor: color,
        cornerSize: 10,
        cornerStyle: 'rect',
        isMonitorGuide: true,
        boxType: boxType,
        objectCaching: false
    });

    // 상/하/좌/우/대각선 8개 핸들 모두 활성화
    group.setControlsVisibility({
        tl: true, tr: true, bl: true, br: true,
        ml: true, mr: true, mt: true, mb: true,
        mtr: false
    });

    return group;
}

// 7. 캔버스 객체 렌더링
function renderMonitorCanvasObjects(canvasW, canvasH) {
    if (!monitorCanvas) return;
    monitorCanvas.clear();

    const cur = monitorSettings.currentBox || DEFAULT_MONITOR_SETTINGS.currentBox;
    const nxt = monitorSettings.nextBox || DEFAULT_MONITOR_SETTINGS.nextBox;
    const { curText, nextText } = getCurrentAndNextSlideTexts();

    currentGuideBox = createMonitorCardGroup('currentBox', curText, cur, canvasW, canvasH);
    nextGuideBox = createMonitorCardGroup('nextBox', nextText, nxt, canvasW, canvasH);

    monitorCanvas.add(currentGuideBox);
    monitorCanvas.add(nextGuideBox);

    // 변경 이벤트 바인딩 (8방향 리사이즈 및 위치 이동 처리)
    monitorCanvas.on('object:modified', handleCardModified);
    monitorCanvas.on('object:scaling', handleCardScaling);
    monitorCanvas.on('object:moving', () => {
        syncCanvasToMonitorSettings();
        broadcastMonitorPreviewSettings();
    });

    monitorCanvas.renderAll();
}

function handleCardScaling(e) {
    const group = e.target;
    if (!group || !group.isMonitorGuide) return;
    updateGroupInternalLayout(group);
}

function handleCardModified(e) {
    const group = e.target;
    if (!group || !group.isMonitorGuide) return;
    updateGroupInternalLayout(group);
    syncCanvasToMonitorSettings();
    syncMonitorUIControls(monitorSettings);
    broadcastMonitorPreviewSettings();
}

function updateGroupInternalLayout(group) {
    if (!group) return;
    const actualW = Math.max(60, group.width * (group.scaleX || 1));
    const actualH = Math.max(40, group.height * (group.scaleY || 1));

    group.set({
        width: actualW,
        height: actualH,
        scaleX: 1,
        scaleY: 1
    });

    const objects = group.getObjects();
    if (objects && objects.length >= 2) {
        const [cardBg, textbox] = objects;
        cardBg.set({ width: actualW, height: actualH });
        textbox.set({ width: Math.max(40, actualW - 24) });
    }
}

// 8. 슬라이드 변경 시 텍스트 실시간 갱신
function updateMonitorSlideTexts() {
    if (!isMonitorOverlayActive || !monitorCanvas) return;

    const { curText, nextText } = getCurrentAndNextSlideTexts();
    if (currentGuideBox) {
        const objs = currentGuideBox.getObjects();
        const textbox = objs && (objs[1] || objs[0]);
        if (textbox) {
            textbox.set({ text: curText });
        }
    }
    if (nextGuideBox) {
        const objs = nextGuideBox.getObjects();
        const textbox = objs && (objs[1] || objs[0]);
        if (textbox) {
            textbox.set({ text: nextText });
        }
    }
    monitorCanvas.renderAll();
}

// 9. 캔버스 상태 -> 설정 객체 동기화
function syncCanvasToMonitorSettings() {
    if (!monitorCanvas) return;
    const canvasW = monitorCanvas.getWidth();
    const canvasH = monitorCanvas.getHeight();

    const updateBox = (groupObj, boxKey) => {
        if (!groupObj) return;
        const actualW = groupObj.width * (groupObj.scaleX || 1);
        const actualH = groupObj.height * (groupObj.scaleY || 1);

        let leftPct = clamp((groupObj.left / canvasW) * 100, 0, 95);
        let topPct = clamp((groupObj.top / canvasH) * 100, 0, 95);
        let widthPct = clamp((actualW / canvasW) * 100, 5, 100 - leftPct);
        let heightPct = clamp((actualH / canvasH) * 100, 5, 100 - topPct);

        monitorSettings[boxKey] = {
            ...monitorSettings[boxKey],
            leftPct: parseFloat(leftPct.toFixed(2)),
            topPct: parseFloat(topPct.toFixed(2)),
            widthPct: parseFloat(widthPct.toFixed(2)),
            heightPct: parseFloat(heightPct.toFixed(2))
        };
    };

    updateBox(currentGuideBox, 'currentBox');
    updateBox(nextGuideBox, 'nextBox');
}

// 10. 사이드바 UI 컨트롤 값 동기화
function syncMonitorUIControls(settings) {
    const cur = settings.currentBox || DEFAULT_MONITOR_SETTINGS.currentBox;
    const nxt = settings.nextBox || DEFAULT_MONITOR_SETTINGS.nextBox;

    // 🔴 CURRENT
    const curFs = document.getElementById("input-monitor-cur-font-size");
    const curFsVal = document.getElementById("lbl-monitor-cur-font-size-val");
    if (curFs) {
        const val = getNormalizedVwNumber(cur.fontSize, 6.5);
        curFs.value = val;
        if (curFsVal) curFsVal.textContent = val.toFixed(1);
        monitorSettings.currentBox.fontSize = `${val.toFixed(1)}vw`;
    }

    const curAlign = document.getElementById("select-monitor-cur-text-align");
    if (curAlign && cur.textAlign) curAlign.value = cur.textAlign;

    const curColor = document.getElementById("input-monitor-cur-text-color");
    if (curColor && cur.textColor) curColor.value = cur.textColor.startsWith("#") ? cur.textColor : "#ffffff";

    const curStroke = document.getElementById("input-monitor-cur-stroke-width");
    const curStrokeVal = document.getElementById("lbl-monitor-cur-stroke-val");
    if (curStroke) {
        curStroke.value = cur.strokeWidth !== undefined ? cur.strokeWidth : 2;
        if (curStrokeVal) curStrokeVal.textContent = curStroke.value;
    }

    const curLh = document.getElementById("range-monitor-cur-lineheight");
    const curLhVal = document.getElementById("val-monitor-cur-lineheight");
    if (curLh) {
        curLh.value = cur.lineHeight !== undefined ? cur.lineHeight : 1.2;
        if (curLhVal) curLhVal.textContent = `${parseFloat(curLh.value).toFixed(2)}x`;
    }

    // 🔵 NEXT
    const nxtFs = document.getElementById("input-monitor-nxt-font-size");
    const nxtFsVal = document.getElementById("lbl-monitor-nxt-font-size-val");
    if (nxtFs) {
        const val = getNormalizedVwNumber(nxt.fontSize, 6.5);
        nxtFs.value = val;
        if (nxtFsVal) nxtFsVal.textContent = val.toFixed(1);
        monitorSettings.nextBox.fontSize = `${val.toFixed(1)}vw`;
    }

    const nxtAlign = document.getElementById("select-monitor-nxt-text-align");
    if (nxtAlign && nxt.textAlign) nxtAlign.value = nxt.textAlign;

    const nxtColor = document.getElementById("input-monitor-nxt-text-color");
    if (nxtColor && nxt.textColor) nxtColor.value = nxt.textColor.startsWith("#") ? nxt.textColor : "#94a3b8";

    const nxtStroke = document.getElementById("input-monitor-nxt-stroke-width");
    const nxtStrokeVal = document.getElementById("lbl-monitor-nxt-stroke-val");
    if (nxtStroke) {
        nxtStroke.value = nxt.strokeWidth !== undefined ? nxt.strokeWidth : 1;
        if (nxtStrokeVal) nxtStrokeVal.textContent = nxtStroke.value;
    }

    const nxtLh = document.getElementById("range-monitor-nxt-lineheight");
    const nxtLhVal = document.getElementById("val-monitor-nxt-lineheight");
    if (nxtLh) {
        nxtLh.value = nxt.lineHeight !== undefined ? nxt.lineHeight : 1.2;
        if (nxtLhVal) nxtLhVal.textContent = `${parseFloat(nxtLh.value).toFixed(2)}x`;
    }
}

// 11. 이벤트 및 초기화 등록
function initEditorMonitor() {
    loadMonitorSettings();

    // 저장 버튼들
    const btnQuick = document.getElementById("btn-monitor-apply-quick");
    if (btnQuick) btnQuick.onclick = () => saveMonitorSettings(true);

    const btnSave = document.getElementById("btn-save-monitor-layout");
    if (btnSave) btnSave.onclick = () => saveMonitorSettings(true);

    // 초기화 버튼 (버그 완벽 수정: 캔버스 동기화 덮어쓰기 방지 및 즉각 리셋)
    const btnReset = document.getElementById("btn-reset-monitor-layout");
    if (btnReset) {
        btnReset.onclick = async () => {
            if (confirm("무대 모니터 레이아웃을 기본값으로 초기화하시겠습니까?")) {
                monitorSettings = JSON.parse(JSON.stringify(DEFAULT_MONITOR_SETTINGS));
                localStorage.setItem("subcast_monitor_settings", JSON.stringify(monitorSettings));
                try {
                    await fetch("/api/v1/monitor/settings", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(monitorSettings)
                    });
                } catch (e) {
                    console.error("Failed to reset monitor settings to API", e);
                }

                broadcastMonitorSettings();
                syncMonitorUIControls(monitorSettings);
                if (isMonitorOverlayActive) {
                    initMonitorLayoutCanvas();
                }

                if (typeof showToast === 'function') {
                    showToast("무대 모니터 레이아웃이 기본값으로 초기화되었습니다.");
                } else {
                    alert("무대 모니터 레이아웃이 기본값으로 초기화되었습니다.");
                }
            }
        };
    }

    // 🔴 CURRENT 컨트롤 이벤트 바인딩
    const curFs = document.getElementById("input-monitor-cur-font-size");
    if (curFs) {
        curFs.oninput = (e) => {
            const vwVal = parseFloat(e.target.value);
            const valSpan = document.getElementById("lbl-monitor-cur-font-size-val");
            if (valSpan) valSpan.textContent = vwVal.toFixed(1);
            monitorSettings.currentBox.fontSize = `${vwVal.toFixed(1)}vw`;
            if (currentGuideBox && monitorCanvas) {
                const textbox = currentGuideBox.getObjects()[1];
                if (textbox) {
                    textbox.set({ fontSize: (vwVal / 100) * monitorCanvas.getWidth() });
                    monitorCanvas.renderAll();
                }
            }
            broadcastMonitorPreviewSettings();
        };
    }

    const curAlign = document.getElementById("select-monitor-cur-text-align");
    if (curAlign) {
        curAlign.onchange = (e) => {
            const align = e.target.value;
            monitorSettings.currentBox.textAlign = align;
            if (currentGuideBox && monitorCanvas) {
                const textbox = currentGuideBox.getObjects()[1];
                if (textbox) {
                    textbox.set({ textAlign: align });
                    monitorCanvas.renderAll();
                }
            }
            broadcastMonitorPreviewSettings();
        };
    }

    const curColor = document.getElementById("input-monitor-cur-text-color");
    if (curColor) {
        curColor.oninput = (e) => {
            const color = e.target.value;
            monitorSettings.currentBox.textColor = color;
            if (currentGuideBox && monitorCanvas) {
                const textbox = currentGuideBox.getObjects()[1];
                if (textbox) {
                    textbox.set({ fill: color });
                    monitorCanvas.renderAll();
                }
            }
            broadcastMonitorPreviewSettings();
        };
    }

    const curStroke = document.getElementById("input-monitor-cur-stroke-width");
    if (curStroke) {
        curStroke.oninput = (e) => {
            const sw = parseInt(e.target.value);
            const valSpan = document.getElementById("lbl-monitor-cur-stroke-val");
            if (valSpan) valSpan.textContent = sw;
            monitorSettings.currentBox.strokeWidth = sw;
            if (currentGuideBox && monitorCanvas) {
                const scale = monitorCanvas.getWidth() / 1920;
                const textbox = currentGuideBox.getObjects()[1];
                if (textbox) {
                    textbox.set({ strokeWidth: sw * scale });
                    monitorCanvas.renderAll();
                }
            }
            broadcastMonitorPreviewSettings();
        };
    }

    const curLh = document.getElementById("range-monitor-cur-lineheight");
    if (curLh) {
        curLh.oninput = (e) => {
            const lh = parseFloat(e.target.value);
            const valSpan = document.getElementById("val-monitor-cur-lineheight");
            if (valSpan) valSpan.textContent = `${lh.toFixed(2)}x`;
            monitorSettings.currentBox.lineHeight = lh;
            if (currentGuideBox && monitorCanvas) {
                const textbox = currentGuideBox.getObjects()[1];
                if (textbox) {
                    textbox.set({ lineHeight: lh });
                    monitorCanvas.renderAll();
                }
            }
            broadcastMonitorPreviewSettings();
        };
    }

    // 🔵 NEXT 컨트롤 이벤트 바인딩
    const nxtFs = document.getElementById("input-monitor-nxt-font-size");
    if (nxtFs) {
        nxtFs.oninput = (e) => {
            const vwVal = parseFloat(e.target.value);
            const valSpan = document.getElementById("lbl-monitor-nxt-font-size-val");
            if (valSpan) valSpan.textContent = vwVal.toFixed(1);
            monitorSettings.nextBox.fontSize = `${vwVal.toFixed(1)}vw`;
            if (nextGuideBox && monitorCanvas) {
                const textbox = nextGuideBox.getObjects()[1];
                if (textbox) {
                    textbox.set({ fontSize: (vwVal / 100) * monitorCanvas.getWidth() });
                    monitorCanvas.renderAll();
                }
            }
            broadcastMonitorPreviewSettings();
        };
    }

    const nxtAlign = document.getElementById("select-monitor-nxt-text-align");
    if (nxtAlign) {
        nxtAlign.onchange = (e) => {
            const align = e.target.value;
            monitorSettings.nextBox.textAlign = align;
            if (nextGuideBox && monitorCanvas) {
                const textbox = nextGuideBox.getObjects()[1];
                if (textbox) {
                    textbox.set({ textAlign: align });
                    monitorCanvas.renderAll();
                }
            }
            broadcastMonitorPreviewSettings();
        };
    }

    const nxtColor = document.getElementById("input-monitor-nxt-text-color");
    if (nxtColor) {
        nxtColor.oninput = (e) => {
            const color = e.target.value;
            monitorSettings.nextBox.textColor = color;
            if (nextGuideBox && monitorCanvas) {
                const textbox = nextGuideBox.getObjects()[1];
                if (textbox) {
                    textbox.set({ fill: color });
                    monitorCanvas.renderAll();
                }
            }
            broadcastMonitorPreviewSettings();
        };
    }

    const nxtStroke = document.getElementById("input-monitor-nxt-stroke-width");
    if (nxtStroke) {
        nxtStroke.oninput = (e) => {
            const sw = parseInt(e.target.value);
            const valSpan = document.getElementById("lbl-monitor-nxt-stroke-val");
            if (valSpan) valSpan.textContent = sw;
            monitorSettings.nextBox.strokeWidth = sw;
            if (nextGuideBox && monitorCanvas) {
                const scale = monitorCanvas.getWidth() / 1920;
                const textbox = nextGuideBox.getObjects()[1];
                if (textbox) {
                    textbox.set({ strokeWidth: sw * scale });
                    monitorCanvas.renderAll();
                }
            }
            broadcastMonitorPreviewSettings();
        };
    }

    const nxtLh = document.getElementById("range-monitor-nxt-lineheight");
    if (nxtLh) {
        nxtLh.oninput = (e) => {
            const lh = parseFloat(e.target.value);
            const valSpan = document.getElementById("val-monitor-nxt-lineheight");
            if (valSpan) valSpan.textContent = `${lh.toFixed(2)}x`;
            monitorSettings.nextBox.lineHeight = lh;
            if (nextGuideBox && monitorCanvas) {
                const textbox = nextGuideBox.getObjects()[1];
                if (textbox) {
                    textbox.set({ lineHeight: lh });
                    monitorCanvas.renderAll();
                }
            }
            broadcastMonitorPreviewSettings();
        };
    }

    window.addEventListener("resize", () => {
        if (isMonitorOverlayActive) {
            initMonitorLayoutCanvas();
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEditorMonitor);
} else {
    initEditorMonitor();
}

// 전역 함수 및 인터페이스 export
window.showMonitorMainViewer = showMonitorMainViewer;
window.hideMonitorMainViewer = hideMonitorMainViewer;
window.updateMonitorSlideTexts = updateMonitorSlideTexts;
window.subcastMonitorEditor = {
    loadMonitorSettings,
    saveMonitorSettings,
    showMonitorMainViewer,
    hideMonitorMainViewer,
    updateMonitorSlideTexts,
    getSettings: () => monitorSettings,
    isMonitorMode: () => isMonitorOverlayActive
};
