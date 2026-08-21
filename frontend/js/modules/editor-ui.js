// ==========================================================================
// Subcast Module: editor-ui.js
// ==========================================================================

        // 전역 논블로킹 토스트 알림 헬퍼
        function showToast(message, duration = 2500) {
            let toast = document.getElementById("subcast-editor-toast");
            if (!toast) {
                toast = document.createElement("div");
                toast.id = "subcast-editor-toast";
                toast.style.position = "fixed";
                toast.style.bottom = "24px";
                toast.style.right = "24px";
                toast.style.backgroundColor = "rgba(15, 23, 42, 0.92)";
                toast.style.color = "#ffffff";
                toast.style.padding = "10px 18px";
                toast.style.borderRadius = "8px";
                toast.style.fontSize = "0.85rem";
                toast.style.fontWeight = "600";
                toast.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.45)";
                toast.style.border = "1px solid rgba(56, 189, 248, 0.4)";
                toast.style.zIndex = "99999";
                toast.style.transition = "opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1), transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)";
                toast.style.pointerEvents = "none";
                document.body.appendChild(toast);
            }
            toast.textContent = message;
            toast.style.opacity = "1";
            toast.style.transform = "translateY(0)";
            if (window._toastTimeout) clearTimeout(window._toastTimeout);
            window._toastTimeout = setTimeout(() => {
                toast.style.opacity = "0";
                toast.style.transform = "translateY(8px)";
            }, duration);
        }
        window.showToast = showToast;

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

            // 슬라이드 탭이 아닌 다른 탭 클릭 시 슬라이드 모아보기 자동 닫기
            if (tabId !== 'panel-slides' && window.subcastSlideSorter && typeof window.subcastSlideSorter.isOpen === 'function' && window.subcastSlideSorter.isOpen()) {
                window.subcastSlideSorter.close();
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
            // 무대 모니터 탭 처리
            if (tabId === 'panel-monitor') {
                if (typeof showMonitorMainViewer === 'function') showMonitorMainViewer();
            } else {
                if (typeof hideMonitorMainViewer === 'function') hideMonitorMainViewer();
            }
            // 방송 화면 탭 처리
            if (tabId === 'panel-broadcast') {
                if (typeof showBroadcastMainViewer === 'function') showBroadcastMainViewer();
            } else {
                if (typeof hideBroadcastMainViewer === 'function') hideBroadcastMainViewer();
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


