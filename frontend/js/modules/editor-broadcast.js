// ==========================================================================
// Subcast Module: editor-broadcast.js (찬양 방송 자막 레이아웃 전용 편집기)
// ==========================================================================

let broadcastCanvas = null;
let broadcastTextbox = null;
let broadcastBgBar = null;
let currentDraftLayout = null; // 사용자가 편집 중인 임시 레이아웃 (저장 버튼 누르기 전)

const DEFAULT_PRAISE_BROADCAST_LAYOUT = {
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
    bgBarColor: "rgba(0, 0, 0, 0.65)",
    bgBarY: 72.0,
    bgBarHeight: 22.0
};

function getPraiseBroadcastLayout() {
    if (window.projectData && window.projectData.settings && window.projectData.settings.praiseBroadcastLayout) {
        return { ...DEFAULT_PRAISE_BROADCAST_LAYOUT, ...window.projectData.settings.praiseBroadcastLayout };
    }
    try {
        const local = localStorage.getItem("subcast_praise_broadcast_layout");
        if (local) {
            return { ...DEFAULT_PRAISE_BROADCAST_LAYOUT, ...JSON.parse(local) };
        }
    } catch (e) {
        console.warn("Failed to parse local broadcast layout", e);
    }
    return { ...DEFAULT_PRAISE_BROADCAST_LAYOUT };
}

function showBroadcastMainViewer() {
    const overlay = document.getElementById("broadcast-main-viewer-overlay");
    if (overlay) {
        overlay.style.display = "flex";
        setTimeout(() => {
            initBroadcastLayoutCanvas();
        }, 50);
    }
}

function hideBroadcastMainViewer() {
    const overlay = document.getElementById("broadcast-main-viewer-overlay");
    if (overlay) {
        overlay.style.display = "none";
    }
}

function initBroadcastLayoutCanvas() {
    const canvasContainer = document.getElementById("broadcast-canvas-container");
    const canvasEl = document.getElementById("broadcast-editor-canvas");
    if (!canvasContainer || !canvasEl) return;

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

    if (broadcastCanvas) {
        broadcastCanvas.dispose();
        broadcastCanvas = null;
    }

    broadcastCanvas = new fabric.Canvas("broadcast-editor-canvas", {
        width: renderW,
        height: renderH,
        backgroundColor: "transparent",
        selection: false
    });

    currentDraftLayout = { ...getPraiseBroadcastLayout() };
    renderBroadcastCanvasObjects(currentDraftLayout, renderW, renderH);
    syncBroadcastUIControls(currentDraftLayout);
}

function renderBroadcastCanvasObjects(layout, canvasW, canvasH) {
    if (!broadcastCanvas) return;
    broadcastCanvas.clear();

    const scale = canvasW / 1920;
    const x = (layout.x / 100) * canvasW;
    const y = (layout.y / 100) * canvasH;
    const w = (layout.width / 100) * canvasW;
    const h = (layout.height / 100) * canvasH;

    // 1. 반투명 자막 바
    if (layout.hasBgBar) {
        const barY = (layout.bgBarY / 100) * canvasH;
        const barH = (layout.bgBarHeight / 100) * canvasH;
        broadcastBgBar = new fabric.Rect({
            left: 0,
            top: barY,
            width: canvasW,
            height: barH,
            fill: layout.bgBarColor || "rgba(0,0,0,0.65)",
            selectable: false,
            evented: false
        });
        broadcastCanvas.add(broadcastBgBar);
    } else {
        broadcastBgBar = null;
    }

    // 2. 가사 텍스트 상자 (마우스로 드래그 및 크기 조정 가능, 직접 타이핑 편집은 잠금)
    let fontSize = 28;
    if (layout.fontSize) {
        const match = layout.fontSize.match(/^(\d+(?:\.\d+)?)\s*vw$/);
        fontSize = match ? (parseFloat(match[1]) / 100) * canvasW : parseInt(layout.fontSize) || 28;
    }

    broadcastTextbox = new fabric.Textbox("나 무엇과도 주님을 바꾸지 않으리\n(찬양 가사가 방송 화면의 이 위치에 송출됩니다)", {
        left: x,
        top: y,
        width: w,
        fontSize: fontSize,
        fontFamily: layout.fontFamily || "Inter",
        fontWeight: layout.fontWeight || "700",
        textAlign: layout.textAlign || "center",
        fill: layout.fontColor || "#ffffff",
        stroke: layout.strokeColor || "#000000",
        strokeWidth: layout.strokeWidth !== undefined ? (layout.strokeWidth / 1920) * canvasW : 3,
        paintFirst: "stroke",
        splitByGrapheme: false,
        editable: false,
        cornerColor: "#38bdf8",
        cornerSize: 10,
        transparentCorners: false,
        borderColor: "#0284c7",
        hasRotatingPoint: false,
        lockRotation: true
    });

    // 드래그 및 리사이즈 시 에디터 임시 좌표(%)만 갱신 (저장 버튼 누르기 전까지 OBS 송출 안 됨)
    broadcastTextbox.on("modified", () => {
        if (!broadcastCanvas || !broadcastTextbox) return;
        const curW = broadcastCanvas.getWidth();
        const curH = broadcastCanvas.getHeight();

        const newX = (broadcastTextbox.left / curW) * 100;
        const newY = (broadcastTextbox.top / curH) * 100;
        const newWidth = ((broadcastTextbox.width * broadcastTextbox.scaleX) / curW) * 100;
        const newHeight = ((broadcastTextbox.height * broadcastTextbox.scaleY) / curH) * 100;

        if (!currentDraftLayout) currentDraftLayout = { ...getPraiseBroadcastLayout() };
        currentDraftLayout.x = Math.round(newX * 10) / 10;
        currentDraftLayout.y = Math.round(newY * 10) / 10;
        currentDraftLayout.width = Math.round(newWidth * 10) / 10;
        currentDraftLayout.height = Math.round(newHeight * 10) / 10;

        if (currentDraftLayout.hasBgBar) {
            currentDraftLayout.bgBarY = Math.max(0, currentDraftLayout.y - 4);
            currentDraftLayout.bgBarHeight = currentDraftLayout.height + 8;
            if (broadcastBgBar) {
                broadcastBgBar.set({
                    top: (currentDraftLayout.bgBarY / 100) * curH,
                    height: (currentDraftLayout.bgBarHeight / 100) * curH
                });
                broadcastCanvas.renderAll();
            }
        }
    });

    broadcastCanvas.add(broadcastTextbox);
    broadcastCanvas.setActiveObject(broadcastTextbox);
    broadcastCanvas.renderAll();
}

