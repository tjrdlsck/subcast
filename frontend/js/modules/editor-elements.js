// ==========================================================================
// Subcast Module: editor-elements.js
// ==========================================================================

        // 제목, 부제목, 본문 텍스트 템플릿 삽입
        function addTextTpl(type) {
            if (!activeSlideId) return;
            let text = "텍스트를 입력해 주세요.";
            let fontSizeVw = 3.0;
            let fontWeight = "normal";
            if (type === 'title') {
                text = "제목을 입력해 주세요.";
                fontSizeVw = 5.0;
                fontWeight = "bold";
            } else if (type === 'subtitle') {
                text = "부제목을 입력해 주세요.";
                fontSizeVw = 3.5;
                fontWeight = "bold";
            } else if (type === 'body') {
                text = "본문 내용을 입력해 주세요.";
                fontSizeVw = 2.0;
                fontWeight = "normal";
            }
            // 줌이 적용되지 않은 기본 해상도(BASE_WIDTH) 기준으로 font size px 산출
            const pxSize = (fontSizeVw / 100) * BASE_WIDTH;
            const obj = new fabric.Textbox(text, {
                left: 100,
                top: 100,
                width: 350,
                fontSize: pxSize,
                fill: '#ffffff',
                fontFamily: 'Inter',
                fontWeight: fontWeight,
                originalId: `elem_${Math.random().toString(36).substr(2, 9)}`,
                originalVwSize: `${fontSizeVw}vw`
            });
            canvas.add(obj);
            canvas.setActiveObject(obj);
            canvas.renderAll();
        }


        function addRect() {
            if (!activeSlideId) return;
            const obj = new fabric.Rect({ left: 150, top: 150, width: 150, height: 100, fill: '#6366f1', originalId: `elem_${Math.random().toString(36).substr(2, 9)}` });
            canvas.add(obj); canvas.setActiveObject(obj); canvas.renderAll();
        }


        // 원형 도형 기본 Fill 색상을 인디고 테마에 어울리는 청록색(Cyan)으로 지정
        function addCircle() {
            if (!activeSlideId) return;
            const obj = new fabric.Circle({ left: 150, top: 150, radius: 60, fill: '#06b6d4', originalId: `elem_${Math.random().toString(36).substr(2, 9)}` });
            canvas.add(obj); canvas.setActiveObject(obj); canvas.renderAll();
        }


        function addTriangle() {
            if (!activeSlideId) return;
            const obj = new fabric.Triangle({ left: 150, top: 150, width: 120, height: 100, fill: '#10b981', originalId: `elem_${Math.random().toString(36).substr(2, 9)}` });
            canvas.add(obj); canvas.setActiveObject(obj); canvas.renderAll();
        }


        function addLine() {
            if (!activeSlideId) return;
            const obj = new fabric.Line([50, 50, 200, 50], { left: 150, top: 150, stroke: '#f59e0b', strokeWidth: 4, originalId: `elem_${Math.random().toString(36).substr(2, 9)}` });
            canvas.add(obj); canvas.setActiveObject(obj); canvas.renderAll();
        }


        function layerBack() { if (currentEditingElement) { canvas.sendToBack(currentEditingElement); canvas.renderAll(); saveStateToHistory(); } }



        function groupObjects() {
            const activeObj = canvas.getActiveObject();
            if (activeObj && activeObj.type === 'activeSelection') {
                const group = activeObj.toGroup();
                group.originalId = `elem_${Math.random().toString(36).substr(2, 9)}`;
                canvas.requestRenderAll();
                onObjectSelected({ target: group });
                saveStateToHistory();
            }
        }


        function ungroupObjects() {
            const activeObj = canvas.getActiveObject();
            if (activeObj && activeObj.type === 'group') {
                activeObj.toActiveSelection();
                canvas.requestRenderAll();
                onObjectSelected({ target: canvas.getActiveObject() });
                saveStateToHistory();
            }
        }


        function deleteElement() {
            const activeObj = canvas.getActiveObject();
            if (!activeObj) return;

            isUndoingRedoing = true;
            if (activeObj.type === 'activeSelection') {
                const objectsToDelete = activeObj.getObjects().concat();
                objectsToDelete.forEach(obj => {
                    canvas.remove(obj);
                });
            } else {
                canvas.remove(activeObj);
            }
            canvas.discardActiveObject();
            onObjectCleared();
            canvas.renderAll();
            isUndoingRedoing = false;
            saveStateToHistory();
            updateLayerList();
        }


                    function onMouseMove(e) {
                        const newWidth = startWidth + (e.clientX - startX);
                        // 최소 너비 150px, 최대 너비 600px 제한
                        if (newWidth >= 150 && newWidth <= 600) {
                            panel.style.width = `${newWidth}px`;
                            fitCanvasToScreen(); // 좌측 드로어 패널 너비 변경에 맞춰 슬라이드 실시간 자동 스케일링
                        }
                    }


                    function onMouseUp() {
                        resizer.classList.remove("resizing");
                        document.removeEventListener("mousemove", onMouseMove);
                        document.removeEventListener("mouseup", onMouseUp);
                    }


            function dragMouseDown(e) {
                e = e || window.event;
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') {
                    return;
                }
                e.preventDefault();
                pos3 = e.clientX;
                pos4 = e.clientY;
                document.onmouseup = closeDragElement;
                document.onmousemove = elementDrag;
            }


            function elementDrag(e) {
                e = e || window.event;
                e.preventDefault();
                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;
                pos3 = e.clientX;
                pos4 = e.clientY;

                let newTop = elmnt.offsetTop - pos2;
                let newLeft = elmnt.offsetLeft - pos1;

                // 화면 바운더리 계산 및 이탈 방지
                const workspace = document.querySelector(".workspace");
                if (workspace) {
                    const rect = workspace.getBoundingClientRect();
                    const elRect = elmnt.getBoundingClientRect();

                    if (newTop < 10) newTop = 10;
                    if (newTop + elRect.height > rect.height - 10) {
                        newTop = rect.height - elRect.height - 10;
                    }
                    if (newLeft < 10) newLeft = 10;
                    if (newLeft + elRect.width > rect.width - 10) {
                        newLeft = rect.width - elRect.width - 10;
                    }
                }

                elmnt.style.top = newTop + "px";
                elmnt.style.left = newLeft + "px";
                elmnt.style.right = "auto";
                elmnt.style.bottom = "auto";
            }


            function closeDragElement() {
                document.onmouseup = null;
                document.onmousemove = null;
            }


        function insertImageToCanvas(file, x = null, y = null) {
            if (!activeSlideId) return;
            const reader = new FileReader();
            reader.onload = function (event) {
                fabric.Image.fromURL(event.target.result, function (img) {
                    const maxW = 400;
                    if (img.width > maxW) {
                        img.scaleToWidth(maxW);
                    }

                    const posX = x !== null ? x : (BASE_WIDTH - (img.width * img.scaleX)) / 2;
                    const posY = y !== null ? y : (BASE_HEIGHT - (img.height * img.scaleY)) / 2;

                    img.set({
                        left: posX,
                        top: posY,
                        originalId: `elem_${Math.random().toString(36).substr(2, 9)}`
                    });

                    canvas.add(img);
                    canvas.setActiveObject(img);
                    canvas.renderAll();
                    saveStateToHistory();
                });
            };
            reader.readAsDataURL(file);
        }


