// ==========================================================================
// Subcast Module: editor-ui.js
// ==========================================================================

        // 왼쪽 탭 메뉴 전환
        function switchLeftTab(tabId) {
            document.querySelectorAll('.nav-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-target') === tabId);
            });
            document.querySelectorAll('.sidebar-panel').forEach(panel => {
                panel.classList.toggle('active', panel.id === tabId);
            });

            // 탭 클릭 시 닫혀있던 서브 패널이 있으면 자동으로 펼침
            const subPanel = document.querySelector(".left-sub-panel");
            if (subPanel && subPanel.classList.contains("collapsed")) {
                subPanel.classList.remove("collapsed");
                const arrowIcon = document.getElementById("toggle-arrow-icon");
                if (arrowIcon) {
                    arrowIcon.style.transform = "rotate(0deg)";
                }
                fitCanvasToScreen();
            }

            // 성경 탭이 아닐 경우 성경 메인 표 뷰어 숨김
            if (tabId !== 'panel-bible') {
                hideBibleMainViewer();
            }
            // 찬양 탭이 아닐 경우 찬양 메인 뷰어 숨김
            if (tabId !== 'panel-praise') {
                hidePraiseMainViewer();
            }
            // 현장 배경 탭 처리
            if (tabId === 'panel-stage-bg') {
                showStageBgMainViewer();
            } else {
                hideStageBgMainViewer();
            }
        }


        function handleCheckboxClick(e, index) {
            e.stopPropagation();
            const checkboxes = document.querySelectorAll(".slide-select-checkbox");

            if (e.shiftKey && lastCheckedIndex !== -1) {
                const start = Math.min(index, lastCheckedIndex);
                const end = Math.max(index, lastCheckedIndex);
                const targetState = e.target.checked;

                for (let i = start; i <= end; i++) {
                    checkboxes[i].checked = targetState;
                }
            }
            lastCheckedIndex = index;
        }


            function addCustomFont() {
                const textareaEl = document.getElementById("custom-font-input");
                if (!textareaEl) return;
                const cssCode = textareaEl.value.trim();
                if (!cssCode) {
                    alert("@font-face 정의 코드를 입력해 주세요.");
                    return;
                }

                // 1. font-family 명칭 추출 정규식
                const fontFamilyRegex = /font-family\s*:\s*['"]?([^'";\s]+)['"]?/i;
                const match = cssCode.match(fontFamilyRegex);

                if (!match || !match[1]) {
                    alert("입력한 CSS 코드에서 font-family 설정을 찾을 수 없습니다. 올바른 @font-face 코드를 입력해 주세요.");
                    return;
                }

                const fontName = match[1].trim();

                // 2. url 추출 정규식
                const urlRegex = /url\s*\(\s*[\'"]?([^\'")]+)[\'"]?\s*\)/i;
                const urlMatch = cssCode.match(urlRegex);
                if (!urlMatch || !urlMatch[1]) {
                    alert("CSS 코드에서 폰트 파일 주소(url)를 찾을 수 없습니다.");
                    return;
                }
                const fontUrl = urlMatch[1];

                // 3. 백엔드로 다운로드 및 등록 요청 송신
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: "ADD_CUSTOM_FONT",
                        family: fontName,
                        url: fontUrl,
                        originalCssCode: cssCode
                    }));
                } else {
                    alert("서버 연결이 원활하지 않아 폰트를 다운로드할 수 없습니다.");
                }

                textareaEl.value = "";
            }