function syncBroadcastUIControls(layout) {
    const fsInput = document.getElementById("input-broadcast-font-size");
    const fsVal = document.getElementById("lbl-broadcast-font-size-val");
    if (fsInput && layout.fontSize) {
        const val = parseFloat(layout.fontSize) || 3.5;
        fsInput.value = val;
        if (fsVal) fsVal.textContent = val.toFixed(1);
    }

    const alignSelect = document.getElementById("select-broadcast-text-align");
    if (alignSelect && layout.textAlign) {
        alignSelect.value = layout.textAlign;
    }

    const strokeInput = document.getElementById("input-broadcast-stroke-width");
    const strokeVal = document.getElementById("lbl-broadcast-stroke-val");
    if (strokeInput) {
        strokeInput.value = layout.strokeWidth !== undefined ? layout.strokeWidth : 3;
        if (strokeVal) strokeVal.textContent = strokeInput.value;
    }

    const bgBarChk = document.getElementById("chk-broadcast-bg-bar");
    if (bgBarChk) {
        bgBarChk.checked = !!layout.hasBgBar;
    }
}

// [핵심] 사용자가 '저장' 버튼을 클릭했을 때만 서버 및 OBS 송출 화면으로 전송!
function savePraiseBroadcastLayoutDirect(layout, notifyUser = true) {
    if (!window.projectData) window.projectData = {};
    if (!window.projectData.settings) window.projectData.settings = {};

    window.projectData.settings.praiseBroadcastLayout = layout;

    // 1. LocalStorage 영구 저장
    try {
        localStorage.setItem("subcast_praise_broadcast_layout", JSON.stringify(layout));
    } catch (e) {
        console.warn("Failed to cache layout to localStorage", e);
    }

    // 2. WebSocket 서버 저장 및 OBS 송출 화면으로 전송
    const socket = window.ws || (typeof ws !== 'undefined' ? ws : null);
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: "UPDATE_PRAISE_BROADCAST_LAYOUT",
            layout: layout
        }));
    }

    // 3. 브라우저 탭 간 BroadcastChannel 송출 반영
    if (window.BroadcastChannel) {
        try {
            const bc = new BroadcastChannel("subcast_broadcast_channel");
            bc.postMessage({ type: "PRAISE_BROADCAST_LAYOUT_UPDATED", layout: layout });
        } catch (e) {}
    }

    if (notifyUser) {
        if (typeof showToast === "function") {
            showToast("찬양 방송 자막 레이아웃이 저장 및 적용되었습니다.");
        } else {
            alert("찬양 방송 자막 레이아웃이 저장 및 적용되었습니다.");
        }
    }
}

