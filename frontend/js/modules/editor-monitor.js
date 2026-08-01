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

    // 3. 모니터 탭 진입시 가이드 박스 생성 (🔴 CURRENT / 🔵 NEXT)
    function enterMonitorMode() {
        if (!canvas) return;
        isMonitorMode = true;

        // 메인 캔버스 렌더링 갱신 시 슬라이드 데이터 오염 방지
        clearMonitorGuideBoxes();
        canvas.clear();
        canvas.backgroundColor = "#0f172a";

        const cur = monitorSettings.currentBox || {};
        const nxt = monitorSettings.nextBox || {};

        // 🔴 CURRENT 가이드 박스 생성
        currentGuideBox = new fabric.Rect({
            left: (cur.leftPct / 100) * BASE_W,
            top: (cur.topPct / 100) * BASE_H,
            width: (cur.widthPct / 100) * BASE_W,
            height: (cur.heightPct / 100) * BASE_H,
            fill: 'rgba(239, 68, 68, 0.15)',
            stroke: '#ef4444',
            strokeWidth: 3,
            strokeDashArray: [6, 6],
            rx: 8,
            ry: 8,
            isMonitorGuide: true,
            boxType: 'currentBox',
            lockRotation: true,
            hasRotatingPoint: false,
            transparentCorners: false,
            cornerColor: '#ef4444',
            cornerSize: 10
        });

        // 🔵 NEXT 가이드 박스 생성
        nextGuideBox = new fabric.Rect({
            left: (nxt.leftPct / 100) * BASE_W,
            top: (nxt.topPct / 100) * BASE_H,
            width: (nxt.widthPct / 100) * BASE_W,
            height: (nxt.heightPct / 100) * BASE_H,
            fill: 'rgba(59, 130, 246, 0.15)',
            stroke: '#3b82f6',
            strokeWidth: 3,
            strokeDashArray: [6, 6],
            rx: 8,
            ry: 8,
            isMonitorGuide: true,
            boxType: 'nextBox',
            lockRotation: true,
            hasRotatingPoint: false,
            transparentCorners: false,
            cornerColor: '#3b82f6',
            cornerSize: 10
        });

        // 텍스트 라벨 추가
        const curLabel = new fabric.Text("🔴 CURRENT (현재 슬라이드)", {
            left: currentGuideBox.left + 15,
            top: currentGuideBox.top + 15,
            fontSize: 16,
            fill: '#ef4444',
            fontWeight: 'bold',
            isMonitorGuide: true,
            selectable: false
        });

        const nxtLabel = new fabric.Text("🔵 NEXT (다음 슬라이드)", {
            left: nextGuideBox.left + 15,
            top: nextGuideBox.top + 15,
            fontSize: 14,
            fill: '#3b82f6',
            fontWeight: 'bold',
            isMonitorGuide: true,
            selectable: false
        });

        canvas.add(currentGuideBox);
        canvas.add(nextGuideBox);
        canvas.add(curLabel);
        canvas.add(nxtLabel);

        // 이벤트 바인딩
        canvas.on('object:modified', handleGuideModified);
        canvas.on('object:moving', syncGuideLabels);
        canvas.on('object:scaling', syncGuideLabels);

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
            canvas.off('object:moving', syncGuideLabels);
            canvas.off('object:scaling', syncGuideLabels);
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

    function syncGuideLabels() {
        if (!canvas || !isMonitorMode) return;
        const objects = canvas.getObjects();
        const curLabel = objects.find(o => o.text && o.text.includes("🔴 CURRENT"));
        const nxtLabel = objects.find(o => o.text && o.text.includes("🔵 NEXT"));

        if (currentGuideBox && curLabel) {
            curLabel.set({ left: currentGuideBox.left + 15, top: currentGuideBox.top + 15 });
        }
        if (nextGuideBox && nxtLabel) {
            nxtLabel.set({ left: nextGuideBox.left + 15, top: nextGuideBox.top + 15 });
        }
        canvas.renderAll();
    }

    // 5. 캔버스 이벤트 정규화 계산
    function handleGuideModified(e) {
        const target = e.target;
        if (!target || !target.isMonitorGuide || !target.boxType) return;

        const boxKey = target.boxType;
        const actualW = target.width * target.scaleX;
        const actualH = target.height * target.scaleY;

        let leftPct = clamp((target.left / BASE_W) * 100, 0, 95);
        let topPct = clamp((target.top / BASE_H) * 100, 0, 95);
        let widthPct = clamp((actualW / BASE_W) * 100, 5, 100 - leftPct);
        let heightPct = clamp((actualH / BASE_H) * 100, 5, 100 - topPct);

        monitorSettings[boxKey] = {
            ...monitorSettings[boxKey],
            leftPct: parseFloat(leftPct.toFixed(2)),
            topPct: parseFloat(topPct.toFixed(2)),
            widthPct: parseFloat(widthPct.toFixed(2)),
            heightPct: parseFloat(heightPct.toFixed(2))
        };

        saveMonitorSettings();
    }

    // UI 정보 업데이트
    function updateInfoUI() {
        const infoEl = document.getElementById("monitor-layout-info");
        if (!infoEl) return;
        const cur = monitorSettings.currentBox || {};
        const nxt = monitorSettings.nextBox || {};
        infoEl.innerHTML = `
            🔴 <strong>CURRENT:</strong> X: ${cur.leftPct}% Y: ${cur.topPct}% W: ${cur.widthPct}% H: ${cur.heightPct}% Font: ${cur.fontSize}px<br>
            🔵 <strong>NEXT:</strong> X: ${nxt.leftPct}% Y: ${nxt.topPct}% W: ${nxt.widthPct}% H: ${nxt.heightPct}% Font: ${nxt.fontSize}px
        `;
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

        // 저장 / 초기화 버튼 이벤트
        document.addEventListener("click", (e) => {
            if (e.target && e.target.id === "btn-save-monitor-layout") {
                saveMonitorSettings();
                alert("무대 모니터 레이아웃 설정이 성공적으로 저장되었습니다.");
            }
            if (e.target && e.target.id === "btn-reset-monitor-layout") {
                if (confirm("무대 모니터 레이아웃을 기본값으로 초기화하시겠습니까?")) {
                    monitorSettings.currentBox = {
                        leftPct: 5.0, topPct: 5.0, widthPct: 90.0, heightPct: 42.0, fontSize: 28, textColor: "#FFFFFF", bgColor: "transparent", isTransparentBg: true
                    };
                    monitorSettings.nextBox = {
                        leftPct: 5.0, topPct: 51.0, widthPct: 90.0, heightPct: 42.0, fontSize: 22, textColor: "#A0A0A0", bgColor: "transparent", isTransparentBg: true
                    };
                    saveMonitorSettings();
                    if (isMonitorMode) {
                        enterMonitorMode();
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
