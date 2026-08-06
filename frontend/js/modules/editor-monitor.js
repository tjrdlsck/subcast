// === 무대 모니터링 레이아웃 에디터 캔버스 연동 모듈 ===

(function () {
    let monitorSettings = {
        layoutMode: "custom_canvas",
        currentBox: {
            leftPct: 5.0,
            topPct: 5.0,
            widthPct: 90.0,
            heightPct: 42.0,
            fontSize: 28,
            textColor: "#FFFFFF",
            bgColor: "transparent",
            isTransparentBg: true
        },
        nextBox: {
            leftPct: 5.0,
            topPct: 51.0,
            widthPct: 90.0,
            heightPct: 42.0,
            fontSize: 22,
            textColor: "#A0A0A0",
            bgColor: "transparent",
            isTransparentBg: true
        }
    };

    let isMonitorMode = false;
    let currentGuideBox = null;
    let nextGuideBox = null;
    const BASE_W = (typeof BASE_WIDTH !== 'undefined' && BASE_WIDTH) ? BASE_WIDTH : 768;
    const BASE_H = (typeof BASE_HEIGHT !== 'undefined' && BASE_HEIGHT) ? BASE_HEIGHT : 432;

    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

    // 1. 모니터 설정 로드 (API -> LocalStorage 폴백)
    async function loadMonitorSettings() {
        try {
            const res = await fetch("/api/v1/monitor/settings");
            if (res.ok) {
                const json = await res.json();
                if (json.status === "success" && json.data) {
                    monitorSettings = json.data;
                    localStorage.setItem("subcast_monitor_settings", JSON.stringify(monitorSettings));
                    return;
                }
            }
        } catch (e) {
            console.warn("Failed to fetch monitor settings from API, using LocalStorage fallback", e);
        }

        const local = localStorage.getItem("subcast_monitor_settings");
        if (local) {
            try {
                monitorSettings = JSON.parse(local);
            } catch (e) {
                console.error("Failed to parse local monitor settings", e);
            }
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

    // 2. 모니터 설정 저장 (API + LocalStorage + BroadcastChannel)
    async function saveMonitorSettings() {
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
        updateInfoUI();
    }

    // 무대 모니터 에디터 캔버스 가이드용 표준 더미 텍스트 반환 (슬라이드 가변 텍스트 종속 방지)
    function getInitialSlideTexts() {
        return {
            curText: "[현재 자막 영역]\n현재 슬라이드 자막",
            nextText: "[다음 자막 영역]\n다음 슬라이드 자막"
        };
    }

    // 3. 모니터 탭 진입시 텍스트박스 배치 (🔴 CURRENT / 🔵 NEXT)
    async function enterMonitorMode() {
        if (!canvas) return;
        isMonitorMode = true;

        // 저장을 안 누르고 이탈했다가 들어온 경우를 위해 마지막 저장된 설정 재로드
        await loadMonitorSettings();

        clearMonitorGuideBoxes();
        canvas.clear();
        canvas.backgroundColor = "#0f172a";

        const cur = monitorSettings.currentBox || {};
        const nxt = monitorSettings.nextBox || {};
        const { curText, nextText } = getInitialSlideTexts();

        // 🔴 CURRENT 텍스트박스
        currentGuideBox = new fabric.Textbox(curText, {
            left: (cur.leftPct / 100) * BASE_W,
            top: (cur.topPct / 100) * BASE_H,
            width: (cur.widthPct / 100) * BASE_W,
            minWidth: 150,
            minHeight: 50,
            fontSize: cur.fontSize || 28,
            fill: cur.textColor || '#FFFFFF',
            stroke: cur.strokeColor || 'transparent',
            strokeWidth: cur.strokeWidth !== undefined ? cur.strokeWidth : 0,
            fontWeight: cur.fontWeight || 'bold',
            fontStyle: cur.fontStyle || 'normal',
            fontFamily: cur.fontFamily || 'Inter',
            textAlign: cur.textAlign || 'center',
            opacity: cur.opacity !== undefined ? cur.opacity : 1.0,
            editable: false,
            splitByGrapheme: true,
            lockRotation: true,
            hasRotatingPoint: false,
            transparentCorners: false,
            cornerColor: '#ef4444',
            cornerSize: 10,
            isMonitorGuide: true,
            boxType: 'currentBox',
            paintFirst: 'stroke'
        });

        // 🔵 NEXT 텍스트박스
        nextGuideBox = new fabric.Textbox(nextText, {
            left: (nxt.leftPct / 100) * BASE_W,
            top: (nxt.topPct / 100) * BASE_H,
            width: (nxt.widthPct / 100) * BASE_W,
            minWidth: 150,
            minHeight: 50,
            fontSize: nxt.fontSize || 22,
            fill: nxt.textColor || '#A0A0A0',
            stroke: nxt.strokeColor || 'transparent',
            strokeWidth: nxt.strokeWidth !== undefined ? nxt.strokeWidth : 0,
            fontWeight: nxt.fontWeight || '600',
            fontStyle: nxt.fontStyle || 'normal',
            fontFamily: nxt.fontFamily || 'Inter',
            textAlign: nxt.textAlign || 'center',
            opacity: nxt.opacity !== undefined ? nxt.opacity : 1.0,
            editable: false,
            splitByGrapheme: true,
            lockRotation: true,
            hasRotatingPoint: false,
            transparentCorners: false,
            cornerColor: '#3b82f6',
            cornerSize: 10,
            isMonitorGuide: true,
            boxType: 'nextBox',
            paintFirst: 'stroke'
        });

        canvas.add(currentGuideBox);
        canvas.add(nextGuideBox);

        // 🔴/🔵 외 추가된 커스텀 도형 및 사진 요소 복원
        if (Array.isArray(monitorSettings.customElements) && typeof deserializeElement === 'function') {
            monitorSettings.customElements.forEach(elem => {
                const obj = deserializeElement(elem, BASE_W, BASE_H);
                if (obj) {
                    canvas.add(obj);
                }
            });
        }

        // 이벤트 바인딩
        canvas.on('object:added', handleCustomObjectChanged);
        canvas.on('object:removed', handleCustomObjectChanged);
        canvas.on('object:modified', handleGuideModified);
        canvas.on('object:moving', handleGuideModified);
        canvas.on('object:scaling', handleGuideModified);

        canvas.renderAll();
        updateInfoUI();
        broadcastMonitorPreviewSettings();
    }

    // 4. 모니터 탭 이탈 시 가이드 해제 및 슬라이드 복원
    function exitMonitorMode() {
        if (!isMonitorMode) return;
        
        // 🔴 중요: clearMonitorGuideBoxes()를 isMonitorMode=true인 상태에서 먼저 실행해야
        // 캔버스 object:removed 이벤트 발생 시 saveStateToHistory의 모니터 가드에 걸려 슬라이드 오토세이브 덮어쓰기가 방지됨!
        clearMonitorGuideBoxes();
        isMonitorMode = false;

        if (canvas) {
            canvas.off('object:added', handleCustomObjectChanged);
            canvas.off('object:removed', handleCustomObjectChanged);
            canvas.off('object:modified', handleGuideModified);
            canvas.off('object:moving', handleGuideModified);
            canvas.off('object:scaling', handleGuideModified);
        }

        if (typeof renderSlide === 'function' && typeof activeSlideId !== 'undefined' && activeSlideId) {
            renderSlide(activeSlideId);
        }
    }

    function clearMonitorGuideBoxes() {
        if (!canvas) return;
        const objects = canvas.getObjects();
        const guides = objects.filter(o => o.isMonitorGuide);
        guides.forEach(g => canvas.remove(g));
    }

    function colorToHex(color) {
        if (!color || color === 'transparent') return "#ffffff";
        if (typeof color !== 'string') return "#ffffff";
        if (color.startsWith("#")) return color;
        if (color.startsWith("rgb")) {
            const rgb = color.match(/\d+/g);
            if (rgb && rgb.length >= 3) {
                return "#" + ((1 << 24) + (parseInt(rgb[0]) << 16) + (parseInt(rgb[1]) << 8) + parseInt(rgb[2])).toString(16).slice(1);
            }
        }
        return color;
    }

    // 캔버스 객체 좌표 및 속성을 monitorSettings 객체에 동기화
    function syncCanvasToMonitorSettings() {
        if (!isMonitorMode || !canvas) return;
        const updateBox = (boxObj, boxKey) => {
            if (!boxObj) return;
            const actualW = boxObj.width * (boxObj.scaleX || 1);
            const actualH = boxObj.height * (boxObj.scaleY || 1);

            let leftPct = clamp((boxObj.left / BASE_W) * 100, 0, 95);
            let topPct = clamp((boxObj.top / BASE_H) * 100, 0, 95);
            let widthPct = clamp((actualW / BASE_W) * 100, 5, 100 - leftPct);
            let heightPct = clamp((actualH / BASE_H) * 100, 5, 100 - topPct);

            // 스케일 정규화 (scaleX, scaleY를 1로 맞추고 width 계산 대입)
            const targetPixelWidth = (widthPct / 100) * BASE_W;
            boxObj.set({
                width: targetPixelWidth,
                scaleX: 1,
                scaleY: 1
            });

            const fillColor = typeof boxObj.fill === 'string' ? boxObj.fill : '#ffffff';
            const hexColor = colorToHex(fillColor);
            const strokeColorVal = boxObj.stroke ? colorToHex(typeof boxObj.stroke === 'string' ? boxObj.stroke : 'transparent') : 'transparent';
            const strokeWidthVal = boxObj.strokeWidth !== undefined ? boxObj.strokeWidth : 0;
            const fontStyleVal = boxObj.fontStyle || 'normal';
            const opacityVal = boxObj.opacity !== undefined ? boxObj.opacity : 1.0;

            const baseFontSize = boxObj.fontSize || (boxKey === 'currentBox' ? 28 : 22);
            const effectiveFontSize = Math.round(baseFontSize * (boxObj.scaleY || 1));

            monitorSettings[boxKey] = {
                ...monitorSettings[boxKey],
                leftPct: parseFloat(leftPct.toFixed(2)),
                topPct: parseFloat(topPct.toFixed(2)),
                widthPct: parseFloat(widthPct.toFixed(2)),
                heightPct: parseFloat(heightPct.toFixed(2)),
                fontSize: effectiveFontSize,
                textColor: hexColor,
                strokeColor: strokeColorVal,
                strokeWidth: strokeWidthVal,
                fontWeight: boxObj.fontWeight || (boxKey === 'currentBox' ? "bold" : "600"),
                fontStyle: fontStyleVal,
                fontFamily: boxObj.fontFamily || "Inter",
                textAlign: boxObj.textAlign || "center",
                opacity: opacityVal
            };
        };

        updateBox(currentGuideBox, 'currentBox');
        updateBox(nextGuideBox, 'nextBox');

        // 커스텀 요소들(도형 및 이미지) 직렬화 저장
        if (typeof serializeElement === 'function') {
            const customObjs = canvas.getObjects().filter(o => !o.isMonitorGuide);
            monitorSettings.customElements = customObjs.map(o => serializeElement(o, BASE_W, BASE_H));
        }
    }

    function notifyMonitorChanged() {
        if (!isMonitorMode || !canvas) return;
        syncCanvasToMonitorSettings();
        updateInfoUI();
        broadcastMonitorPreviewSettings();
    }

    // 5. 캔버스 이벤트 정규화 계산 (실시간 미리보기만 업데이트, 저장 버튼 클릭 전까지 방송 금지)
    function handleGuideModified(e) {
        notifyMonitorChanged();
    }

    function handleCustomObjectChanged(e) {
        if (!isMonitorMode) return;
        const target = e.target;
        if (target && target.isMonitorGuide) return;
        syncCanvasToMonitorSettings();
        updateInfoUI();
        broadcastMonitorPreviewSettings();
    }

    // UI 정보 업데이트
    function updateInfoUI() {
        const infoEl = document.getElementById("monitor-layout-info");
        const cur = monitorSettings.currentBox || {};
        const nxt = monitorSettings.nextBox || {};

        if (infoEl) {
            infoEl.innerHTML = `
                🔴 <strong>CURRENT:</strong> X: ${cur.leftPct}% Y: ${cur.topPct}% W: ${cur.widthPct}% H: ${cur.heightPct}% Font: ${cur.fontSize}px (${cur.fontWeight || 'bold'})<br>
                🔵 <strong>NEXT:</strong> X: ${nxt.leftPct}% Y: ${nxt.topPct}% W: ${nxt.widthPct}% H: ${nxt.heightPct}% Font: ${nxt.fontSize}px (${nxt.fontWeight || '600'})
            `;
        }
    }

    // 6. 초기화
    function initEditorMonitor() {
        loadMonitorSettings();

        // 탭 변경 리스너
        const originalSwitchLeftTab = window.switchLeftTab;
        window.switchLeftTab = function (targetPanelId) {
            if (typeof originalSwitchLeftTab === 'function') {
                originalSwitchLeftTab(targetPanelId);
            }
            if (targetPanelId === 'panel-monitor') {
                enterMonitorMode();
            } else {
                exitMonitorMode();
            }
        };

        // 이미지 파일 input 변경 리스너
        const monitorImgInput = document.getElementById("monitor-image-input");
        if (monitorImgInput) {
            monitorImgInput.onchange = (e) => {
                const file = e.target.files && e.target.files[0];
                if (file && typeof window.insertImageToCanvas === 'function') {
                    window.insertImageToCanvas(file);
                    monitorImgInput.value = "";
                }
            };
        }

        // 저장 / 초기화 및 도형/사진 추가 버튼 이벤트
        document.addEventListener("click", (e) => {
            let btn = e.target;
            while (btn && btn !== document) {
                const targetId = btn.id || "";
                if (targetId === "btn-save-monitor-layout") {
                    syncCanvasToMonitorSettings();
                    saveMonitorSettings();
                    alert("무대 모니터 레이아웃 설정이 성공적으로 저장되었습니다.");
                    break;
                }
                if (targetId === "btn-reset-monitor-layout") {
                    if (confirm("무대 모니터 레이아웃을 기본값으로 초기화하시겠습니까?")) {
                        monitorSettings.currentBox = {
                            leftPct: 5.0, topPct: 5.0, widthPct: 90.0, heightPct: 42.0, fontSize: 28, textColor: "#FFFFFF", bgColor: "transparent", isTransparentBg: true, fontWeight: "bold", fontFamily: "Inter", textAlign: "center"
                        };
                        monitorSettings.nextBox = {
                            leftPct: 5.0, topPct: 51.0, widthPct: 90.0, heightPct: 42.0, fontSize: 22, textColor: "#A0A0A0", bgColor: "transparent", isTransparentBg: true, fontWeight: "600", fontFamily: "Inter", textAlign: "center"
                        };
                        monitorSettings.customElements = [];
                        saveMonitorSettings();
                        if (isMonitorMode) {
                            enterMonitorMode();
                        }
                    }
                    break;
                }
                if (targetId === "btn-monitor-add-rect") {
                    if (typeof window.addRect === 'function') window.addRect();
                    break;
                }
                if (targetId === "btn-monitor-add-circle") {
                    if (typeof window.addCircle === 'function') window.addCircle();
                    break;
                }
                if (targetId === "btn-monitor-add-triangle") {
                    if (typeof window.addTriangle === 'function') window.addTriangle();
                    break;
                }
                if (targetId === "btn-monitor-add-line") {
                    if (typeof window.addLine === 'function') window.addLine();
                    break;
                }
                if (targetId === "btn-monitor-add-image") {
                    const input = document.getElementById("monitor-image-input");
                    if (input) input.click();
                    break;
                }
                btn = btn.parentElement;
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initEditorMonitor);
    } else {
        initEditorMonitor();
    }

    window.subcastMonitorEditor = {
        loadMonitorSettings,
        saveMonitorSettings,
        enterMonitorMode,
        exitMonitorMode,
        syncCanvasToMonitorSettings,
        broadcastMonitorSettings,
        notifyMonitorChanged,
        handleGuideModified,
        getSettings: () => monitorSettings,
        isMonitorMode: () => isMonitorMode
    };
})();
