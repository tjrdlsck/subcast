/* 모니터링 화면 자유 캔버스 레이아웃 편집기 */
let isMonitorEditMode = false;

function syncMonitorNumericInputs() {
    if (!canvas || !isMonitorEditMode) return;
    const currObj = canvas.getObjects().find(o => o.monitorRole === 'current');
    const nextObj = canvas.getObjects().find(o => o.monitorRole === 'next');
    const baseW = (typeof BASE_WIDTH !== 'undefined' && BASE_WIDTH) ? BASE_WIDTH : 768;
    const baseH = (typeof BASE_HEIGHT !== 'undefined' && BASE_HEIGHT) ? BASE_HEIGHT : 432;

    const updateInputs = (obj, role) => {
        if (!obj) return;
        const actualW = obj.width * (obj.scaleX || 1);
        const actualH = obj.height * (obj.scaleY || 1);
        const leftPct = Math.max(0, Math.min(100, Math.round((obj.left / baseW) * 100)));
        const topPct = Math.max(0, Math.min(100, Math.round((obj.top / baseH) * 100)));
        const widthPct = Math.max(5, Math.min(100, Math.round((actualW / baseW) * 100)));
        const heightPct = Math.max(5, Math.min(100, Math.round((actualH / baseH) * 100)));

        const elX = document.getElementById(`num-monitor-${role}-x`);
        const elY = document.getElementById(`num-monitor-${role}-y`);
        const elW = document.getElementById(`num-monitor-${role}-w`);
        const elH = document.getElementById(`num-monitor-${role}-h`);
        const elFS = document.getElementById(`num-monitor-${role}-fontsize`);

        if (elX) elX.value = leftPct;
        if (elY) elY.value = topPct;
        if (elW) elW.value = widthPct;
        if (elH) elH.value = heightPct;
        if (elFS && obj.fontSize) elFS.value = Math.round(obj.fontSize * (obj.scaleY || 1));
    };

    updateInputs(currObj, 'curr');
    updateInputs(nextObj, 'next');
}

function bindMonitorCanvasEvents() {
    if (!canvas) return;
    canvas.off('object:moving');
    canvas.off('object:scaling');
    const baseW = (typeof BASE_WIDTH !== 'undefined' && BASE_WIDTH) ? BASE_WIDTH : 768;
    const baseH = (typeof BASE_HEIGHT !== 'undefined' && BASE_HEIGHT) ? BASE_HEIGHT : 432;

    const constrain = (e) => {
        const obj = e.target;
        if (!obj || !obj.monitorRole) return;

        if (e.type === 'scaling' || (e.transform && e.transform.action && e.transform.action.includes('scale'))) {
            const actualW = Math.max(50, obj.width * (obj.scaleX || 1));
            const actualFS = Math.max(10, Math.round((obj.fontSize || 24) * (obj.scaleY || 1)));
            obj.set({
                width: actualW,
                fontSize: actualFS,
                scaleX: 1,
                scaleY: 1
            });
        }

        obj.setCoords();
        const actualW = obj.width * (obj.scaleX || 1);
        const actualH = obj.height * (obj.scaleY || 1);

        if (obj.left < 0) obj.left = 0;
        if (obj.top < 0) obj.top = 0;
        if (obj.left + actualW > baseW) obj.left = baseW - actualW;
        if (obj.top + actualH > baseH) obj.top = baseH - actualH;

        syncMonitorNumericInputs();
    };

    canvas.on('object:moving', constrain);
    canvas.on('object:scaling', constrain);
}

