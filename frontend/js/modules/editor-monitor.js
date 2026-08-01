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

    // 3. 모니터 탭 진입시 텍스트박스 배치 (🔴 CURRENT / 🔵 NEXT)
    function enterMonitorMode() {
        if (!canvas) return;
        isMonitorMode = true;

        clearMonitorGuideBoxes();
        canvas.clear();
        canvas.backgroundColor = "#0f172a";

        const cur = monitorSettings.currentBox || {};
        const nxt = monitorSettings.nextBox || {};

        // 🔴 CURRENT 텍스트박스 (플레이스홀더)
        currentGuideBox = new fabric.Textbox("🔴 현재 슬라이드 내용이 여기에 표시됩니다", {
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

        // 🔵 NEXT 텍스트박스 (플레이스홀더)
        nextGuideBox = new fabric.Textbox("🔵 다음 슬라이드 내용이 여기에 표시됩니다", {
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


    // 5. 캔버스 이벤트 정규화 계산 (Textbox: width와 위치만 저장)
    function handleGuideModified(e) {
        const target = e.target;
        if (!target || !target.isMonitorGuide || !target.boxType) return;

        const boxKey = target.boxType;
        const actualW = target.width * (target.scaleX || 1);

        let leftPct = clamp((target.left / BASE_W) * 100, 0, 95);
        let topPct = clamp((target.top / BASE_H) * 100, 0, 95);
        let widthPct = clamp((actualW / BASE_W) * 100, 5, 100 - leftPct);

        monitorSettings[boxKey] = {
            ...monitorSettings[boxKey],
            leftPct: parseFloat(leftPct.toFixed(2)),
            topPct: parseFloat(topPct.toFixed(2)),
            widthPct: parseFloat(widthPct.toFixed(2))
        };

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

        const curSize = document.getElementById("monitor-cur-fontsize");
        const curWeight = document.getElementById("monitor-cur-fontweight");
        const curColor = document.getElementById("monitor-cur-textcolor");
        const curAlign = document.getElementById("monitor-cur-align");
        if (curSize) curSize.value = cur.fontSize || 28;
        if (curWeight) curWeight.value = cur.fontWeight || "bold";
        if (curColor) curColor.value = cur.textColor || "#ffffff";
        if (curAlign) curAlign.value = cur.textAlign || "center";

        const nxtSize = document.getElementById("monitor-nxt-fontsize");
        const nxtWeight = document.getElementById("monitor-nxt-fontweight");
        const nxtColor = document.getElementById("monitor-nxt-textcolor");
        const nxtAlign = document.getElementById("monitor-nxt-align");
        if (nxtSize) nxtSize.value = nxt.fontSize || 22;
        if (nxtWeight) nxtWeight.value = nxt.fontWeight || "600";
        if (nxtColor) nxtColor.value = nxt.textColor || "#a0a0a0";
        if (nxtAlign) nxtAlign.value = nxt.textAlign || "center";
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

        // 타이포그래피 설정 변경 이벤트 바인딩
        const bindInput = (id, key, subKey) => {
            const el = document.getElementById(id);
            if (!el) return;
            const handler = () => {
                if (!monitorSettings[key]) monitorSettings[key] = {};
                let val = el.value;
                if (subKey === 'fontSize') val = parseInt(val, 10) || 28;
                monitorSettings[key][subKey] = val;
                saveMonitorSettings();
                // 모니터 모드 활성 중이면 캔버스 Textbox에 즉시 반영
                if (isMonitorMode && canvas) {
                    const targetBox = key === 'currentBox' ? currentGuideBox : nextGuideBox;
                    if (targetBox) {
                        const fabricKey = subKey === 'textColor' ? 'fill' : subKey;
                        targetBox.set(fabricKey, val);
                        canvas.renderAll();
                    }
                }
            };
            el.addEventListener("change", handler);
            el.addEventListener("input", handler);
        };

        bindInput("monitor-cur-fontsize", "currentBox", "fontSize");
        bindInput("monitor-cur-fontweight", "currentBox", "fontWeight");
        bindInput("monitor-cur-textcolor", "currentBox", "textColor");
        bindInput("monitor-cur-align", "currentBox", "textAlign");

        bindInput("monitor-nxt-fontsize", "nextBox", "fontSize");
        bindInput("monitor-nxt-fontweight", "nextBox", "fontWeight");
        bindInput("monitor-nxt-textcolor", "nextBox", "textColor");
        bindInput("monitor-nxt-align", "nextBox", "textAlign");

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