function savePraiseBroadcastLayoutFromUI() {
    if (!currentDraftLayout) {
        currentDraftLayout = { ...getPraiseBroadcastLayout() };
    }

    // 캔버스 객체에서 최신 좌표 추출
    if (broadcastCanvas && broadcastTextbox) {
        const curW = broadcastCanvas.getWidth();
        const curH = broadcastCanvas.getHeight();
        currentDraftLayout.x = Math.round(((broadcastTextbox.left / curW) * 100) * 10) / 10;
        currentDraftLayout.y = Math.round(((broadcastTextbox.top / curH) * 100) * 10) / 10;
        currentDraftLayout.width = Math.round((((broadcastTextbox.width * broadcastTextbox.scaleX) / curW) * 100) * 10) / 10;
        currentDraftLayout.height = Math.round((((broadcastTextbox.height * broadcastTextbox.scaleY) / curH) * 100) * 10) / 10;
    }

    const fsInput = document.getElementById("input-broadcast-font-size");
    if (fsInput) {
        currentDraftLayout.fontSize = `${parseFloat(fsInput.value)}vw`;
    }

    const alignSelect = document.getElementById("select-broadcast-text-align");
    if (alignSelect) {
        currentDraftLayout.textAlign = alignSelect.value;
    }

    const strokeInput = document.getElementById("input-broadcast-stroke-width");
    if (strokeInput) {
        currentDraftLayout.strokeWidth = parseInt(strokeInput.value, 10);
    }

    const bgBarChk = document.getElementById("chk-broadcast-bg-bar");
    if (bgBarChk) {
        currentDraftLayout.hasBgBar = bgBarChk.checked;
        if (currentDraftLayout.hasBgBar) {
            currentDraftLayout.bgBarY = Math.max(0, currentDraftLayout.y - 4);
            currentDraftLayout.bgBarHeight = currentDraftLayout.height + 8;
        }
    }

    // 최종 확정 저장 및 OBS 화면 동기화
    savePraiseBroadcastLayoutDirect(currentDraftLayout, true);

    if (broadcastCanvas) {
        renderBroadcastCanvasObjects(currentDraftLayout, broadcastCanvas.getWidth(), broadcastCanvas.getHeight());
    }
}

function resetPraiseBroadcastLayout() {
    if (confirm("찬양 방송 자막 레이아웃을 기본값(하단 중앙)으로 초기화하시겠습니까?")) {
        currentDraftLayout = { ...DEFAULT_PRAISE_BROADCAST_LAYOUT };
        savePraiseBroadcastLayoutDirect(DEFAULT_PRAISE_BROADCAST_LAYOUT, true);
        if (broadcastCanvas) {
            renderBroadcastCanvasObjects(DEFAULT_PRAISE_BROADCAST_LAYOUT, broadcastCanvas.getWidth(), broadcastCanvas.getHeight());
            syncBroadcastUIControls(DEFAULT_PRAISE_BROADCAST_LAYOUT);
        }
    }
}

// 이벤트 리스너 바인딩
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn-save-broadcast-layout")?.addEventListener("click", savePraiseBroadcastLayoutFromUI);
    document.getElementById("btn-broadcast-apply-quick")?.addEventListener("click", savePraiseBroadcastLayoutFromUI);
    document.getElementById("btn-reset-broadcast-layout")?.addEventListener("click", resetPraiseBroadcastLayout);

    // 슬라이더 조작 시 에디터 캔버스 미리보기만 실시간 변경 (저장 누르기 전엔 OBS로 나가지 않음)
    const fsInput = document.getElementById("input-broadcast-font-size");
    const fsVal = document.getElementById("lbl-broadcast-font-size-val");
    if (fsInput) {
        fsInput.addEventListener("input", (e) => {
            if (fsVal) fsVal.textContent = parseFloat(e.target.value).toFixed(1);
            if (broadcastTextbox && broadcastCanvas) {
                const w = broadcastCanvas.getWidth();
                broadcastTextbox.set("fontSize", (parseFloat(e.target.value) / 100) * w);
                broadcastCanvas.renderAll();
            }
            if (currentDraftLayout) currentDraftLayout.fontSize = `${parseFloat(e.target.value)}vw`;
        });
    }

    const strokeInput = document.getElementById("input-broadcast-stroke-width");
    const strokeVal = document.getElementById("lbl-broadcast-stroke-val");
    if (strokeInput) {
        strokeInput.addEventListener("input", (e) => {
            if (strokeVal) strokeVal.textContent = e.target.value;
            if (broadcastTextbox && broadcastCanvas) {
                const w = broadcastCanvas.getWidth();
                broadcastTextbox.set("strokeWidth", (parseInt(e.target.value, 10) / 1920) * w);
                broadcastCanvas.renderAll();
            }
            if (currentDraftLayout) currentDraftLayout.strokeWidth = parseInt(e.target.value, 10);
        });
    }

    const alignSelect = document.getElementById("select-broadcast-text-align");
    if (alignSelect) {
        alignSelect.addEventListener("change", (e) => {
            if (broadcastTextbox && broadcastCanvas) {
                broadcastTextbox.set("textAlign", e.target.value);
                broadcastCanvas.renderAll();
            }
            if (currentDraftLayout) currentDraftLayout.textAlign = e.target.value;
        });
    }

    const bgBarChk = document.getElementById("chk-broadcast-bg-bar");
    if (bgBarChk) {
        bgBarChk.addEventListener("change", () => {
            if (!currentDraftLayout) currentDraftLayout = { ...getPraiseBroadcastLayout() };
            currentDraftLayout.hasBgBar = bgBarChk.checked;
            if (currentDraftLayout.hasBgBar) {
                currentDraftLayout.bgBarY = Math.max(0, currentDraftLayout.y - 4);
                currentDraftLayout.bgBarHeight = currentDraftLayout.height + 8;
            }
            if (broadcastCanvas) {
                renderBroadcastCanvasObjects(currentDraftLayout, broadcastCanvas.getWidth(), broadcastCanvas.getHeight());
            }
        });
    }
});