function createMonitorBox(role, sampleText, left, top, width, height, bgColor, textColor, strokeColor, isTransparentBg = false, fontSize = 24) {
    const isTrans = isTransparentBg || bgColor === 'transparent';
    return new fabric.Textbox(sampleText, {
        left: left,
        top: top,
        width: width,
        height: height,
        fontSize: fontSize,
        fontFamily: 'sans-serif',
        fontWeight: 'bold',
        fill: textColor,
        backgroundColor: isTrans ? 'transparent' : bgColor,
        stroke: strokeColor,
        strokeWidth: isTrans ? 2 : 3,
        strokeDashArray: isTrans ? [6, 4] : null,
        padding: 10,
        cornerColor: strokeColor,
        cornerSize: 12,
        cornerStyle: 'circle',
        transparentCorners: false,
        lockRotation: true,
        hasRotatingPoint: false,
        splitByGrapheme: true,
        monitorRole: role,
        id: `monitor_${role}_box`,
        sampleText: sampleText,
        textColor: textColor,
        isTransparentBg: isTrans
    });
}

function loadMonitorCanvasToEditor() {
    if (!canvas) return;
    try {
        canvas.clear();
        canvas.backgroundColor = '#0b0f17';
        const baseW = (typeof BASE_WIDTH !== 'undefined' && BASE_WIDTH) ? BASE_WIDTH : 768;
        const baseH = (typeof BASE_HEIGHT !== 'undefined' && BASE_HEIGHT) ? BASE_HEIGHT : 432;

        const saved = JSON.parse(localStorage.getItem("subcast_monitor_settings") || "{}");

        // 성경 구절 옵션 및 색상 피커 초기화
        const bibleVal = saved.bibleMode || "summary";
        const bibleRadio = document.querySelector(`input[name="ed-monitor-bible"][value="${bibleVal}"]`);
        if (bibleRadio) bibleRadio.checked = true;

        const currentBg = saved.currentBox?.bgColor || saved.currentBg || "#1E1E1E";
        const currentTextColor = saved.currentBox?.textColor || saved.currentTextColor || "#FFFFFF";
        const currentTrans = saved.currentBox?.isTransparentBg || currentBg === "transparent";
        const currentFontSize = saved.currentBox?.fontSize || 24;

        const nextBg = saved.nextBox?.bgColor || saved.nextBg || "#181818";
        const nextTextColor = saved.nextBox?.textColor || saved.nextTextColor || "#A0A0A0";
        const nextTrans = saved.nextBox?.isTransparentBg || nextBg === "transparent";
        const nextFontSize = saved.nextBox?.fontSize || 20;

        if (document.getElementById("color-monitor-curr-bg")) document.getElementById("color-monitor-curr-bg").value = currentBg === "transparent" ? "#1E1E1E" : currentBg;
        if (document.getElementById("color-monitor-curr-text")) document.getElementById("color-monitor-curr-text").value = currentTextColor;
        if (document.getElementById("chk-monitor-curr-transparent")) document.getElementById("chk-monitor-curr-transparent").checked = !!currentTrans;
        if (document.getElementById("num-monitor-curr-fontsize")) document.getElementById("num-monitor-curr-fontsize").value = currentFontSize;

        if (document.getElementById("color-monitor-next-bg")) document.getElementById("color-monitor-next-bg").value = nextBg === "transparent" ? "#181818" : nextBg;
        if (document.getElementById("color-monitor-next-text")) document.getElementById("color-monitor-next-text").value = nextTextColor;
        if (document.getElementById("chk-monitor-next-transparent")) document.getElementById("chk-monitor-next-transparent").checked = !!nextTrans;
        if (document.getElementById("num-monitor-next-fontsize")) document.getElementById("num-monitor-next-fontsize").value = nextFontSize;

        // 좌표 안전 계산 (캔버스 1920x1080 내부로 제한)
        const sanitizeCoord = (valPct, defaultPct, maxPct) => {
            if (valPct === undefined || isNaN(valPct)) return defaultPct;
            return Math.max(0, Math.min(maxPct, valPct));
        };

        const cLeftPct = sanitizeCoord(saved.currentBox?.leftPct, 5, 90);
        const cTopPct = sanitizeCoord(saved.currentBox?.topPct, 5, 90);
        const cWidthPct = sanitizeCoord(saved.currentBox?.widthPct, 90, 95);
        const cHeightPct = Math.min(100 - cTopPct, sanitizeCoord(saved.currentBox?.heightPct, 42, 90));

        const nLeftPct = sanitizeCoord(saved.nextBox?.leftPct, 5, 90);
        const nTopPct = sanitizeCoord(saved.nextBox?.topPct, 51, 90);
        const nWidthPct = sanitizeCoord(saved.nextBox?.widthPct, 90, 95);
        const nHeightPct = Math.min(100 - nTopPct, sanitizeCoord(saved.nextBox?.heightPct, 42, 90));

        const cLeft = (cLeftPct / 100) * baseW;
        const cTop = (cTopPct / 100) * baseH;
        const cWidth = (cWidthPct / 100) * baseW;
        const cHeight = (cHeightPct / 100) * baseH;

        const nLeft = (nLeftPct / 100) * baseW;
        const nTop = (nTopPct / 100) * baseH;
        const nWidth = (nWidthPct / 100) * baseW;
        const nHeight = (nHeightPct / 100) * baseH;

        // 🔴 CURRENT 카드 및 🔵 NEXT 카드 생성 (Fabric.Textbox)
        const currentBoxObj = createMonitorBox('current', '🔴 CURRENT (현재 송출 슬라이드)', cLeft, cTop, cWidth, cHeight, currentBg, currentTextColor, '#ef4444', currentTrans, currentFontSize);
        const nextBoxObj = createMonitorBox('next', '🔵 NEXT (다음 슬라이드 미리보기)', nLeft, nTop, nWidth, nHeight, nextBg, nextTextColor, '#3b82f6', nextTrans, nextFontSize);

        canvas.add(currentBoxObj, nextBoxObj);
        bindMonitorCanvasEvents();
        canvas.setActiveObject(currentBoxObj);
        canvas.renderAll();
        syncMonitorNumericInputs();
    } catch(e) {
        console.error("Failed to load monitor canvas", e);
    }
}

