// ==========================================================================
// Subcast Module: editor-history.js
// ==========================================================================

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
                    fontSize = match ? (parseFloat(match[1]) / 100) * canvasWidth : parseInt(elem.style.fontSize) || 20;
                }
                const textOptions = { left: x, top: y, width: w > 50 ? w : 250, fontSize: fontSize, fill: elem.style?.fontColor || '#ffffff', stroke: elem.style?.strokeColor || 'transparent', strokeWidth: elem.style?.strokeWidth !== undefined ? elem.style.strokeWidth : 0, fontFamily: elem.style?.fontFamily || 'Inter', fontWeight: elem.style?.fontWeight || 'normal', fontStyle: elem.style?.fontStyle || 'normal', textAlign: elem.style?.textAlign || 'left', opacity: opacity, selectable: !isInsideGroup, hasControls: !isInsideGroup, originalId: elem.id, originalVwSize: elem.style?.fontSize || "3vw", paintFirst: 'stroke' };
                if (elem.style?.shadow) {
                    textOptions.shadow = new fabric.Shadow({
                        color: elem.style.shadow.color || '#000000',
                        blur: elem.style.shadow.blur || 0,
                        offsetX: elem.style.shadow.offsetX || 0,
                        offsetY: elem.style.shadow.offsetY || 0
                    });
                }
                obj = isInsideGroup ? new fabric.Text(elem.content, textOptions) : new fabric.Textbox(elem.content, textOptions);
            } else if (elem.type === 'rect') {
                obj = new fabric.Rect({ left: x, top: y, width: w, height: h, rx: elem.style?.cornerRadius || 0, ry: elem.style?.cornerRadius || 0, fill: elem.style?.fillColor || '#4f46e5', stroke: elem.style?.strokeColor || 'transparent', strokeWidth: elem.style?.strokeWidth !== undefined ? elem.style.strokeWidth : 0, opacity: opacity, selectable: !isInsideGroup, hasControls: !isInsideGroup, originalId: elem.id });
            } else if (elem.type === 'circle') {
                obj = new fabric.Circle({ left: x, top: y, radius: w / 2 || 30, fill: elem.style?.fillColor || '#06b6d4', stroke: elem.style?.strokeColor || 'transparent', strokeWidth: elem.style?.strokeWidth !== undefined ? elem.style.strokeWidth : 0, opacity: opacity, selectable: !isInsideGroup, hasControls: !isInsideGroup, originalId: elem.id });
            } else if (elem.type === 'triangle') {
                obj = new fabric.Triangle({ left: x, top: y, width: w, height: h, fill: elem.style?.fillColor || '#10b981', stroke: elem.style?.strokeColor || 'transparent', strokeWidth: elem.style?.strokeWidth !== undefined ? elem.style.strokeWidth : 0, opacity: opacity, selectable: !isInsideGroup, hasControls: !isInsideGroup, originalId: elem.id });
            } else if (elem.type === 'line') {
                obj = new fabric.Line([x, y, x + w, y], { stroke: elem.style?.fillColor || elem.style?.strokeColor || '#f59e0b', strokeWidth: elem.style?.strokeWidth !== undefined && elem.style?.strokeWidth > 0 ? elem.style.strokeWidth : 4, opacity: opacity, selectable: !isInsideGroup, hasControls: !isInsideGroup, originalId: elem.id });
            } else if (elem.type === 'image' || (elem.style && elem.style.src)) {
                const imgSrc = elem.style?.src || elem.src;
                obj = new fabric.Image(document.createElement('img'), { left: x, top: y, scaleX: w / 100, scaleY: h / 100, opacity: opacity, selectable: !isInsideGroup, hasControls: !isInsideGroup, originalId: elem.id });
                if (imgSrc) {
                    obj.setSrc(imgSrc, function() {
                        if (w > 0 && obj.width > 0) obj.scaleToWidth(w);
                        if (h > 0 && obj.height > 0 && !w) obj.scaleToHeight(h);
                        if (typeof canvas !== 'undefined' && canvas) canvas.renderAll();
                    });
                }
            } else if (elem.type === 'group' && elem.children) {
                const members = elem.children.map(child => deserializeElement(child, canvasWidth, canvasHeight, true, w, h));
                obj = new fabric.Group(members, { left: x, top: y, opacity: opacity, selectable: !isInsideGroup, hasControls: !isInsideGroup, originalId: elem.id });
            }
            return obj;
        }


        function serializeElement(obj, canvasWidth, canvasHeight, isInsideGroup = false, groupW = 1, groupH = 1) {
            let xPct, yPct, wPct, hPct;
            if (isInsideGroup) {
                xPct = (obj.left / groupW) * 100;
                yPct = (obj.top / groupH) * 100;
                wPct = ((obj.width * obj.scaleX) / groupW) * 100;
                hPct = ((obj.height * obj.scaleY) / groupH) * 100;
            } else {
                xPct = (obj.left / canvasWidth) * 100;
                yPct = (obj.top / canvasHeight) * 100;
                wPct = obj.type === 'circle' ? (((obj.radius * (obj.scaleX || 1)) * 2) / canvasWidth) * 100 : ((obj.width * obj.scaleX) / canvasWidth) * 100;
                hPct = obj.type === 'circle' ? (((obj.radius * (obj.scaleY || 1)) * 2) / canvasHeight) * 100 : ((obj.height * obj.scaleY) / canvasHeight) * 100;
            }
            const type = (obj.type === 'textbox' || obj.type === 'text') ? 'text' : obj.type;
            const style = { opacity: obj.opacity !== undefined ? parseFloat(obj.opacity.toFixed(2)) : 1.0 };
            if (type === 'text') {
                style.fontSize = obj.originalVwSize || "3vw";
                style.fontColor = obj.fill || "#ffffff";
                style.fontFamily = obj.fontFamily || "Inter";
                style.fontWeight = obj.fontWeight || "normal";
                style.fontStyle = obj.fontStyle || "normal";
                style.textAlign = obj.textAlign || "left";
                style.strokeColor = obj.stroke || "transparent";
                style.strokeWidth = Math.round(obj.strokeWidth || 0);
                if (obj.shadow) {
                    style.shadow = {
                        color: obj.shadow.color || "#000000",
                        blur: obj.shadow.blur || 0,
                        offsetX: obj.shadow.offsetX || 0,
                        offsetY: obj.shadow.offsetY || 0
                    };
                }
            } else if (['rect', 'circle', 'triangle', 'line'].includes(type)) {
                style.fillColor = obj.fill || "transparent";
                style.strokeColor = obj.stroke || "transparent";
                style.strokeWidth = Math.round(obj.strokeWidth || 0);
                if (type === 'rect') style.cornerRadius = obj.rx || 0;
            } else if (type === 'image') {
                style.src = obj._element ? obj._element.src : (obj.getSrc ? obj.getSrc() : (obj.src || ''));
            }
            const elementData = { id: obj.originalId || `elem_${Math.random().toString(36).substr(2, 9)}`, type: type, content: type === 'text' ? (obj.text || "") : "", x: parseFloat(xPct.toFixed(2)), y: parseFloat(yPct.toFixed(2)), width: parseFloat(wPct.toFixed(2)), height: parseFloat(hPct.toFixed(2)), style: style };
            if (type === 'group') {
                elementData.children = obj.getObjects().map(child => serializeElement(child, canvasWidth, canvasHeight, true, obj.width * obj.scaleX, obj.height * obj.scaleY));
            }
            return elementData;
        }


        function saveStateToHistory() {
            if (isUndoingRedoing) return;
            if (window.subcastMonitorEditor && window.subcastMonitorEditor.isMonitorMode && window.subcastMonitorEditor.isMonitorMode()) {
                if (typeof window.subcastMonitorEditor.saveMonitorStateToHistory === 'function') {
                    window.subcastMonitorEditor.saveMonitorStateToHistory();
                }
                return;
            }
            const currentState = canvas.getObjects().map(obj => serializeElement(obj, BASE_WIDTH, BASE_HEIGHT));
            const stateStr = JSON.stringify(currentState);

            // 이전 상태와 동일하다면 중복 저장을 방지하기 위한 체크
            if (undoStack.length > 0 && JSON.stringify(undoStack[undoStack.length - 1]) === stateStr) {
                return;
            }

            undoStack.push(currentState);
            redoStack = [];
            setSlideDirty(true);
            triggerAutoSave();
        }


        function undo() {
            if (window.subcastMonitorEditor && window.subcastMonitorEditor.isMonitorMode && window.subcastMonitorEditor.isMonitorMode()) {
                if (typeof window.subcastMonitorEditor.undoMonitor === 'function') {
                    window.subcastMonitorEditor.undoMonitor();
                }
                return;
            }

            if (undoStack.length <= 1) return;

            isUndoingRedoing = true;
            const currentState = undoStack.pop();
            redoStack.push(currentState);

            const prevState = undoStack[undoStack.length - 1];
            applyStateToCanvas(prevState);
            setSlideDirty(undoStack.length > 1);
        }


        function redo() {
            if (window.subcastMonitorEditor && window.subcastMonitorEditor.isMonitorMode && window.subcastMonitorEditor.isMonitorMode()) {
                if (typeof window.subcastMonitorEditor.redoMonitor === 'function') {
                    window.subcastMonitorEditor.redoMonitor();
                }
                return;
            }

            if (redoStack.length === 0) return;

            isUndoingRedoing = true;
            const nextState = redoStack.pop();
            undoStack.push(nextState);

            applyStateToCanvas(nextState);
            setSlideDirty(true);
        }


        function applyStateToCanvas(state) {
            canvas.clear();
            canvas.backgroundColor = '#000000';
            if (state && Array.isArray(state)) {
                state.forEach(elem => {
                    const obj = deserializeElement(elem, BASE_WIDTH, BASE_HEIGHT);
                    if (obj) canvas.add(obj);
                });
            }
            setCanvasZoom(canvasZoom);
            canvas.renderAll();
            onObjectCleared();
            isUndoingRedoing = false;
            updateLayerList();
            triggerAutoSave();
        }


        function undoBulkAction() {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "UNDO_BULK_ACTION" }));
            }
        }


