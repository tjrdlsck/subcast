// CanvasTextBaseline 패치: 브라우저 확장 프로그램 등에서 'alphabetical'을 넣어 발생하는 경고 우회
        (function () {
            if (typeof CanvasRenderingContext2D !== 'undefined') {
                const descriptor = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'textBaseline');
                if (descriptor && descriptor.set) {
                    const originalSet = descriptor.set;
                    Object.defineProperty(CanvasRenderingContext2D.prototype, 'textBaseline', {
                        set: function (value) {
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

        let ws = null;
        let projectData = null;
        let lockedSlides = {};
        let activeSlideId = null;
        let selectedSlideIds = [];
        let canvas = null;
        let myEditorId = null;
        let isLockRequested = false;
        let currentEditingElement = null;
        let undoStack = [];
        let redoStack = [];
        let isUndoingRedoing = false;


        // 줌 배율 제어를 위한 상수 및 변수
        let canvasZoom = 1.0;
        let userZoomFactor = 1.0;
        let isSlideDirty = false;
        const BASE_WIDTH = 768;
        const BASE_HEIGHT = 432;







        let lastCheckedIndex = -1;




        // 위/아래 방향키를 이용한 슬라이드 이동 단축키 연동
        document.addEventListener("keydown", (e) => {
            // 텍스트 인풋 상자, 폼 편집 상태 또는 캔버스 내 디자인 요소가 선택된 상태일 때는 방향키 슬라이드 이동을 바이패스
            const activeEl = document.activeElement;
            const hasActiveCanvasObj = typeof canvas !== 'undefined' && canvas && canvas.getActiveObject();
            const isStageBgVisible = document.getElementById('stage-bg-main-viewer-overlay')?.style.display !== 'none';
            const isBibleVisible = document.getElementById('bible-main-viewer-overlay')?.style.display !== 'none';
            const isPraiseVisible = document.getElementById('praise-main-viewer-overlay')?.style.display !== 'none';
            const isStageBgTabActive = document.getElementById('panel-stage-bg')?.classList.contains('active');

            if (
                (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.isContentEditable)) ||
                hasActiveCanvasObj ||
                isStageBgVisible || isBibleVisible || isPraiseVisible || isStageBgTabActive
            ) {
                return;
            }

            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                if (!projectData || !projectData.slides || projectData.slides.length === 0) return;
                if (!activeSlideId) return;

                const currentIndex = projectData.slides.findIndex(s => s.id === activeSlideId);
                if (currentIndex === -1) return;

                let targetIndex = -1;
                if (e.key === "ArrowUp") {
                    if (currentIndex > 0) {
                        targetIndex = currentIndex - 1;
                    }
                } else if (e.key === "ArrowDown") {
                    if (currentIndex < projectData.slides.length - 1) {
                        targetIndex = currentIndex + 1;
                    }
                }

                if (targetIndex !== -1) {
                    e.preventDefault();
                    const targetSlide = projectData.slides[targetIndex];
                    selectSlideForEdit(targetSlide.id);
                }
            }
        });




        let autoSaveTimeoutId = null;











        let isUpdatingLayerList = false;










        function layerUp() { if (currentEditingElement) { canvas.bringForward(currentEditingElement); canvas.renderAll(); saveStateToHistory(); } }
        function layerDown() { if (currentEditingElement) { canvas.sendBackwards(currentEditingElement); canvas.renderAll(); saveStateToHistory(); } }
        function layerFront() { if (currentEditingElement) { canvas.bringToFront(currentEditingElement); canvas.renderAll(); saveStateToHistory(); } }







        let modalSelectedSlideIds = [];
        let modalLastCheckedIndex = -1;






        let selectedTemplateIds = [];
        let lastSelectedTemplateId = null;





        function makeElementDraggable(elmnt, header) {
            if (!elmnt) return;
            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
            const dragHandle = header || elmnt;
            dragHandle.style.cursor = "move";
            dragHandle.onmousedown = dragMouseDown;

            function dragMouseDown(e) {
                e = e || window.event;
                const tag = e.target ? e.target.tagName : '';
                if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'SELECT' || tag === 'TEXTAREA') {
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

                elmnt.style.position = "absolute";
                elmnt.style.top = newTop + "px";
                elmnt.style.left = newLeft + "px";
                elmnt.style.right = "auto";
                elmnt.style.bottom = "auto";
            }

            function closeDragElement() {
                document.onmouseup = null;
                document.onmousemove = null;
            }
        }