function updateMonitorEditorSettings() {
    if (!canvas || !isMonitorEditMode) return;
    const currentBgInput = document.getElementById("color-monitor-curr-bg")?.value || "#1E1E1E";
    const currentTextColor = document.getElementById("color-monitor-curr-text")?.value || "#FFFFFF";
    const currentTrans = !!document.getElementById("chk-monitor-curr-transparent")?.checked;
    const currentFontSize = parseInt(document.getElementById("num-monitor-curr-fontsize")?.value, 10) || 24;
    const currentBg = currentTrans ? "transparent" : currentBgInput;

    const nextBgInput = document.getElementById("color-monitor-next-bg")?.value || "#181818";
    const nextTextColor = document.getElementById("color-monitor-next-text")?.value || "#A0A0A0";
    const nextTrans = !!document.getElementById("chk-monitor-next-transparent")?.checked;
    const nextFontSize = parseInt(document.getElementById("num-monitor-next-fontsize")?.value, 10) || 20;
    const nextBg = nextTrans ? "transparent" : nextBgInput;

    const currObj = canvas.getObjects().find(o => o.monitorRole === 'current');
    const nextObj = canvas.getObjects().find(o => o.monitorRole === 'next');

    if (currObj) {
        currObj.set({
            fill: currentTextColor,
            textColor: currentTextColor,
            backgroundColor: currentBg,
            fontSize: currentFontSize,
            isTransparentBg: currentTrans,
            strokeDashArray: currentTrans ? [6, 4] : null,
            strokeWidth: currentTrans ? 2 : 3
        });
    }
    if (nextObj) {
        nextObj.set({
            fill: nextTextColor,
            textColor: nextTextColor,
            backgroundColor: nextBg,
            fontSize: nextFontSize,
            isTransparentBg: nextTrans,
            strokeDashArray: nextTrans ? [6, 4] : null,
            strokeWidth: nextTrans ? 2 : 3
        });
    }
    canvas.renderAll();
}

