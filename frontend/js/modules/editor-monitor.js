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

        // BroadcastChannel 통지
        if (window.BroadcastChannel) {
            try {
                const bc = new BroadcastChannel("subcast_monitor_channel");
                bc.postMessage({ type: "MONITOR_LAYOUT_UPDATE", settings: monitorSettings });
                bc.close();
            } catch (e) {
                console.error("Failed to post message to BroadcastChannel", e);
            }
        }
        updateInfoUI();
    }

    // 슬라이드 데이터에서 첫 슬라이드 또는 현재 선택 슬라이드 텍스트 추출
    function getInitialSlideTexts() {
        if (typeof projectData !== 'undefined' && projectData && projectData.slides && projectData.slides.length > 0) {
            const activeIdx = typeof activeSlideId !== 'undefined' && activeSlideId 
                ? projectData.slides.findIndex(s => s.id === activeSlideId) 
                : 0;
            const curIdx = activeIdx !== -1 ? activeIdx : 0;
            const curSlide = projectData.slides[curIdx];
            const nextSlide = (curIdx + 1 < projectData.slides.length) ? projectData.slides[curIdx + 1] : null;

            const extractText = (slide) => {
                if (!slide || !slide.elements) return "";
                return slide.elements
                    .filter(e => e.type === "text" || e.type === "i-text" || e.type === "textbox")
                    .map(e => e.content || "")
                    .filter(Boolean)
                    .join("\n");
            };

            const curText = curSlide ? (extractText(curSlide) || curSlide.name || `슬라이드 ${curIdx + 1}`) : "";
            const nextText = (curIdx + 1 >= projectData.slides.length) 
                ? "[마지막 슬라이드입니다]" 
                : (nextSlide ? (extractText(nextSlide) || nextSlide.name || `슬라이드 ${curIdx + 2}`) : "");

            return { curText, nextText };
        }
        return {
            curText: "🔴 현재 슬라이드 내용이 여기에 표시됩니다",
            nextText: "🔵 다음 슬라이드 내용이 여기에 표시됩니다"
        };
    }

    // 3. 모니터 탭 진입시 텍스트박스 배치 (🔴 CURRENT / 🔵 NEXT)
    function enterMonitorMode() {
        if (!canvas) return;
        isMonitorMode = true;

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
            fontSize: cur.fontSize || 28,
            fill: cur.textColor || '#FFFFFF',
            fontWeight: cur.fontWeight || 'bold',
            fontFamily: cur.fontFamily || 'Inter',
            textAlign: cur.textAlign || 'center',
            editable: false,
            lockRotation: true,
            hasRotatingPoint: false,
            transparentCorners: false,
            cornerColor: '#ef4444',
            cornerSize: 10,
            isMonitorGuide: true,
            boxType: 'currentBox'
        });

        // 🔵 NEXT 텍스트박스
        nextGuideBox = new fabric.Textbox(nextText, {
            left: (nxt.leftPct / 100) * BASE_W,
            top: (nxt.topPct / 100) * BASE_H,
            width: (nxt.widthPct / 100) * BASE_W,
            fontSize: nxt.fontSize || 22,
            fill: nxt.textColor || '#A0A0A0',
            fontWeight: nxt.fontWeight || '600',
            fontFamily: nxt.fontFamily || 'Inter',
            textAlign: nxt.textAlign || 'center',
            editable: false,
            lockRotation: true,
            hasRotatingPoint: false,
            transparentCorners: false,
            cornerColor: '#3b82f6',
            cornerSize: 10,
            isMonitorGuide: true,
            boxType: 'nextBox'
        });

        canvas.add(currentGuideBox);
        canvas.add(nextGuideBox);

        // 이벤트 바인딩
        canvas.on('object:modified', handleGuideModified);
        canvas.on('object:moving', handleGuideModified);
        canvas.on('object:scaling', handleGuideModified);

        canvas.renderAll();
        updateInfoUI();
    }

    // 4. 모니터 탭 이탈 시 가이드 해제 및 슬라이드 복원
    function exitMonitorMode() {
        if (!isMonitorMode) return;
        isMonitorMode = false;
        clearMonitorGuideBoxes();

        if (canvas) {
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

            const fillColor = typeof boxObj.fill === 'string' ? boxObj.fill : '#ffffff';
            const hexColor = colorToHex(fillColor);

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
                fontWeight: boxObj.fontWeight || (boxKey === 'currentBox' ? "bold" : "600"),
                fontFamily: boxObj.fontFamily || "Inter",
                textAlign: boxObj.textAlign || "center"
            };
        };

        updateBox(currentGuideBox, 'currentBox');
        updateBox(nextGuideBox, 'nextBox');
    }

    // 5. 캔버스 이벤트 정규화 계산
    function handleGuideModified(e) {
        const target = e.target;
        if (!target || !target.isMonitorGuide || !target.boxType) return;
        syncCanvasToMonitorSettings();
        saveMonitorSettings();
    }

    // UI 정보 및 타이포그래피 입력란 업데이트
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

        // 현재 사용자가 입력 중(포커스)인 input 요소는 값 덮어쓰기 방지
        const active = document.activeElement;

        const setValIfNotActive = (id, val) => {
            const el = document.getElementById(id);
            if (el && el !== active) {
                el.value = val;
            }
        };

        setValIfNotActive("monitor-cur-fontsize", cur.fontSize || 28);
        setValIfNotActive("monitor-cur-fontweight", cur.fontWeight || "bold");
        setValIfNotActive("monitor-cur-textcolor", cur.textColor || "#ffffff");
        setValIfNotActive("monitor-cur-align", cur.textAlign || "center");

        setValIfNotActive("monitor-nxt-fontsize", nxt.fontSize || 22);
        setValIfNotActive("monitor-nxt-fontweight", nxt.fontWeight || "600");
        setValIfNotActive("monitor-nxt-textcolor", nxt.textColor || "#a0a0a0");
        setValIfNotActive("monitor-nxt-align", nxt.textAlign || "center");
    }

    // 6. 초기화
    function initEditorMonitor() {
        loadMonitorSettings();

        // PIP 미니 미리보기 뷰포트 실시간 동기화 수신기
        if (window.BroadcastChannel) {
            try {
                const bc = new BroadcastChannel("subcast_monitor_channel");
                bc.onmessage = (event) => {
                    const data = event.data;
                    if (!data) return;
                    if (data.type === "SLIDE_CHANGE") {
                        const curEl = document.getElementById("pip-preview-current-text");
                        const nxtEl = document.getElementById("pip-preview-next-text");
                        if (curEl && data.currentContent !== undefined) {
                            curEl.textContent = "🔴 " + (data.currentContent || "(빈 슬라이드)");
                        }
                        if (nxtEl && data.nextContent !== undefined) {
                            nxtEl.textContent = "🔵 " + (data.nextContent || "(마지막 슬라이드)");
                        }
                    }
                };
            } catch (e) {
                console.error("Failed to initialize BroadcastChannel listener for PIP preview", e);
            }
        }

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

        // 저장 / 초기화 / 팝업 / 전체화면 버튼 이벤트
        document.addEventListener("click", (e) => {
            const targetId = e.target ? e.target.id : "";
            if (targetId === "btn-save-monitor-layout") {
                syncCanvasToMonitorSettings();
                saveMonitorSettings();
                alert("무대 모니터 레이아웃 설정이 성공적으로 저장되었습니다.");
            }
            if (targetId === "btn-reset-monitor-layout") {
                if (confirm("무대 모니터 레이아웃을 기본값으로 초기화하시겠습니까?")) {
                    monitorSettings.currentBox = {
                        leftPct: 5.0, topPct: 5.0, widthPct: 90.0, heightPct: 42.0, fontSize: 28, textColor: "#FFFFFF", bgColor: "transparent", isTransparentBg: true, fontWeight: "bold", fontFamily: "Inter", textAlign: "center"
                    };
                    monitorSettings.nextBox = {
                        leftPct: 5.0, topPct: 51.0, widthPct: 90.0, heightPct: 42.0, fontSize: 22, textColor: "#A0A0A0", bgColor: "transparent", isTransparentBg: true, fontWeight: "600", fontFamily: "Inter", textAlign: "center"
                    };
                    saveMonitorSettings();
                    if (isMonitorMode) {
                        enterMonitorMode();
                    }
                }
            }
            if (targetId === "btn-open-monitor-window") {
                window.open("/static/monitor.html", "SubcastStageMonitor", "width=1280,height=720,resizable=yes");
            }
            if (targetId === "btn-fullscreen-monitor") {
                const previewBox = document.getElementById("pip-monitor-preview-box");
                if (previewBox) {
                    if (document.fullscreenElement) {
                        document.exitFullscreen();
                    } else if (previewBox.requestFullscreen) {
                        previewBox.requestFullscreen();
                    }
                }
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
        getSettings: () => monitorSettings,
        isMonitorMode: () => isMonitorMode
    };
})();
