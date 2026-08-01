        // ==========================================================================
        // Praise Lyrics Integration Feature Logic
        // ==========================================================================
        let tempPraiseSlidesToAdd = [];
        let activeSelectedPraiseSong = null;
        let selectedPraiseSongs = [];
        let currentPraiseSongsList = [];
        let lastSelectedPraiseIndex = -1;
        let currentEditingPraiseSong = null;
        let praiseClipboardData = [];

        function updatePraiseExpectedCount() {
            const previewList = document.getElementById("praise-preview-list");
            const valExpected = document.getElementById("val-praise-expected-slides");
            const chkAllPraise = document.getElementById("chk-select-all-praise");
            if (!previewList || !valExpected) return;

            const checkboxes = previewList.querySelectorAll(".praise-preview-item-chk");
            const checkedCount = Array.from(checkboxes).filter(chk => chk.checked).length;
            valExpected.textContent = checkedCount;

            if (chkAllPraise && checkboxes.length > 0) {
                chkAllPraise.checked = (checkedCount === checkboxes.length);
            }
        }

        function hidePraiseMainViewer() {
            selectedPraiseSongs = [];
            updatePraiseSelectionUI();
        }

        function adjustPraisePanelLayout(isSelected) {
            const overlay = document.getElementById("praise-main-viewer-overlay");
            const selectionControl = document.getElementById("praise-selection-control");

            if (!overlay || !selectionControl) return;

            if (isSelected) {
                selectionControl.style.display = "flex";
                overlay.style.display = "flex";
            } else {
                selectionControl.style.display = "none";
                overlay.style.display = "none";
            }
        }

        function renderPraisePreview(song) {
            const previewList = document.getElementById("praise-preview-list");
            const chkAllPraise = document.getElementById("chk-select-all-praise");
            if (!previewList) return;

            previewList.innerHTML = "";
            if (chkAllPraise) chkAllPraise.checked = true;
            praiseLastClickedIndex = -1;

            if (!song || !song.lyrics) {
                previewList.innerHTML = `<div style="color: var(--text-muted); font-size: 0.7rem; text-align: center; padding: 10px 0;">분해된 가사가 없습니다.</div>`;
                updatePraiseExpectedCount();
                return;
            }

            const blocks = song.lyrics.split(/\n\s*\n/).map(s => s.trim()).filter(s => s !== "");
            if (blocks.length === 0) {
                previewList.innerHTML = `<div style="color: var(--text-muted); font-size: 0.7rem; text-align: center; padding: 10px 0;">분해된 가사가 없습니다.</div>`;
                updatePraiseExpectedCount();
                return;
            }

            blocks.forEach((block, idx) => {
                const itemDiv = document.createElement("div");
                itemDiv.className = "praise-preview-item-div";
                itemDiv.style.display = "flex";
                itemDiv.style.alignItems = "flex-start";
                itemDiv.style.gap = "6px";
                itemDiv.style.padding = "4px 2px";
                itemDiv.style.borderBottom = "1px dashed rgba(255,255,255,0.05)";
                itemDiv.style.cursor = "pointer";

                const chk = document.createElement("input");
                chk.type = "checkbox";
                chk.className = "praise-preview-item-chk";
                chk.style.cursor = "pointer";
                chk.style.marginTop = "2px";
                chk.checked = true;
                chk.dataset.index = idx;

                chk.onclick = (e) => {
                    e.stopPropagation(); // itemDiv.onclick 호출 방지
                    const checkboxes = previewList.querySelectorAll(".praise-preview-item-chk");

                    if (e.shiftKey && praiseLastClickedIndex !== -1) {
                        const start = Math.min(praiseLastClickedIndex, idx);
                        const end = Math.max(praiseLastClickedIndex, idx);
                        const baseChecked = chk.checked;

                        for (let k = start; k <= end; k++) {
                            checkboxes[k].checked = baseChecked;
                        }
                    } else {
                        praiseLastClickedIndex = idx;
                    }
                    updatePraiseExpectedCount();
                };

                const span = document.createElement("span");
                span.style.color = "var(--text-main)";
                span.style.wordBreak = "break-all";
                span.style.lineHeight = "1.2";

                // 가사 내용 줄바꿈 표현 지원 ( [1장] 표시 제거 )
                const escapedText = block.replace(/\n/g, "<br>");
                span.innerHTML = escapedText;

                itemDiv.onclick = (e) => {
                    const checkboxes = previewList.querySelectorAll(".praise-preview-item-chk");

                    if (e.shiftKey && praiseLastClickedIndex !== -1) {
                        const start = Math.min(praiseLastClickedIndex, idx);
                        const end = Math.max(praiseLastClickedIndex, idx);
                        const baseChecked = !chk.checked; // 토글될 값 기준

                        for (let k = start; k <= end; k++) {
                            checkboxes[k].checked = baseChecked;
                        }
                    } else {
                        chk.checked = !chk.checked;
                        praiseLastClickedIndex = idx;
                    }
                    updatePraiseExpectedCount();
                };

                itemDiv.appendChild(chk);
                itemDiv.appendChild(span);
                previewList.appendChild(itemDiv);
            });

            updatePraiseExpectedCount();
        }

        // 찬양곡 선택 UI 상태 동기화
        function updatePraiseSelectionUI() {
            const songsList = document.getElementById("praise-songs-list");
            const lblTitle = document.getElementById("lbl-selected-praise-title");
            const charCount = document.getElementById("val-praise-char-count");

            if (songsList) {
                const items = songsList.querySelectorAll(".bible-result-item");
                items.forEach((item) => {
                    const songTitle = item.dataset.title;
                    const isSel = selectedPraiseSongs.some(s => s.title === songTitle);
                    if (isSel) {
                        item.classList.add("selected");
                    } else {
                        item.classList.remove("selected");
                    }
                });
            }

            if (selectedPraiseSongs.length === 0) {
                activeSelectedPraiseSong = null;
                if (lblTitle) lblTitle.textContent = "없음";
                adjustPraisePanelLayout(false);
            } else if (selectedPraiseSongs.length === 1) {
                const s = selectedPraiseSongs[0];
                activeSelectedPraiseSong = s;
                const songMood = (s.moods && s.moods[0]) || s.mood || "기본/일반";
                const badgeStyle = typeof getMoodBadgeStyle === "function" ? getMoodBadgeStyle(songMood) : "background: rgba(148, 163, 184, 0.2); color: #94a3b8;";
                if (lblTitle) {
                    lblTitle.innerHTML = `${s.title} <span style="font-size: 0.68rem; font-weight: 600; padding: 2px 7px; border-radius: 10px; ${badgeStyle} margin-left: 6px; display: inline-block;">#${songMood}</span>`;
                }
                if (charCount) charCount.textContent = s.lyrics.length;
                adjustPraisePanelLayout(true);
                renderPraisePreview(s);
            } else {
                activeSelectedPraiseSong = selectedPraiseSongs[0];
                if (lblTitle) lblTitle.textContent = `${selectedPraiseSongs[0].title} 외 ${selectedPraiseSongs.length - 1}건 (총 ${selectedPraiseSongs.length}곡)`;
                if (charCount) charCount.textContent = selectedPraiseSongs.reduce((sum, s) => sum + s.lyrics.length, 0);
                adjustPraisePanelLayout(true);
                renderPraisePreview(selectedPraiseSongs[0]);
            }
        }

        // 찬양 수정 모달 열기
        function openEditPraiseModal(song) {
            if (!song) return;
            currentEditingPraiseSong = song;
            const addModal = document.getElementById("praise-add-modal");
            const headerTitle = document.getElementById("modal-praise-header-title");
            const inputTitle = document.getElementById("modal-praise-title");
            const inputLyrics = document.getElementById("modal-praise-lyrics");

            if (headerTitle) headerTitle.textContent = "🎵 찬양곡 수정";
            if (inputTitle) inputTitle.value = song.title;
            if (inputLyrics) inputLyrics.value = song.lyrics;

            const moodChipsContainer = document.getElementById("modal-praise-mood-chips");
            if (moodChipsContainer) {
                const targetMood = (song.moods && song.moods[0]) || song.mood || "경배/찬양";
                const chips = moodChipsContainer.querySelectorAll(".mood-chip");
                chips.forEach(chip => {
                    const m = chip.getAttribute("data-mood");
                    if (m === targetMood) {
                        chip.classList.add("active");
                        chip.style.background = "var(--primary)";
                        chip.style.borderColor = "var(--primary)";
                        chip.style.color = "#ffffff";
                    } else {
                        chip.classList.remove("active");
                        chip.style.background = "rgba(255,255,255,0.05)";
                        chip.style.borderColor = "var(--panel-border)";
                        chip.style.color = "#cbd5e1";
                    }
                });
            }

            if (addModal) addModal.style.display = "flex";
        }

        // 찬양 추가 모달 열기 (신규 등록)
        function openAddPraiseModal() {
            currentEditingPraiseSong = null;
            const addModal = document.getElementById("praise-add-modal");
            const headerTitle = document.getElementById("modal-praise-header-title");
            const inputTitle = document.getElementById("modal-praise-title");
            const inputLyrics = document.getElementById("modal-praise-lyrics");

            if (headerTitle) headerTitle.textContent = "🎵 신규 찬양곡 등록 및 가사 입력";
            if (inputTitle) inputTitle.value = "";
            if (inputLyrics) inputLyrics.value = "";

            const moodChipsContainer = document.getElementById("modal-praise-mood-chips");
            if (moodChipsContainer) {
                const chips = moodChipsContainer.querySelectorAll(".mood-chip");
                chips.forEach((chip, idx) => {
                    if (idx === 0) {
                        chip.classList.add("active");
                        chip.style.background = "var(--primary)";
                        chip.style.borderColor = "var(--primary)";
                        chip.style.color = "#ffffff";
                    } else {
                        chip.classList.remove("active");
                        chip.style.background = "rgba(255,255,255,0.05)";
                        chip.style.borderColor = "var(--panel-border)";
                        chip.style.color = "#cbd5e1";
                    }
                });
            }

            if (addModal) addModal.style.display = "flex";
        }

        // 선택된 찬양곡 삭제 처리
        async function deleteSelectedPraiseSongsWithConfirm(confirmRequired = true) {
            if (selectedPraiseSongs.length === 0) return;

            if (confirmRequired) {
                const titlesStr = selectedPraiseSongs.map(s => s.title).slice(0, 3).join(", ") + (selectedPraiseSongs.length > 3 ? ` 외 ${selectedPraiseSongs.length - 3}건` : "");
                if (!confirm(`선택한 찬양곡 (${selectedPraiseSongs.length}개: ${titlesStr})을 삭제하시겠습니까?`)) {
                    return;
                }
            }

            const ids = selectedPraiseSongs.filter(s => s.id).map(s => s.id);
            const titles = selectedPraiseSongs.map(s => s.title);
            const reqBody = ids.length > 0 ? { ids, titles } : { titles };

            try {
                const response = await fetch("/api/praise/delete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(reqBody)
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.detail || "삭제 실패");
                }

                selectedPraiseSongs = [];
                const searchInput = document.getElementById("input-praise-search");
                fetchPraiseSongs(searchInput ? searchInput.value : "");
            } catch (err) {
                alert("찬양 삭제 오류: " + err.message);
            }
        }

        // 복사 (Ctrl+C)
        function copySelectedPraiseSongs() {
            if (selectedPraiseSongs.length === 0) return;
            praiseClipboardData = JSON.parse(JSON.stringify(selectedPraiseSongs));
            try {
                navigator.clipboard.writeText(JSON.stringify({
                    subcastType: "praiseSongs",
                    data: praiseClipboardData
                }));
            } catch (err) {
                console.error("클립보드 저장 실패:", err);
            }
        }

        // 잘라내기 (Ctrl+X)
        function cutSelectedPraiseSongs() {
            if (selectedPraiseSongs.length === 0) return;
            copySelectedPraiseSongs();
            deleteSelectedPraiseSongsWithConfirm(false);
        }

        // 붙여넣기 (Ctrl+V)
        async function pastePraiseSongs() {
            let itemsToPaste = praiseClipboardData;
            try {
                const clipText = await navigator.clipboard.readText();
                if (clipText) {
                    const parsed = JSON.parse(clipText);
                    if (parsed && parsed.subcastType === "praiseSongs" && Array.isArray(parsed.data)) {
                        itemsToPaste = parsed.data;
                    }
                }
            } catch (e) {
                // 클립보드 읽기 실패 시 내부 메모리 사용
            }

            if (!itemsToPaste || itemsToPaste.length === 0) {
                return;
            }

            let successCount = 0;
            for (const song of itemsToPaste) {
                const newTitle = song.title + " (복사본)";
                try {
                    const resp = await fetch("/api/praise/save", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ title: newTitle, lyrics: song.lyrics })
                    });
                    if (resp.ok) successCount++;
                } catch (err) {
                    console.error("붙여넣기 저장 오류:", err);
                }
            }

            if (successCount > 0) {
                const searchInput = document.getElementById("input-praise-search");
                fetchPraiseSongs(searchInput ? searchInput.value : "");
            }
        }

        function initPraiseFeature() {
            const searchInput = document.getElementById("input-praise-search");
            const songsList = document.getElementById("praise-songs-list");
            const openAddModalBtn = document.getElementById("btn-praise-open-add-modal");
            const addSlidesBtn = document.getElementById("btn-add-praise-slides");

            const addModal = document.getElementById("praise-add-modal");
            const modalCloseBtn = document.getElementById("btn-praise-modal-close");
            const modalCancelBtn = document.getElementById("btn-praise-modal-cancel");
            const modalSaveBtn = document.getElementById("btn-praise-modal-save");

            const btnEditSelected = document.getElementById("btn-praise-edit-selected");
            const btnDeleteSelected = document.getElementById("btn-praise-delete-selected");

            const chkAllPraise = document.getElementById("chk-select-all-praise");
            const previewList = document.getElementById("praise-preview-list");

            const btnCloseViewer = document.getElementById("btn-close-praise-viewer");
            if (btnCloseViewer) {
                btnCloseViewer.onclick = hidePraiseMainViewer;
            }

            const filterChips = document.querySelectorAll(".praise-filter-chip");
            filterChips.forEach(chip => {
                chip.onclick = () => {
                    filterChips.forEach(c => {
                        c.classList.remove("active");
                        c.style.background = "rgba(255,255,255,0.05)";
                        c.style.borderColor = "var(--panel-border)";
                        c.style.color = "#cbd5e1";
                    });
                    chip.classList.add("active");
                    chip.style.background = "var(--primary)";
                    chip.style.borderColor = "var(--primary)";
                    chip.style.color = "#ffffff";

                    const filterVal = chip.getAttribute("data-filter");
                    if (filterVal === "all") {
                        if (searchInput) searchInput.value = "";
                        fetchPraiseSongs("");
                    } else {
                        if (searchInput) searchInput.value = filterVal;
                        fetchPraiseSongs(filterVal);
                    }
                };
            });

            const moodChipsContainer = document.getElementById("modal-praise-mood-chips");
            if (moodChipsContainer) {
                const chips = moodChipsContainer.querySelectorAll(".mood-chip");
                chips.forEach(chip => {
                    chip.onclick = () => {
                        chips.forEach(c => {
                            c.classList.remove("active");
                            c.style.background = "rgba(255,255,255,0.05)";
                            c.style.borderColor = "var(--panel-border)";
                            c.style.color = "#cbd5e1";
                        });
                        chip.classList.add("active");
                        chip.style.background = "var(--primary)";
                        chip.style.borderColor = "var(--primary)";
                        chip.style.color = "#ffffff";
                    };
                });
            }

            if (chkAllPraise && previewList) {
                chkAllPraise.onchange = (e) => {
                    const checkboxes = previewList.querySelectorAll(".praise-preview-item-chk");
                    checkboxes.forEach(chk => {
                        chk.checked = e.target.checked;
                    });
                    updatePraiseExpectedCount();
                };
            }

            // 디자인 컨트롤러 요소들
            const presetSelect = document.getElementById("select-praise-design-preset");
            const customPanel = document.getElementById("praise-custom-style-panel");
            const fontColorInput = document.getElementById("input-praise-font-color");
            const fontSizeInput = document.getElementById("input-praise-font-size");
            const fontSizeVal = document.getElementById("lbl-praise-font-size-val");
            const textAlignSelect = document.getElementById("select-praise-text-align");
            const positionSelect = document.getElementById("select-praise-position");
            const bgTypeSelect = document.getElementById("select-praise-bg-type");

            if (!searchInput || !songsList || !openAddModalBtn || !addSlidesBtn || !addModal) return;

            // 1) 최초 로드 시 DB 내 전체 찬양 목록 렌더링
            fetchPraiseSongs("");

            // 찬양 데이터 내보내기/가져오기 이벤트 바인딩
            const btnPraiseExport = document.getElementById("btn-praise-export");

            const exportPraiseAction = (idsArray) => {
                if (idsArray && idsArray.length > 0) {
                    window.location.href = `/api/praise/export?ids=${idsArray.join(",")}`;
                } else {
                    window.location.href = "/api/praise/export";
                }
            };

            if (btnPraiseExport) {
                btnPraiseExport.onclick = () => {
                    if (selectedPraiseSongs && selectedPraiseSongs.length > 0) {
                        const selectedIds = selectedPraiseSongs.map(s => s.id);
                        exportPraiseAction(selectedIds);
                    } else {
                        exportPraiseAction();
                    }
                };
            }

            const btnPraiseImport = document.getElementById("btn-praise-import");
            const fileImportPraise = document.getElementById("file-import-praise");
            if (btnPraiseImport && fileImportPraise) {
                btnPraiseImport.onclick = () => {
                    fileImportPraise.value = "";
                    fileImportPraise.click();
                };
                fileImportPraise.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;

                    const formData = new FormData();
                    formData.append("file", file);

                    try {
                        const res = await fetch("/api/praise/import", {
                            method: "POST",
                            body: formData
                        });
                        if (!res.ok) {
                            const errData = await res.json();
                            throw new Error(errData.detail || "찬양 가져오기 실패");
                        }
                        const data = await res.json();
                        alert(`성공적으로 ${data.imported_count || 0}곡의 찬양 데이터를 가져왔습니다.`);
                        fetchPraiseSongs(searchInput ? searchInput.value : "");
                    } catch (err) {
                        alert("찬양 데이터 가져오기 오류: " + err.message);
                    }
                };
            }

            // 2) 실시간 검색어 입력 시 목록 필터링
            searchInput.oninput = (e) => {
                fetchPraiseSongs(e.target.value);
            };

            // 3) 모달 열기/닫기 제어
            const closeAddModal = () => {
                addModal.style.display = "none";
                document.getElementById("modal-praise-title").value = "";
                document.getElementById("modal-praise-lyrics").value = "";
                currentEditingPraiseSong = null;
            };

            openAddModalBtn.onclick = openAddPraiseModal;
            if (modalCloseBtn) modalCloseBtn.onclick = closeAddModal;
            if (modalCancelBtn) modalCancelBtn.onclick = closeAddModal;

            if (btnEditSelected) {
                btnEditSelected.onclick = () => {
                    if (selectedPraiseSongs.length === 1) {
                        openEditPraiseModal(selectedPraiseSongs[0]);
                    } else if (selectedPraiseSongs.length > 1) {
                        alert("한 번에 하나의 찬양곡만 수정할 수 있습니다.");
                    }
                };
            }

            if (btnDeleteSelected) {
                btnDeleteSelected.onclick = () => {
                    deleteSelectedPraiseSongsWithConfirm();
                };
            }

            // 우클릭 컨텍스트 메뉴 이벤트 연결
            const menuEdit = document.getElementById("menu-praise-edit");
            const menuCopy = document.getElementById("menu-praise-copy");
            const menuCut = document.getElementById("menu-praise-cut");
            const menuPaste = document.getElementById("menu-praise-paste");
            const menuDelete = document.getElementById("menu-praise-delete");

            if (menuEdit) {
                menuEdit.onclick = () => {
                    hidePraiseContextMenu();
                    if (selectedPraiseSongs.length === 1) {
                        openEditPraiseModal(selectedPraiseSongs[0]);
                    }
                };
            }
            if (menuCopy) {
                menuCopy.onclick = () => {
                    hidePraiseContextMenu();
                    copySelectedPraiseSongs();
                };
            }
            if (menuCut) {
                menuCut.onclick = () => {
                    hidePraiseContextMenu();
                    cutSelectedPraiseSongs();
                };
            }
            if (menuPaste) {
                menuPaste.onclick = () => {
                    hidePraiseContextMenu();
                    pastePraiseSongs();
                };
            }
            if (menuDelete) {
                menuDelete.onclick = () => {
                    hidePraiseContextMenu();
                    deleteSelectedPraiseSongsWithConfirm();
                };
            }

            // 4) 모달 내 찬양 DB 신규 저장/수정
            if (modalSaveBtn) {
                modalSaveBtn.onclick = async () => {
                    const title = document.getElementById("modal-praise-title").value.trim();
                    const lyrics = document.getElementById("modal-praise-lyrics").value.trim();

                    if (!title || !lyrics) {
                        alert("제목과 가사를 모두 작성해 주세요.");
                        return;
                    }

                    modalSaveBtn.disabled = true;
                    modalSaveBtn.textContent = "⏳ 저장 중...";

                    let selectedMood = "경배/찬양";
                    const moodChipsContainer = document.getElementById("modal-praise-mood-chips");
                    if (moodChipsContainer) {
                        const activeChip = moodChipsContainer.querySelector(".mood-chip.active");
                        if (activeChip) {
                            const m = activeChip.getAttribute("data-mood");
                            if (m) selectedMood = m;
                        }
                    }

                    const savePayload = { title, lyrics, mood: selectedMood, moods: [selectedMood] };
                    if (currentEditingPraiseSong) {
                        if (currentEditingPraiseSong.id) {
                            savePayload.id = currentEditingPraiseSong.id;
                        }
                        savePayload.original_title = currentEditingPraiseSong.title;
                    }

                    try {
                        const response = await fetch("/api/praise/save", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(savePayload)
                        });

                        if (!response.ok) {
                            const err = await response.json();
                            throw new Error(err.detail || "저장 실패");
                        }

                        alert("찬양이 성공적으로 저장/업데이트 되었습니다.");
                        closeAddModal();
                        fetchPraiseSongs(searchInput.value); // 목록 새로고침
                    } catch (err) {
                        alert("오류 발생: " + err.message);
                    } finally {
                        modalSaveBtn.disabled = false;
                        modalSaveBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M12,10a4,4,0,1,0,4,4A4,4,0,0,0,12,10Zm0,6a2,2,0,1,1,2-2A2,2,0,0,1,12,16Z"/><path d="M22.536,4.122,19.878,1.464A4.966,4.966,0,0,0,16.343,0H5A5.006,5.006,0,0,0,0,5V19a5.006,5.006,0,0,0,5,5H19a5.006,5.006,0,0,0,5-5V7.657A4.966,4.966,0,0,0,22.536,4.122ZM17,2.08V3a3,3,0,0,1-3,3H10A3,3,0,0,1,7,3V2h9.343A2.953,2.953,0,0,1,17,2.08ZM22,19a3,3,0,0,1-3,3H5a3,3,0,0,1-3-3V5A3,3,0,0,1,5,2V3a5.006,5.006,0,0,0,5,5h4a4.991,4.991,0,0,0,4.962-4.624l2.16,2.16A3.02,3.02,0,0,1,22,7.657Z"/></svg> DB에 저장';
                    }
                };
            }

            // 곡 분위기에 맞는 고정 현장 배경 1개 매칭 헬퍼 함수 (중복 방지 excludeBgIds 지원)
            function matchStageBgForSong(songMood, excludeBgIds = []) {
                const bgList = (projectData && projectData.settings && projectData.settings.stageBgLibrary && projectData.settings.stageBgLibrary.length > 0)
                    ? projectData.settings.stageBgLibrary
                    : (allStageBgFiles || []);

                if (!bgList || bgList.length === 0) return null;

                const excludedSet = new Set(
                    (Array.isArray(excludeBgIds) ? excludeBgIds : [excludeBgIds])
                        .filter(Boolean)
                        .map(id => String(id))
                );

                const getBgIdentifier = (bg) => String(bg.id || bg.name);

                const normalizeTag = (str) => {
                    if (!str) return "";
                    let s = String(str).trim();
                    if (s.startsWith("#")) s = s.slice(1).trim();
                    return s.toLowerCase();
                };

                const extractTags = (val) => {
                    if (!val) return [];
                    const arr = Array.isArray(val) ? val : [val];
                    const res = [];
                    arr.forEach(item => {
                        const norm = normalizeTag(item);
                        if (norm && !res.includes(norm)) res.push(norm);
                    });
                    return res;
                };

                const targetTags = extractTags(songMood);

                // 1차: 태그가 일치하는 배경 후보
                let matchingCandidates = [];
                if (targetTags.length > 0) {
                    matchingCandidates = bgList.filter(bg => {
                        const rawBgMoods = [bg.mood, bg.tag, ...(Array.isArray(bg.moods) ? bg.moods : [bg.moods])];
                        const bgTags = extractTags(rawBgMoods);
                        return targetTags.some(t => bgTags.includes(t));
                    });
                }

                // 제외 대상 필터링 헬퍼
                const filterNonExcluded = (list) => list.filter(bg => !excludedSet.has(getBgIdentifier(bg)));

                // 1차 필터링: 태그 일치 + 미사용 후보
                let nonExcludedMatching = filterNonExcluded(matchingCandidates);

                let chosenBg = null;
                if (nonExcludedMatching.length > 0) {
                    // Tier 1: 태그 일치 미사용 배경 중 무작위 선택
                    chosenBg = nonExcludedMatching[Math.floor(Math.random() * nonExcludedMatching.length)];
                } else {
                    // Tier 4 (폴백): 미사용 후보가 고갈되었거나 해당 태그 미사용 배경이 없을 경우
                    // 태그 일치 후보군(없으면 기본/전체 라이브러리) 중 직전에 사용된 배경과 다른 항목 무작위 선택
                    const defaultCandidates = bgList.filter(bg => {
                        if (bg.isDefault || bg.is_default) return true;
                        const bgTags = extractTags([bg.mood, bg.tag, ...(Array.isArray(bg.moods) ? bg.moods : [bg.moods])]);
                        return bgTags.includes("기본/일반");
                    });

                    const lastUsedId = (Array.isArray(excludeBgIds) && excludeBgIds.length > 0) 
                        ? String(excludeBgIds[excludeBgIds.length - 1]) 
                        : null;
                    
                    let fallbackPool = matchingCandidates.length > 0 ? matchingCandidates : (defaultCandidates.length > 0 ? defaultCandidates : bgList);
                    if (lastUsedId && fallbackPool.length > 1) {
                        const nonLastPool = fallbackPool.filter(bg => getBgIdentifier(bg) !== lastUsedId);
                        if (nonLastPool.length > 0) {
                            fallbackPool = nonLastPool;
                        }
                    }
                    chosenBg = fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
                }

                return chosenBg ? getBgIdentifier(chosenBg) : null;
            }

            // === 슬라이드 현장 배경 직접 지정 모달 제어 ===
            let activeTargetSlideForBgModal = null;

            function showSlideBgSelectModal(slide) {
                if (!slide) return;
                activeTargetSlideForBgModal = slide;

                const modal = document.getElementById("slide-bg-select-modal");
                if (!modal) return;

                const searchInput = document.getElementById("input-slide-bg-modal-search");
                if (searchInput) searchInput.value = "";

                const filterChips = document.querySelectorAll(".slide-bg-modal-chip");
                filterChips.forEach(chip => {
                    const isAll = chip.getAttribute("data-filter") === "all";
                    chip.classList.toggle("active", isAll);
                    if (isAll) {
                        chip.style.background = "var(--primary)";
                        chip.style.borderColor = "var(--primary)";
                        chip.style.color = "#ffffff";
                    } else {
                        chip.style.background = "rgba(255,255,255,0.05)";
                        chip.style.borderColor = "var(--panel-border)";
                        chip.style.color = "#cbd5e1";
                    }
                });

                const chkApplyAll = document.getElementById("chk-slide-bg-modal-apply-all-song");
                if (chkApplyAll) {
                    const isPraise = Boolean(slide.praiseGroupId || slide.songTitle);
                    chkApplyAll.checked = isPraise;
                    chkApplyAll.disabled = !isPraise;
                    const label = chkApplyAll.nextElementSibling;
                    if (label) {
                        label.textContent = isPraise
                            ? `🎵 해당 찬양 곡 [${slide.songTitle || slide.name}] 전체 슬라이드에 일괄 적용`
                            : "🎵 단일 일반 슬라이드 (곡 일괄 적용 불가)";
                    }
                }

                renderSlideBgModalGrid();
                modal.style.display = "flex";
            }

            function renderSlideBgModalGrid() {
                const container = document.getElementById("slide-bg-modal-grid-container");
                if (!container) return;

                const searchInput = document.getElementById("input-slide-bg-modal-search");
                const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

                const activeChip = document.querySelector(".slide-bg-modal-chip.active");
                const filterVal = activeChip ? activeChip.getAttribute("data-filter") : "all";

                const bgList = (projectData && projectData.settings && projectData.settings.stageBgLibrary && projectData.settings.stageBgLibrary.length > 0)
                    ? projectData.settings.stageBgLibrary
                    : (allStageBgFiles || []);

                let filtered = bgList.filter(bg => {
                    const nameMatch = !query || bg.name.toLowerCase().includes(query);
                    if (!nameMatch) return false;

                    if (filterVal === "all") return true;

                    const bgMood = bg.mood || bg.tag;
                    const bgMoods = bg.moods || (bgMood ? [bgMood] : []);
                    return bgMood === filterVal || bgMoods.includes(filterVal);
                });

                const currentOverrideId = activeTargetSlideForBgModal ? activeTargetSlideForBgModal.overrideBgId : null;

                let html = "";
                filtered.forEach(f => {
                    const filenameWOExt = f.name.substring(0, f.name.lastIndexOf('.'));
                    const isYt = filenameWOExt.length === 11 && !f.name.startsWith('upload_');
                    const thumbUrl = f.thumbnailUrl || (isYt ? `https://img.youtube.com/vi/${filenameWOExt}/hqdefault.jpg` : '');
                    const isSelected = currentOverrideId && (f.id === currentOverrideId || f.name === currentOverrideId);
                    const safeName = f.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                    const moodsList = f.moods || [];
                    const moodChipsHtml = moodsList.map(m => `<span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 0.62rem; padding: 1px 5px; border-radius: 8px;">#${m}</span>`).join(' ');

                    const borderStyle = isSelected ? '2px solid #38bdf8' : '1px solid var(--panel-border)';
                    const bgStyle = isSelected ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255,255,255,0.03)';

                    html += `
                        <div class="slide-bg-modal-item-card" data-id="${f.id || f.name}"
                            style="background: ${bgStyle}; border: ${borderStyle}; border-radius: 8px; padding: 8px; cursor: pointer; display: flex; flex-direction: column; gap: 6px; transition: all 0.15s; position: relative;">
                            ${isSelected ? `<span style="position: absolute; top: 6px; right: 6px; background: #0284c7; color: #fff; font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; z-index: 5;">✓ 지정됨</span>` : ''}
                            <div style="width: 100%; aspect-ratio: 16/9; background: #0f172a; border-radius: 4px; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                                ${thumbUrl ? `<img src="${thumbUrl}" style="width: 100%; height: 100%; object-fit: cover;">` : `<div style="color: #60a5fa; font-size: 1.5rem;">🎬</div>`}
                            </div>
                            <div style="font-size: 0.78rem; font-weight: 600; color: #fff; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" title="${safeName}">
                                ${safeName}
                            </div>
                            <div style="display: flex; flex-wrap: wrap; gap: 3px;">
                                ${moodChipsHtml || '<span style="color: var(--text-muted); font-size: 0.65rem;">태그 없음</span>'}
                            </div>
                        </div>
                    `;
                });

                if (filtered.length === 0) {
                    html = `<div style="grid-column: 1 / -1; padding: 30px; text-align: center; color: var(--text-muted); font-size: 0.82rem;">🔍 검색된 현장 배경이 없습니다.</div>`;
                }

                container.innerHTML = html;

                const cards = container.querySelectorAll(".slide-bg-modal-item-card");
                cards.forEach(card => {
                    card.onclick = () => {
                        const chosenBgId = card.getAttribute("data-id");
                        applySelectedBgToSlide(chosenBgId);
                    };
                });
            }

            function applySelectedBgToSlide(bgId) {
                if (!activeTargetSlideForBgModal || !projectData || !projectData.slides) return;

                const chkApplyAll = document.getElementById("chk-slide-bg-modal-apply-all-song");
                const applyAll = chkApplyAll ? chkApplyAll.checked : false;

                if (applyAll) {
                    const targetGroupId = activeTargetSlideForBgModal.praiseGroupId;
                    const targetSongTitle = activeTargetSlideForBgModal.songTitle;

                    projectData.slides.forEach(s => {
                        let isTarget = false;
                        if (targetGroupId && s.praiseGroupId === targetGroupId) {
                            isTarget = true;
                        } else if (!targetGroupId && targetSongTitle && s.songTitle === targetSongTitle) {
                            isTarget = true;
                        }

                        if (isTarget) {
                            s.overrideBgId = bgId;
                        }
                    });
                } else {
                    activeTargetSlideForBgModal.overrideBgId = bgId;
                }

                triggerAutoSave();
                renderSlides();

                const modal = document.getElementById("slide-bg-select-modal");
                if (modal) modal.style.display = "none";
            }

            function bindSlideBgModalEvents() {
                const modal = document.getElementById("slide-bg-select-modal");
                if (!modal) return;

                const closeBtn = document.getElementById("btn-slide-bg-modal-close");
                const cancelBtn = document.getElementById("btn-slide-bg-modal-cancel");
                const clearBtn = document.getElementById("btn-slide-bg-modal-clear-override");
                const searchInput = document.getElementById("input-slide-bg-modal-search");

                const closeModal = () => {
                    modal.style.display = "none";
                    activeTargetSlideForBgModal = null;
                };

                if (closeBtn) closeBtn.onclick = closeModal;
                if (cancelBtn) cancelBtn.onclick = closeModal;

                if (clearBtn) {
                    clearBtn.onclick = () => {
                        if (!confirm("이 슬라이드(또는 곡)의 고정 배경을 해제하고 자동 분위기 매칭으로 초기화하시겠습니까?")) return;
                        applySelectedBgToSlide(null);
                    };
                }

                if (searchInput) {
                    searchInput.oninput = () => {
                        renderSlideBgModalGrid();
                    };
                }

                const filterChips = document.querySelectorAll(".slide-bg-modal-chip");
                filterChips.forEach(chip => {
                    chip.onclick = () => {
                        filterChips.forEach(c => {
                            c.classList.remove("active");
                            c.style.background = "rgba(255,255,255,0.05)";
                            c.style.borderColor = "var(--panel-border)";
                            c.style.color = "#cbd5e1";
                        });
                        chip.classList.add("active");
                        chip.style.background = "var(--primary)";
                        chip.style.borderColor = "var(--primary)";
                        chip.style.color = "#ffffff";
                        renderSlideBgModalGrid();
                    };
                });
            }

            window.matchStageBgForSong = matchStageBgForSong;
            window.showSlideBgSelectModal = showSlideBgSelectModal;
            window.renderSlideBgModalGrid = renderSlideBgModalGrid;
            window.applySelectedBgToSlide = applySelectedBgToSlide;
            window.bindSlideBgModalEvents = bindSlideBgModalEvents;

            // 5) 디자인 프리셋 선택 반응형 이벤트 리스너
            const fontOpacityInput = document.getElementById("input-praise-font-opacity");
            const fontOpacityVal = document.getElementById("input-praise-font-opacity-val");

            if (presetSelect && customPanel) {
                // 최초 1회 동기화 실행
                syncPresetValues(presetSelect.value);

                presetSelect.onchange = (e) => {
                    syncPresetValues(e.target.value);
                };

                function updatePraiseTemplateOptions() {
                    const selectTpl = document.getElementById("select-praise-user-template");
                    if (!selectTpl || !projectData) return;
                    selectTpl.innerHTML = "";
                    if (!projectData.templates || projectData.templates.length === 0) {
                        const opt = document.createElement("option");
                        opt.value = "";
                        opt.textContent = "(등록된 템플릿 없음)";
                        selectTpl.appendChild(opt);
                        const selectBox = document.getElementById("select-praise-target-textbox");
                        if (selectBox) selectBox.innerHTML = "";
                        const container = document.getElementById("praise-textbox-select-container");
                        if (container) container.style.display = "none";
                        return;
                    }
                    projectData.templates.forEach(t => {
                        const opt = document.createElement("option");
                        opt.value = t.id;
                        opt.textContent = t.name;
                        selectTpl.appendChild(opt);
                    });

                    // 첫 템플릿 기준으로 텍스트 상자 옵션 로드
                    const firstTpl = projectData.templates[0];
                    updatePraiseTextboxOptions(firstTpl);
                }

                function updatePraiseTextboxOptions(targetTemplate) {
                    const selectBox = document.getElementById("select-praise-target-textbox");
                    const container = document.getElementById("praise-textbox-select-container");
                    if (!selectBox || !container) return;

                    const textElements = targetTemplate.elements.filter(el => el.type === "text");

                    if (textElements.length === 0) {
                        alert("선택한 디자인 템플릿에 자막 텍스트를 대입할 수 있는 텍스트 상자가 존재하지 않습니다. 다른 템플릿을 선택해 주세요.");
                        container.style.display = "none";
                        selectBox.innerHTML = "";
                        return;
                    }

                    if (textElements.length === 1) {
                        container.style.display = "none";
                        const locName = getGeometricLocationName(textElements[0].x, textElements[0].y);
                        selectBox.innerHTML = `<option value="${textElements[0].id}">${textElements[0].content || "텍스트 영역 1"} [${locName}] (${textElements[0].id})</option>`;
                    } else {
                        container.style.display = "flex";
                        selectBox.innerHTML = "";
                        textElements.forEach((el, index) => {
                            const previewText = el.content ? el.content.substring(0, 15) : `텍스트 영역 ${index + 1}`;
                            const locName = getGeometricLocationName(el.x, el.y);
                            const opt = document.createElement("option");
                            opt.value = el.id;
                            opt.textContent = `[텍스트 영역 ${index + 1}] [${locName}] ${previewText} (${el.id})`;
                            selectBox.appendChild(opt);
                        });
                    }
                }

                const selectTpl = document.getElementById("select-praise-user-template");
                if (selectTpl) {
                    selectTpl.onchange = (e) => {
                        const tplId = e.target.value;
                        const targetTpl = projectData && projectData.templates ? projectData.templates.find(t => t.id === tplId) : null;
                        if (targetTpl) {
                            updatePraiseTextboxOptions(targetTpl);
                        }
                    };
                }

                function syncPresetValues(preset) {
                    const tplContainer = document.getElementById("praise-template-select-container");
                    const boxContainer = document.getElementById("praise-textbox-select-container");

                    if (tplContainer) {
                        tplContainer.style.display = (preset === "template") ? "flex" : "none";
                    }
                    if (boxContainer && preset !== "template") {
                        boxContainer.style.display = "none";
                    }

                    if (preset === "template") {
                        customPanel.style.display = "none";
                        updatePraiseTemplateOptions();
                    } else if (preset === "custom") {
                        customPanel.style.display = "flex";
                        // 커스텀 상태일 때는 모든 제어 폼 활성화
                        fontColorInput.disabled = false;
                        if (fontOpacityInput) fontOpacityInput.disabled = false;
                        fontSizeInput.disabled = false;
                        textAlignSelect.disabled = false;
                        positionSelect.disabled = false;
                        bgTypeSelect.disabled = false;
                    } else {
                        customPanel.style.display = "none";
                        if (preset === "type-a") {
                            // 타입 A: 하단 좌측형, 투명배경, 흰색글자
                            fontColorInput.value = "#ffffff";
                            if (fontOpacityInput) fontOpacityInput.value = "100";
                            fontSizeInput.value = "3.5";
                            textAlignSelect.value = "left";
                            positionSelect.value = "bottom";
                            bgTypeSelect.value = "transparent";
                        } else if (preset === "type-b") {
                            // 타입 B: 상단 중앙형, 투명배경, 차콜글자
                            fontColorInput.value = "#222222";
                            if (fontOpacityInput) fontOpacityInput.value = "100";
                            fontSizeInput.value = "3.5";
                            textAlignSelect.value = "center";
                            positionSelect.value = "top";
                            bgTypeSelect.value = "transparent";
                        } else if (preset === "type-black") {
                            // 블랙 채우기: 중앙 정렬, 검은배경, 흰색글자
                            fontColorInput.value = "#ffffff";
                            if (fontOpacityInput) fontOpacityInput.value = "100";
                            fontSizeInput.value = "3.5";
                            textAlignSelect.value = "center";
                            positionSelect.value = "middle";
                            bgTypeSelect.value = "black";
                        }
                        if (fontSizeVal) fontSizeVal.textContent = fontSizeInput.value;
                        if (fontOpacityInput && fontOpacityVal) fontOpacityVal.textContent = fontOpacityInput.value + "%";
                    }
                }
            }

            // 글자 크기 슬라이더 밸류 동적 라벨 표시
            if (fontSizeInput && fontSizeVal) {
                fontSizeInput.oninput = (e) => {
                    fontSizeVal.textContent = e.target.value;
                };
            }

            // 글자 투명도 슬라이더 밸류 동적 라벨 표시
            if (fontOpacityInput && fontOpacityVal) {
                fontOpacityInput.oninput = (e) => {
                    fontOpacityVal.textContent = e.target.value + "%";
                };
            }

            // 6) 슬라이드 추가 모달 오픈 연동 (수정된 디자인 옵션 주입)
            addSlidesBtn.onclick = () => {
                if (!activeSelectedPraiseSong) return;

                const title = activeSelectedPraiseSong.title;
                const lyrics = activeSelectedPraiseSong.lyrics;
                const blocks = lyrics.split(/\n\s*\n/).map(s => s.trim()).filter(s => s !== "");

                // 선택된 슬라이드 인덱스 추출
                const previewChks = document.querySelectorAll(".praise-preview-item-chk");
                const checkedIndices = Array.from(previewChks)
                    .filter(chk => chk.checked)
                    .map(chk => parseInt(chk.dataset.index));

                if (checkedIndices.length === 0) {
                    alert("추가할 슬라이드를 선택해 주세요.");
                    return;
                }

                tempPraiseSlidesToAdd = [];

                const songMood = activeSelectedPraiseSong.mood || (activeSelectedPraiseSong.moods && activeSelectedPraiseSong.moods[0]) || "경배/찬양";
                
                // 기존 슬라이드 목록에서 사용 중인 overrideBgId 수집하여 중복 방지
                const existingUsedBgIds = (projectData && projectData.slides)
                    ? projectData.slides.map(s => s.overrideBgId).filter(Boolean)
                    : [];

                const fixedBgId = matchStageBgForSong(songMood, existingUsedBgIds);
                const praiseGroupId = "praise_grp_" + Math.random().toString(36).substr(2, 9);

                if (presetSelect && presetSelect.value === "template") {
                    const selectTpl = document.getElementById("select-praise-user-template");
                    const tplId = selectTpl ? selectTpl.value : "";
                    const targetTpl = projectData && projectData.templates ? projectData.templates.find(t => t.id === tplId) : null;

                    if (!targetTpl) {
                        alert("적용할 디자인 템플릿을 선택하거나 먼저 등록해 주세요.");
                        return;
                    }

                    const selectBox = document.getElementById("select-praise-target-textbox");
                    const targetElementId = selectBox ? selectBox.value : "";

                    if (!targetElementId) {
                        alert("선택한 디자인 템플릿에 자막 텍스트를 대입할 수 있는 텍스트 상자가 존재하지 않습니다. 다른 템플릿을 선택해 주세요.");
                        return;
                    }

                    blocks.forEach((block, idx) => {
                        if (!checkedIndices.includes(idx)) return;
                        const headerText = `${title} (${idx + 1}/${blocks.length})`;
                        const slideObj = createSlideFromTemplateExplicit(targetTpl, headerText, block, targetElementId);
                        slideObj.mood = songMood;
                        slideObj.moods = [songMood];
                        slideObj.overrideBgId = fixedBgId;
                        slideObj.songTitle = title;
                        slideObj.praiseGroupId = praiseGroupId;
                        tempPraiseSlidesToAdd.push(slideObj);
                    });
                } else {
                    // 현재 디자인 옵션 수집 (RGBA 색상 변환 적용)
                    const opacityVal = fontOpacityInput ? fontOpacityInput.value : 100;
                    const fontColorRgba = hexAndOpacityToRgba(fontColorInput.value, opacityVal);

                    const styleOptions = {
                        fontColor: fontColorRgba,
                        fontSize: fontSizeInput.value + "vw",
                        textAlign: textAlignSelect.value,
                        position: positionSelect.value,
                        backgroundType: bgTypeSelect.value
                    };

                    blocks.forEach((block, idx) => {
                        if (!checkedIndices.includes(idx)) return;
                        const headerText = `${title} (${idx + 1}/${blocks.length})`;
                        const slideObj = createPraiseSlideObject(headerText, block, styleOptions);
                        slideObj.mood = songMood;
                        slideObj.moods = [songMood];
                        slideObj.overrideBgId = fixedBgId;
                        slideObj.songTitle = title;
                        slideObj.praiseGroupId = praiseGroupId;
                        tempPraiseSlidesToAdd.push(slideObj);
                    });
                }

                if (tempPraiseSlidesToAdd.length > 0) {
                    targetInsertAfterSlideId = null;
                    renderBibleModalSlideGrid();
                    const modalTitle = document.querySelector("#bible-insert-modal h3");
                    if (modalTitle) modalTitle.textContent = "📍 찬양 슬라이드 삽입 위치 선택";
                    document.getElementById("bible-insert-modal").style.display = "flex";
                }
            };
        }

        // DB에서 찬양 목록 가져오기 및 목록 그리기
        async function fetchPraiseSongs(query = "") {
            const songsList = document.getElementById("praise-songs-list");
            if (!songsList) return;

            // 영타 한글 자동 변환 적용
            const translatedQuery = typeof engTypeToKor === 'function' ? engTypeToKor(query) : query;

            try {
                const response = await fetch(`/api/praise/search?query=${encodeURIComponent(translatedQuery)}`);
                if (!response.ok) throw new Error("검색 실패");
                const results = await response.json();
                renderPraiseSongsList(results);
            } catch (err) {
                console.error("찬양 목록 조회 오류: ", err);
                songsList.innerHTML = `<div style="color: #ef4444; font-size: 0.75rem; text-align: center; padding: 10px;">목록 로드 오류</div>`;
            }
        }

        function getMoodBadgeStyle(mood) {
            switch(mood) {
                case "경배/찬양": return "background: rgba(99, 102, 241, 0.2); border: 1px solid rgba(129, 140, 248, 0.4); color: #818cf8;";
                case "잔잔/묵상": return "background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(52, 211, 153, 0.4); color: #34d399;";
                case "기도/회개": return "background: rgba(244, 63, 94, 0.2); border: 1px solid rgba(244, 63, 94, 0.4); color: #f43f5e;";
                case "결단/헌금": return "background: rgba(245, 158, 11, 0.2); border: 1px solid rgba(251, 191, 36, 0.4); color: #fbbf24;";
                case "웅장/선포": return "background: rgba(14, 165, 233, 0.2); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8;";
                case "절기/특별": return "background: rgba(168, 85, 247, 0.2); border: 1px solid rgba(168, 85, 247, 0.4); color: #a855f7;";
                default: return "background: rgba(148, 163, 184, 0.2); border: 1px solid rgba(148, 163, 184, 0.4); color: #94a3b8;";
            }
        }

        // 찬양 목록 UI 그리기
        function renderPraiseSongsList(songs) {
            const songsList = document.getElementById("praise-songs-list");
            if (!songsList) return;

            currentPraiseSongsList = songs || [];
            songsList.innerHTML = "";

            if (currentPraiseSongsList.length === 0) {
                songsList.innerHTML = `<div style="color: var(--text-muted); font-size: 0.78rem; text-align: center; margin: auto; padding: 20px 0;">등록된 찬양이 없습니다.</div>`;
                selectedPraiseSongs = [];
                updatePraiseSelectionUI();
                return;
            }

            // 이전 선택 정보가 유효한지 보정
            selectedPraiseSongs = selectedPraiseSongs.filter(sel => currentPraiseSongsList.some(s => s.title === sel.title));

            currentPraiseSongsList.forEach((song, index) => {
                const div = document.createElement("div");
                div.className = "bible-result-item";
                div.dataset.index = index;
                div.dataset.title = song.title;
                div.style.padding = "10px";
                div.style.cursor = "pointer";
                div.style.display = "flex";
                div.style.flexDirection = "column";
                div.style.gap = "4px";
                div.style.userSelect = "none";

                if (selectedPraiseSongs.some(s => s.title === song.title)) {
                    div.classList.add("selected");
                }

                const songMood = (song.moods && song.moods[0]) || song.mood || "기본/일반";
                const badgeStyle = getMoodBadgeStyle(songMood);

                // 가사 첫줄 미리보기
                const lines = song.lyrics.split("\n").filter(l => l.trim() !== "");
                const previewText = lines.length > 0 ? lines[0] : "";

                div.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; pointer-events: none;">
                        <span style="font-size: 0.81rem; font-weight: 600; color: var(--text-main); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 65%;">${song.title}</span>
                        <span style="font-size: 0.65rem; font-weight: 600; padding: 2px 7px; border-radius: 10px; ${badgeStyle} flex-shrink: 0;">#${songMood}</span>
                    </div>
                    <span style="font-size: 0.7rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; margin-top: 1px;">${previewText}</span>
                `;

                // 클릭 (다중 선택, Shift, Ctrl)
                div.onclick = (e) => {
                    if (e.ctrlKey || e.metaKey) {
                        const existsIdx = selectedPraiseSongs.findIndex(s => s.title === song.title);
                        if (existsIdx >= 0) {
                            selectedPraiseSongs.splice(existsIdx, 1);
                        } else {
                            selectedPraiseSongs.push(song);
                        }
                    } else if (e.shiftKey && lastSelectedPraiseIndex >= 0) {
                        const start = Math.min(lastSelectedPraiseIndex, index);
                        const end = Math.max(lastSelectedPraiseIndex, index);
                        const rangeSongs = currentPraiseSongsList.slice(start, end + 1);
                        rangeSongs.forEach(rs => {
                            if (!selectedPraiseSongs.some(s => s.title === rs.title)) {
                                selectedPraiseSongs.push(rs);
                            }
                        });
                    } else {
                        const isAlreadyOnly = (selectedPraiseSongs.length === 1 && selectedPraiseSongs[0].title === song.title);
                        if (isAlreadyOnly) {
                            selectedPraiseSongs = [];
                        } else {
                            selectedPraiseSongs = [song];
                        }
                    }
                    lastSelectedPraiseIndex = index;
                    updatePraiseSelectionUI();
                };

                // 우클릭 (컨텍스트 메뉴)
                div.oncontextmenu = (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const inSel = selectedPraiseSongs.some(s => s.title === song.title);
                    if (!inSel) {
                        selectedPraiseSongs = [song];
                        lastSelectedPraiseIndex = index;
                        updatePraiseSelectionUI();
                    }
                    showPraiseContextMenu(e.clientX, e.clientY);
                };

                songsList.appendChild(div);
            });

            updatePraiseSelectionUI();
        }

        // 찬양용 슬라이드 데이터 빌더 (커스텀 디자인 매핑 규격)
        function createPraiseSlideObject(header, content, styleOptions) {
            const slideId = "slide_praise_" + Math.random().toString(36).substr(2, 8);
            const elements = [];

            // 1. 배경 설정
            if (styleOptions.backgroundType === "black") {
                // 블랙 단색 채우기
                elements.push({
                    id: "elem_praise_bg_" + Math.random().toString(36).substr(2, 9),
                    type: "rect",
                    content: "",
                    x: 0.0,
                    y: 0.0,
                    width: 100.0,
                    height: 100.0,
                    style: {
                        fillColor: "#000000",
                        strokeColor: "transparent",
                        strokeWidth: 0,
                        cornerRadius: 0,
                        opacity: 1.0
                    }
                });
            } else if (styleOptions.backgroundType === "bar") {
                // 자막 바 (Band) 배치 - 하단 또는 상단 글자 위치에 맞춤
                let barY = 38.0; // middle
                if (styleOptions.position === "top") barY = 6.0;
                if (styleOptions.position === "bottom") barY = 70.0;

                elements.push({
                    id: "elem_praise_bg_bar_" + Math.random().toString(36).substr(2, 9),
                    type: "rect",
                    content: "",
                    x: 0.0,
                    y: barY,
                    width: 100.0,
                    height: 24.0,
                    style: {
                        fillColor: "#000000",
                        strokeColor: "transparent",
                        strokeWidth: 0,
                        cornerRadius: 0,
                        opacity: 0.65 // 반투명 65% 바
                    }
                });
            }

            // 2. 가사 텍스트 기하학적 Y축 좌표 및 정렬 연산
            let textY = 38.0; // middle default
            let textX = 7.2;
            let textWidth = 85.6;

            if (styleOptions.position === "top") {
                textY = 12.0;
            } else if (styleOptions.position === "bottom") {
                textY = 76.0;
            }

            // 타입 A 좌측 정렬인 경우 레이아웃 좌측 편향 여백 연산
            if (styleOptions.textAlign === "left") {
                textX = 7.2;
                textWidth = 85.6;
            }

            // 가사 본문 텍스트 요소 (제목 헤더 표시 부분 전면 제거됨)
            elements.push({
                id: "elem_praise_c_" + Math.random().toString(36).substr(2, 9),
                type: "text",
                content: content,
                x: textX,
                y: textY,
                width: textWidth,
                height: 20.0,
                style: {
                    fontSize: styleOptions.fontSize,
                    fontColor: styleOptions.fontColor,
                    fontFamily: "Inter",
                    fontWeight: "700",
                    textAlign: styleOptions.textAlign,
                    // 가독성을 위한 외곽선(특히 투명 배경 오버레이 시 극대화, 정수 검증 준수)
                    strokeColor: styleOptions.fontColor === "#ffffff" ? "#000000" : "transparent",
                    strokeWidth: styleOptions.fontColor === "#ffffff" ? 3 : 0
                }
            });

            return {
                id: slideId,
                name: `찬양: ${header}`,
                elements: elements
            };
        }

        function createSlideFromTemplateExplicit(tpl, header, contentBlock, targetElementId) {
            const slideId = "slide_praise_" + Math.random().toString(36).substr(2, 8);
            const clonedElements = JSON.parse(JSON.stringify(tpl.elements));

            clonedElements.forEach(elem => {
                const oldId = elem.id;
                // 복사 후 ID 고유값 충돌 방지
                elem.id = "elem_praise_" + Math.random().toString(36).substr(2, 9);

                // 사용자가 지정한 본래 템플릿의 엘리먼트 ID와 일치할 때 가사 대입
                if (elem.type === "text" && oldId === targetElementId) {
                    elem.content = contentBlock;
                }
            });

            return {
                id: slideId,
                name: `자막(템): ${header}`,
                elements: clonedElements
            };
        }

        // x, y 좌표 백분율을 기반으로 9분할 기하학적 위치 이름을 판단하는 헬퍼 함수
        function getGeometricLocationName(x, y) {
            let vPos = "";
            if (y < 33) {
                vPos = "상단";
            } else if (y <= 66) {
                vPos = "중앙";
            } else {
                vPos = "하단";
            }

            let hPos = "";
            if (x < 33) {
                hPos = "좌측";
            } else if (x <= 66) {
                hPos = "중앙";
            } else {
                hPos = "우측";
            }

            if (vPos === "중앙" && hPos === "중앙") {
                return "정중앙";
            }
            return vPos + " " + hPos;
        }