function applyMonitorNumericInputs() {
    if (!canvas || !isMonitorEditMode) return;
    const currObj = canvas.getObjects().find(o => o.monitorRole === 'current');
    const nextObj = canvas.getObjects().find(o => o.monitorRole === 'next');
    const baseW = (typeof BASE_WIDTH !== 'undefined' && BASE_WIDTH) ? BASE_WIDTH : 768;
    const baseH = (typeof BASE_HEIGHT !== 'undefined' && BASE_HEIGHT) ? BASE_HEIGHT : 432;

    const updateObjFromInputs = (obj, role) => {
        if (!obj) return;
        const xPct = parseFloat(document.getElementById(`num-monitor-${role}-x`)?.value) || 0;
        const yPct = parseFloat(document.getElementById(`num-monitor-${role}-y`)?.value) || 0;
        const wPct = parseFloat(document.getElementById(`num-monitor-${role}-w`)?.value) || 10;
        const hPct = parseFloat(document.getElementById(`num-monitor-${role}-h`)?.value) || 10;

        obj.set({
            left: (xPct / 100) * baseW,
            top: (yPct / 100) * baseH,
            width: (wPct / 100) * baseW,
            height: (hPct / 100) * baseH,
            scaleX: 1,
            scaleY: 1
        });
        obj.setCoords();
    };

    updateObjFromInputs(currObj, 'curr');
    updateObjFromInputs(nextObj, 'next');
    canvas.renderAll();
}

function alignMonitorCanvasBoxes(mode) {
    if (!canvas || !isMonitorEditMode) return;
    const currObj = canvas.getObjects().find(o => o.monitorRole === 'current');
    const nextObj = canvas.getObjects().find(o => o.monitorRole === 'next');

    if (!currObj || !nextObj) return;

    if (mode === 'swap') {
        const cLeft = currObj.left;
        const cTop = currObj.top;
        const cW = currObj.width * (currObj.scaleX || 1);
        const cH = currObj.height * (currObj.scaleY || 1);

        currObj.set({
            left: nextObj.left,
            top: nextObj.top,
            width: nextObj.width * (nextObj.scaleX || 1),
            height: nextObj.height * (nextObj.scaleY || 1),
            scaleX: 1, scaleY: 1
        });
        nextObj.set({
            left: cLeft,
            top: cTop,
            width: cW,
            height: cH,
            scaleX: 1, scaleY: 1
        });
    }
    canvas.renderAll();
    syncMonitorNumericInputs();
}

function saveMonitorSettingsFromEditor() {
    if (!canvas) return;
    try {
        const currObj = canvas.getObjects().find(o => o.monitorRole === 'current');
        const nextObj = canvas.getObjects().find(o => o.monitorRole === 'next');
        const baseW = (typeof BASE_WIDTH !== 'undefined' && BASE_WIDTH) ? BASE_WIDTH : 768;
        const baseH = (typeof BASE_HEIGHT !== 'undefined' && BASE_HEIGHT) ? BASE_HEIGHT : 432;

        const bibleMode = document.querySelector('input[name="ed-monitor-bible"]:checked')?.value || "summary";
        const currentBgInput = document.getElementById("color-monitor-curr-bg")?.value || "#1E1E1E";
        const currentTextColor = document.getElementById("color-monitor-curr-text")?.value || "#FFFFFF";
        const currentTrans = !!document.getElementById("chk-monitor-curr-transparent")?.checked;
        const currentFontSize = parseInt(document.getElementById("num-monitor-curr-fontsize")?.value, 10) || 24;
        const currentBg = currentTrans ? "transparent" : currentBgInput;

        const nextBgInput = document.getElementById("color-monitor-next-bg")?.value || "#181818";
        const nextTextColor = document.getElementById("color-monitor-next-text")?.value || "#A0A0A0";
        const nextTrans = !!document.getElementById("chk-monitor-next-transparent")?.checked;
        const nextFontSize = parseInt(document.getElementById("num-monitor-next-fontsize")?.value, 10) || 20;
        const nextBg = nextTrans ? "transparent" : nextBgInput;

        const calcMetrics = (obj, defaultLeft, defaultTop, defaultW, defaultH) => {
            if (!obj) {
                return {
                    leftPct: defaultLeft,
                    topPct: defaultTop,
                    widthPct: defaultW,
                    heightPct: defaultH
                };
            }
            const actualW = obj.width * (obj.scaleX || 1);
            const actualH = obj.height * (obj.scaleY || 1);
            return {
                leftPct: Math.max(0, Math.min(95, Math.round(((obj.left) / baseW) * 1000) / 10)),
                topPct: Math.max(0, Math.min(95, Math.round(((obj.top) / baseH) * 1000) / 10)),
                widthPct: Math.max(5, Math.min(100, Math.round((actualW / baseW) * 1000) / 10)),
                heightPct: Math.max(5, Math.min(100, Math.round((actualH / baseH) * 1000) / 10))
            };
        };

        const currentMetrics = calcMetrics(currObj, 5, 5, 90, 42);
        const nextMetrics = calcMetrics(nextObj, 5, 51, 90, 42);

        const settings = {
            layoutMode: "custom_canvas",
            layout: "5:5",
            bibleMode,
            currentBg,
            currentTextColor,
            nextBg,
            nextTextColor,
            currentBox: {
                ...currentMetrics,
                bgColor: currentBg,
                textColor: currentTextColor,
                fontSize: currObj ? Math.round(currObj.fontSize * (currObj.scaleY || 1)) : currentFontSize,
                isTransparentBg: currentTrans
            },
            nextBox: {
                ...nextMetrics,
                bgColor: nextBg,
                textColor: nextTextColor,
                fontSize: nextObj ? Math.round(nextObj.fontSize * (nextObj.scaleY || 1)) : nextFontSize,
                isTransparentBg: nextTrans
            }
        };

        localStorage.setItem("subcast_monitor_settings", JSON.stringify(settings));

        // 실시간 Multi-Tab / Multi-Window 전송 (BroadcastChannel & Storage Event)
        try {
            const bc = new BroadcastChannel("subcast_monitor_channel");
            bc.postMessage({ type: "MONITOR_SETTINGS_UPDATED", settings });
            bc.close();
        } catch(err) {}
        window.dispatchEvent(new CustomEvent("subcast_monitor_updated", { detail: settings }));

        if (typeof showToast === "function") {
            showToast("🖥️ 모니터링 레이아웃이 저장되었습니다!");
        } else {
            alert("🖥️ 모니터링 레이아웃이 저장되었습니다!");
        }
    } catch(e) {
        console.error("Failed to save monitor settings", e);
        if (typeof showToast === "function") {
            showToast("⚠️ 저장 중 오류가 발생했습니다.");
        }
    }
}

function resetMonitorCanvasLayout() {
    try {
        localStorage.removeItem("subcast_monitor_settings");
        loadMonitorCanvasToEditor();
        if (typeof showToast === "function") {
            showToast("🔄 모니터링 레이아웃이 기본값(5:5)으로 초기화되었습니다.");
        }
    } catch(e) {
        console.error("Failed to reset monitor canvas layout", e);
    }
}

function restoreNormalCanvas() {
    if (!canvas) return;
    try {
        canvas.off('object:moving');
        canvas.off('object:scaling');
        canvas.clear();
        if (typeof renderCurrentSlide === "function") {
            renderCurrentSlide();
        } else if (typeof renderSlideToCanvas === "function" && typeof currentSlideIndex !== "undefined") {
            renderSlideToCanvas(currentSlideIndex);
        }
    } catch(e) {
        console.error("Failed to restore normal canvas", e);
    }
}




