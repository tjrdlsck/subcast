        // ==========================================================================
        // Bible Search & Integration Feature Logic
        // ==========================================================================
        let selectedBibleVerses = [];
        let bibleBooksList = [];
        let lastFilteredBooks = [];
        let tempBibleSlidesToAdd = [];
        let targetInsertAfterSlideId = null;

        function initBibleFeature() {
            // 성경 책 목록 가져오기
            fetchBibleBooks();

            // 성경 번역본 선택 변경 이벤트 바인딩
            const selectVer = document.getElementById("select-bible-version");
            if (selectVer) {
                selectVer.addEventListener("change", () => {
                    fetchBibleBooks();
                });
            }

            // 성경 모달 취소 및 닫기 바인딩
            const closeBibleModal = () => {
                document.getElementById("bible-insert-modal").style.display = "none";
                tempBibleSlidesToAdd = [];
                targetInsertAfterSlideId = null;
            };
            document.getElementById("btn-bible-close-modal", "btn-bible-modal-close") ? document.getElementById("btn-bible-modal-close").onclick = closeBibleModal : null;

            // 안전 조치: 모달 내 버튼 바인딩
            setTimeout(() => {
                const closeBtn = document.getElementById("btn-bible-modal-close");
                const cancelBtn = document.getElementById("btn-bible-modal-cancel");
                const confirmBtn = document.getElementById("btn-bible-modal-confirm");
                if (closeBtn) closeBtn.onclick = closeBibleModal;
                if (cancelBtn) cancelBtn.onclick = closeBibleModal;
                if (confirmBtn) confirmBtn.onclick = confirmAddBibleSlides;
            }, 100);

            // 검색 모드 전환 핸들러
            document.getElementById("btn-mode-coord").onclick = () => switchBibleSearchMode("coord");
            document.getElementById("btn-mode-keyword").onclick = () => switchBibleSearchMode("keyword");

            // 장/절 조회 버튼
            document.getElementById("btn-bible-fetch").onclick = fetchBibleCoordinates;

            // 키워드 검색 버튼
            document.getElementById("btn-bible-search").onclick = searchBibleKeywords;
            document.getElementById("input-bible-keyword").onkeydown = (e) => {
                if (e.key === "Enter") searchBibleKeywords();
            };

            // 책 선택 변경 시 최대 장 수 조절
            document.getElementById("select-bible-book").onchange = onBibleBookChange;

            // 도서 검색 필터 및 팝업 제어 리스너 연동
            const filterInput = document.getElementById("input-bible-book-filter");
            filterInput.oninput = (e) => filterBibleBooks(e.target.value);
            filterInput.onfocus = () => {
                filterBibleBooks(filterInput.value);
            };
            filterInput.onkeydown = (e) => {
                if (e.key === "Enter") {
                    const popup = document.getElementById("bible-book-dropdown-popup");
                    // 1) 자동완성 결과가 1개이고 팝업이 노출 중인 경우 즉각 선택 및 팝업 닫기
                    if (lastFilteredBooks.length === 1 && popup && popup.style.display !== "none") {
                        e.preventDefault();
                        const book = lastFilteredBooks[0];
                        filterInput.value = book.book_name;
                        const selectBook = document.getElementById("select-bible-book");
                        selectBook.value = book.book_code;
                        onBibleBookChange();
                        popup.style.display = "none";
                    }
                    // 2) 팝업이 닫혀 있고 현재 입력한 값이 올바른 책 이름과 일치할 시 즉각 조회 및 본문 로드 실행
                    else if (popup && popup.style.display === "none") {
                        const currentVal = filterInput.value.trim();
                        const matchedBook = bibleBooksList.find(b => b.book_name === currentVal);
                        if (matchedBook) {
                            e.preventDefault();
                            fetchBibleCoordinates();
                        }
                    }
                }
            };

            // 바깥 영역 클릭 시 자동완성 팝업 닫기
            document.addEventListener("mousedown", (e) => {
                const wrapper = document.getElementById("bible-book-search-wrapper");
                const popup = document.getElementById("bible-book-dropdown-popup");
                if (wrapper && popup && !wrapper.contains(e.target)) {
                    popup.style.display = "none";
                }
            });

            // 전체 선택 체크박스
            document.getElementById("chk-select-all-bible").onchange = toggleSelectAllBible;

            // 분할 모드 변경 및 슬라이드 추가 버튼 바인딩
            document.getElementById("select-bible-split-mode").onchange = updateBibleExpectedSlides;
            document.getElementById("btn-add-bible-slides").onclick = addBibleSlidesToProject;

            // 성경 메인 표 뷰어 이벤트 바인딩
            initBibleMainViewerEvents();
        }

        // 영타 오타 한글 자동 변환기 (Keyboard Layout Translation)
        function engTypeToKor(eng) {
            if (!/^[a-zA-Z\s]+$/.test(eng)) {
                return eng; // 영문 알파벳만 있을 때만 오타로 취급하여 한글 변환 수행
            }

            const choMap = { 'r': 0, 'R': 1, 's': 2, 'e': 3, 'E': 4, 'f': 5, 'a': 6, 'q': 7, 'Q': 8, 't': 9, 'T': 10, 'd': 11, 'w': 12, 'W': 13, 'c': 14, 'z': 15, 'x': 16, 'v': 17, 'g': 18 };
            const jungMap = { 'k': 0, 'o': 1, 'i': 2, 'O': 3, 'j': 4, 'p': 5, 'u': 6, 'P': 7, 'h': 8, 'y': 12, 'n': 13, 'b': 17, 'm': 18, 'l': 20 };

            const doubleJung = { 'hk': 9, 'ho': 10, 'hl': 11, 'nj': 14, 'np': 15, 'nl': 16, 'ml': 19 };
            const doubleJong = { 'rt': 3, 'sw': 5, 'sg': 6, 'fr': 9, 'fa': 10, 'fq': 11, 'ft': 12, 'fx': 13, 'fv': 14, 'fg': 15, 'qt': 18 };

            const singleJongMap = { 'r': 1, 'R': 2, 's': 4, 'e': 7, 'f': 8, 'a': 16, 'q': 17, 't': 19, 'T': 20, 'd': 21, 'w': 22, 'c': 23, 'z': 24, 'x': 25, 'v': 26, 'g': 27 };
            const engToKorCharMap = {
                'r': 'ㄱ', 'R': 'ㄲ', 's': 'ㄴ', 'e': 'ㄷ', 'E': 'ㄸ', 'f': 'ㄹ', 'a': 'ㅁ', 'q': 'ㅂ', 'Q': 'ㅃ', 't': 'ㅅ', 'T': 'ㅆ', 'd': 'ㅇ', 'w': 'ㅈ', 'W': 'ㅉ', 'c': 'ㅊ', 'z': 'ㅋ', 'x': 'ㅌ', 'v': 'ㅍ', 'g': 'ㅎ',
                'k': 'ㅏ', 'o': 'ㅐ', 'i': '랴', 'O': 'ㅒ', 'j': 'ㅓ', 'p': 'ㅔ', 'u': 'ㅕ', 'P': 'ㅖ', 'h': 'ㅗ', 'y': 'ㅛ', 'n': 'ㅜ', 'b': 'ㅠ', 'm': 'ㅡ', 'l': 'ㅣ'
            };

            let result = "";
            let i = 0;

            while (i < eng.length) {
                let c = eng[i];
                let choCode = choMap[c];

                if (choCode === undefined) {
                    result += engToKorCharMap[c] || c;
                    i++;
                    continue;
                }

                let step = 1;

                // 모음 확인
                if (i + 1 < eng.length) {
                    let nextC = eng[i + 1];
                    let jungCode = jungMap[nextC];

                    if (jungCode !== undefined) {
                        step = 2;

                        // 이중 모음 여부 검증
                        if (i + 2 < eng.length) {
                            let possibleDoubleJung = nextC + eng[i + 2];
                            if (doubleJung[possibleDoubleJung] !== undefined) {
                                jungCode = doubleJung[possibleDoubleJung];
                                step = 3;
                            }
                        }

                        // 종성(받침) 판단
                        let jongCode = 0;
                        if (i + step < eng.length) {
                            let finalC = eng[i + step];
                            let singleJong = singleJongMap[finalC];

                            if (singleJong !== undefined) {
                                // 다음 글자의 모음 시작 가능성 확인
                                let isNextVowel = false;
                                if (i + step + 1 < eng.length) {
                                    let nextV = eng[i + step + 1];
                                    if (jungMap[nextV] !== undefined) {
                                        isNextVowel = true;
                                    }
                                }

                                if (!isNextVowel) {
                                    jongCode = singleJong;
                                    let addStep = 1;

                                    // 이중 받침 확인
                                    if (i + step + 1 < eng.length) {
                                        let possibleDoubleJong = finalC + eng[i + step + 1];
                                        if (doubleJong[possibleDoubleJong] !== undefined) {
                                            let isNextNextVowel = false;
                                            if (i + step + 2 < eng.length) {
                                                let nextNV = eng[i + step + 2];
                                                if (jungMap[nextNV] !== undefined) {
                                                    isNextNextVowel = true;
                                                }
                                            }
                                            if (!isNextNextVowel) {
                                                jongCode = doubleJong[possibleDoubleJong];
                                                addStep = 2;
                                            }
                                        }
                                    }
                                    step += addStep;
                                }
                            }
                        }

                        // 조합형 한글 생성 (초성*21 + 중성)*28 + 종성 + 0xAC00
                        result += String.fromCharCode((choCode * 21 + jungCode) * 28 + jongCode + 44032);
                        i += step;
                        continue;
                    }
                }

                // 단독 자음
                result += engToKorCharMap[c] || c;
                i += step;
            }

            return result;
        }

        function filterBibleBooks(query) {
            const popup = document.getElementById("bible-book-dropdown-popup");
            const selectBook = document.getElementById("select-bible-book");
            if (!popup || !selectBook || !bibleBooksList) return;

            const cleanQuery = query.trim().toLowerCase();
            const currentSelectedValue = selectBook.value;

            // 영어 오타일 가능성을 열고 한글 번역 수행
            const translatedQuery = engTypeToKor(query).trim().toLowerCase();

            let filtered = [];
            if (cleanQuery === "") {
                filtered = [...bibleBooksList];
            } else {
                filtered = bibleBooksList.filter(book =>
                    book.book_name.toLowerCase().includes(cleanQuery) ||
                    convertToShortBookName(book.book_name).toLowerCase().includes(cleanQuery) ||
                    book.book_code.toLowerCase().includes(cleanQuery) ||
                    // 오타 대응 매핑
                    book.book_name.toLowerCase().includes(translatedQuery) ||
                    convertToShortBookName(book.book_name).toLowerCase().includes(translatedQuery)
                );
            }

            // 검색 결과 캐시 보관 (엔터 키 입력 시 자동완성 판단용)
            lastFilteredBooks = filtered;

            popup.innerHTML = "";
            popup.style.display = "block";

            if (filtered.length === 0) {
                const div = document.createElement("div");
                div.className = "bible-book-dropdown-item";
                div.style.color = "var(--text-muted)";
                div.style.cursor = "default";
                div.textContent = "검색 결과 없음";
                popup.appendChild(div);
            } else {
                filtered.forEach(book => {
                    const div = document.createElement("div");
                    div.className = "bible-book-dropdown-item";
                    if (book.book_code === currentSelectedValue) {
                        div.classList.add("active");
                    }
                    div.textContent = book.book_name;
                    div.onclick = (e) => {
                        e.stopPropagation();
                        // 텍스트 필드 값 입력
                        document.getElementById("input-bible-book-filter").value = book.book_name;
                        // 숨김 select 값 지정
                        selectBook.value = book.book_code;
                        onBibleBookChange();
                        popup.style.display = "none";
                    };
                    popup.appendChild(div);
                });
            }
        }

        function switchBibleSearchMode(mode) {
            const isCoord = mode === "coord";
            document.getElementById("btn-mode-coord").classList.toggle("active", isCoord);
            document.getElementById("btn-mode-keyword").classList.toggle("active", !isCoord);

            document.getElementById("form-coord-search").style.display = isCoord ? "flex" : "none";
            document.getElementById("form-keyword-search").style.display = isCoord ? "none" : "flex";
        }

        function getSelectedBibleVersion() {
            const selectVer = document.getElementById("select-bible-version");
            return selectVer ? selectVer.value : "KRV";
        }

        async function fetchBibleBooks() {
            try {
                const version = getSelectedBibleVersion();
                const response = await fetch(`/api/bible/books?version=${version}`);
                if (!response.ok) throw new Error("성경 책 목록 로드 실패");
                bibleBooksList = await response.json();

                const selectBook = document.getElementById("select-bible-book");
                selectBook.innerHTML = "";

                bibleBooksList.forEach(book => {
                    const opt = document.createElement("option");
                    opt.value = book.book_code;
                    opt.textContent = book.book_name;
                    selectBook.appendChild(opt);
                });

                // 초기 설정 호출
                onBibleBookChange();
            } catch (err) {
                console.error("Bible books load error:", err);
            }
        }

        function onBibleBookChange() {
            const selectBook = document.getElementById("select-bible-book");
            const selectedCode = selectBook.value;
            const bookInfo = bibleBooksList.find(b => b.book_code === selectedCode);

            const inputChapter = document.getElementById("input-bible-chapter");
            if (bookInfo) {
                inputChapter.max = bookInfo.max_chapter;
                inputChapter.min = 1;
                inputChapter.value = 1;
            }

            // 장이 바뀌면 절 번호도 기본 1로 제어
            document.getElementById("input-bible-start-verse").value = 1;
            document.getElementById("input-bible-end-verse").value = "";
        }

        async function fetchBibleCoordinates() {
            const selectBook = document.getElementById("select-bible-book");
            const bookCode = selectBook.value;
            const chapter = parseInt(document.getElementById("input-bible-chapter").value);
            const startVerseVal = document.getElementById("input-bible-start-verse").value;
            const endVerseVal = document.getElementById("input-bible-end-verse").value;
            const version = getSelectedBibleVersion();

            if (!chapter || chapter < 1) {
                alert("올바른 장 번호를 입력하세요.");
                return;
            }

            const startVerse = startVerseVal ? parseInt(startVerseVal) : 1;
            const endVerse = endVerseVal ? parseInt(endVerseVal) : 999;

            if (startVerse > endVerse) {
                alert("시작 절은 끝 절보다 작거나 같아야 합니다.");
                return;
            }

            setBibleLoadingState(true, "btn-bible-fetch");
            try {
                const response = await fetch(`/api/bible/read?book_code=${bookCode}&chapter=${chapter}&start_verse=${startVerse}&end_verse=${endVerse}&version=${version}`);
                if (!response.ok) throw new Error("성경 구절 패치 실패");
                const data = await response.json();

                renderBibleResults(data.verses.map(v => ({
                    book_name: data.book_name,
                    book_code: data.book_code,
                    chapter: data.chapter,
                    verse: v.verse,
                    content: v.content
                })));
            } catch (err) {
                alert("오류 발생: " + err.message);
            } finally {
                setBibleLoadingState(false, "btn-bible-fetch");
            }
        }

        async function searchBibleKeywords() {
            const query = document.getElementById("input-bible-keyword").value.trim();
            const version = getSelectedBibleVersion();
            if (query.length < 2) {
                alert("검색어는 공백 제외 2글자 이상 입력해 주세요.");
                return;
            }

            setBibleLoadingState(true, "btn-bible-search");
            try {
                const response = await fetch(`/api/bible/search?query=${encodeURIComponent(query)}&version=${version}`);
                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.detail || "검색 실패");
                }
                const data = await response.json();
                renderBibleResults(data.results);
            } catch (err) {
                alert("오류 발생: " + err.message);
            } finally {
                setBibleLoadingState(false, "btn-bible-search");
            }
        }

        function setBibleLoadingState(isLoading, buttonId) {
            const btn = document.getElementById(buttonId);
            if (isLoading) {
                btn.disabled = true;
                btn.dataset.originalHtml = btn.innerHTML;
                btn.innerHTML = `<span class="btn-loading-spinner"></span> <span>조회 중...</span>`;
            } else {
                btn.disabled = false;
                btn.innerHTML = btn.dataset.originalHtml;
            }
        }

        // 성경 메인 표 뷰어 (중앙 슬라이드 영역 오버레이) 상태 제어
        let bibleViewerFontSize = 16; // 기본 글자 크기 (px)

        function updateBibleViewerFontSize(newSize) {
            bibleViewerFontSize = Math.max(5, Math.min(60, newSize));
            const table = document.getElementById("table-bible-main-viewer");
            if (table) {
                table.style.fontSize = `${bibleViewerFontSize}px`;
            }
            const label = document.getElementById("bible-viewer-fontsize-label");
            if (label) {
                label.textContent = `${bibleViewerFontSize}px`;
            }
        }

        function initBibleMainViewerEvents() {
            const viewerOverlay = document.getElementById("bible-main-viewer-overlay");

            if (viewerOverlay) {
                // Ctrl + 마우스 휠 글자 크기 조절
                viewerOverlay.addEventListener("wheel", (e) => {
                    if (e.ctrlKey) {
                        e.preventDefault();
                        if (e.deltaY < 0) {
                            updateBibleViewerFontSize(bibleViewerFontSize + 1);
                        } else if (e.deltaY > 0) {
                            updateBibleViewerFontSize(bibleViewerFontSize - 1);
                        }
                    }
                }, { passive: false });
            }

            const btnDecrease = document.getElementById("btn-bible-font-decrease");
            const btnIncrease = document.getElementById("btn-bible-font-increase");
            const btnReset = document.getElementById("btn-bible-font-reset");
            const btnClose = document.getElementById("btn-close-bible-viewer");
            const btnAddSlides = document.getElementById("btn-bible-viewer-add-slides");

            if (btnDecrease) btnDecrease.onclick = () => updateBibleViewerFontSize(bibleViewerFontSize - 1);
            if (btnIncrease) btnIncrease.onclick = () => updateBibleViewerFontSize(bibleViewerFontSize + 1);
            if (btnReset) btnReset.onclick = () => updateBibleViewerFontSize(16);
            if (btnClose) btnClose.onclick = hideBibleMainViewer;
            if (btnAddSlides) btnAddSlides.onclick = addBibleSlidesToProject;
        }

        let bibleViewerLastClickedIndex = -1;
        let isBibleViewerMouseDown = false;
        let bibleViewerDragStartIdx = -1;
        let bibleViewerIsDragging = false;
        let activeBibleResultsData = [];

        // 글로벌 mouseup 처리기 (드래그 상태 강제 해제)
        window.addEventListener("mouseup", () => {
            if (isBibleViewerMouseDown) {
                isBibleViewerMouseDown = false;
                bibleViewerDragStartIdx = -1;
                if (activeBibleResultsData && activeBibleResultsData.length > 0) {
                    syncSelectionFromViewer(activeBibleResultsData);
                }
            }
        });

        function attachBibleTableSelectionEvents(results) {
            const tbody = document.getElementById("tbody-bible-main-viewer");
            if (!tbody || !results) return;

            activeBibleResultsData = results;
            const rows = Array.from(tbody.querySelectorAll("tr"));
            if (rows.length === 0 || results.length === 0) return;

            rows.forEach((tr, idx) => {
                tr.dataset.index = idx;

                tr.onmousedown = (e) => {
                    if (e.button !== 0) return;
                    isBibleViewerMouseDown = true;
                    bibleViewerDragStartIdx = idx;
                    bibleViewerIsDragging = false;

                    if (e.ctrlKey || e.metaKey) {
                        tr.classList.toggle("selected");
                        bibleViewerLastClickedIndex = idx;
                        syncSelectionFromViewer(results);
                    } else if (e.shiftKey && bibleViewerLastClickedIndex !== -1) {
                        const start = Math.min(bibleViewerLastClickedIndex, idx);
                        const end = Math.max(bibleViewerLastClickedIndex, idx);
                        rows.forEach((r, rIdx) => {
                            if (rIdx >= start && rIdx <= end) {
                                r.classList.add("selected");
                            }
                        });
                        syncSelectionFromViewer(results);
                    }
                };

                tr.onmouseenter = (e) => {
                    if (isBibleViewerMouseDown && bibleViewerDragStartIdx !== -1) {
                        bibleViewerIsDragging = true;
                        const start = Math.min(bibleViewerDragStartIdx, idx);
                        const end = Math.max(bibleViewerDragStartIdx, idx);

                        if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                            rows.forEach((r, rIdx) => {
                                if (rIdx >= start && rIdx <= end) {
                                    r.classList.add("selected");
                                } else {
                                    r.classList.remove("selected");
                                }
                            });
                        } else {
                            rows.forEach((r, rIdx) => {
                                if (rIdx >= start && rIdx <= end) {
                                    r.classList.add("selected");
                                }
                            });
                        }
                        syncSelectionFromViewer(results);
                    }
                };

                tr.onclick = (e) => {
                    if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !bibleViewerIsDragging) {
                        const selectedRows = tbody.querySelectorAll("tr.selected");
                        const isSelected = tr.classList.contains("selected");

                        if (selectedRows.length === 1 && isSelected) {
                            tr.classList.remove("selected");
                        } else {
                            rows.forEach(r => r.classList.remove("selected"));
                            tr.classList.add("selected");
                        }
                        bibleViewerLastClickedIndex = idx;
                        syncSelectionFromViewer(results);
                    }
                };
            });
        }

        function syncSelectionFromViewer(results) {
            const tbody = document.getElementById("tbody-bible-main-viewer");
            if (!tbody || !results) return;

            const selectedIndices = [];
            const rows = tbody.querySelectorAll("tr");
            rows.forEach((tr, idx) => {
                if (tr.classList.contains("selected")) {
                    selectedIndices.push(idx);
                }
            });

            selectedBibleVerses = selectedIndices.map(i => results[i]).filter(Boolean);

            const leftItems = document.querySelectorAll("#bible-results-list .bible-result-item");
            leftItems.forEach((div, idx) => {
                const chk = div.querySelector(".bible-item-checkbox");
                const isSelected = selectedIndices.includes(idx);
                if (chk) chk.checked = isSelected;
                div.classList.toggle("selected", isSelected);
            });

            const count = selectedBibleVerses.length;
            const countLabel = document.getElementById("bible-viewer-selected-count");
            if (countLabel) countLabel.textContent = count;

            const viewerAddBtn = document.getElementById("btn-bible-viewer-add-slides");
            if (viewerAddBtn) {
                if (count > 0) {
                    viewerAddBtn.disabled = false;
                    viewerAddBtn.style.cursor = "pointer";
                    viewerAddBtn.style.opacity = "1";
                } else {
                    viewerAddBtn.disabled = true;
                    viewerAddBtn.style.cursor = "not-allowed";
                    viewerAddBtn.style.opacity = "0.5";
                }
            }

            updateBibleExpectedSlides();
        }

        function syncViewerFromLeftPanel() {
            const tbody = document.getElementById("tbody-bible-main-viewer");
            if (!tbody) return;

            const leftItems = document.querySelectorAll("#bible-results-list .bible-result-item");
            const rows = tbody.querySelectorAll("tr");

            leftItems.forEach((div, idx) => {
                const chk = div.querySelector(".bible-item-checkbox");
                const isChecked = chk && chk.checked;
                if (rows[idx]) {
                    rows[idx].classList.toggle("selected", isChecked);
                }
            });

            const count = selectedBibleVerses.length;
            const countLabel = document.getElementById("bible-viewer-selected-count");
            if (countLabel) countLabel.textContent = count;

            const viewerAddBtn = document.getElementById("btn-bible-viewer-add-slides");
            if (viewerAddBtn) {
                if (count > 0) {
                    viewerAddBtn.disabled = false;
                    viewerAddBtn.style.cursor = "pointer";
                    viewerAddBtn.style.opacity = "1";
                } else {
                    viewerAddBtn.disabled = true;
                    viewerAddBtn.style.cursor = "not-allowed";
                    viewerAddBtn.style.opacity = "0.5";
                }
            }
        }

        function showBibleMainViewer(results, titleInfo) {
            hideBibleLivePreview();
            const overlay = document.getElementById("bible-main-viewer-overlay");
            const tbody = document.getElementById("tbody-bible-main-viewer");
            const titleEl = document.getElementById("bible-viewer-title");

            if (!overlay || !tbody) return;

            if (titleInfo && titleEl) {
                titleEl.textContent = `${titleInfo}`;
            }

            tbody.innerHTML = "";

            if (!results || results.length === 0) {
                tbody.innerHTML = `<tr><td colspan="2" style="text-align: center; padding: 40px 0; color: var(--text-muted);">표시할 성경 구절이 없습니다.</td></tr>`;
            } else {
                results.forEach(item => {
                    const tr = document.createElement("tr");
                    const verseText = `${item.book_name} ${item.chapter}:${item.verse}`;

                    tr.innerHTML = `
                        <td class="verse-badge">${verseText}</td>
                        <td>${item.content}</td>
                    `;
                    tbody.appendChild(tr);
                });

                attachBibleTableSelectionEvents(results);
            }

            overlay.style.display = "flex";
            updateBibleViewerFontSize(bibleViewerFontSize);
            syncViewerFromLeftPanel();
        }

        function hideBibleMainViewer() {
            hideBibleLivePreview();
            const overlay = document.getElementById("bible-main-viewer-overlay");
            if (overlay) {
                overlay.style.display = "none";
            }
        }

        function renderBibleResults(results) {
            const container = document.getElementById("bible-results-list");
            container.innerHTML = "";

            document.getElementById("lbl-result-count").textContent = `검색 결과 (${results.length}건)`;
            document.getElementById("chk-select-all-bible").checked = false;
            selectedBibleVerses = [];
            updateBibleExpectedSlides();

            // 성경 조회가 성공했으므로 중앙 슬라이드 영역에 성경 메인 표 뷰어 출력
            let titleText = "성경 검색 결과";
            if (results && results.length > 0) {
                titleText = `${results[0].book_name} ${results[0].chapter}장 (총 ${results.length}구절)`;
            }
            showBibleMainViewer(results, titleText);

            if (results.length === 0) {
                container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.78rem; text-align: center; margin: auto; padding: 20px 0;">일치하는 구절이 없습니다.</div>`;
                return;
            }

            let lastClickedIndex = -1;

            results.forEach((item, index) => {
                const div = document.createElement("div");
                div.className = "bible-result-item";

                // 방송용 약칭 맵 적용
                const shortBook = convertToShortBookName(item.book_name);

                div.innerHTML = `
                    <input type="checkbox" class="bible-item-checkbox" data-index="${index}" style="margin-top: 4px; pointer-events: none;">
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                        <span class="bible-result-item-header">${shortBook} ${item.chapter}:${item.verse}</span>
                        <span class="bible-result-item-content">${item.content}</span>
                    </div>
                `;

                // 메모리 참조를 위해 데이터 보관
                div.dataset.verseData = JSON.stringify(item);

                // 클릭 인터랙션 (Shift 클릭 범위 다중 선택 탑재)
                div.onclick = (e) => {
                    const checkboxes = container.querySelectorAll(".bible-item-checkbox");
                    const itemsList = container.querySelectorAll(".bible-result-item");
                    const chk = div.querySelector(".bible-item-checkbox");

                    if (e.shiftKey && lastClickedIndex !== -1) {
                        const start = Math.min(lastClickedIndex, index);
                        const end = Math.max(lastClickedIndex, index);

                        // 마지막으로 선택했던 항목의 체크박스 상태로 일괄 동기화
                        const baseChecked = checkboxes[lastClickedIndex].checked;

                        for (let k = start; k <= end; k++) {
                            checkboxes[k].checked = baseChecked;
                            itemsList[k].classList.toggle("selected", baseChecked);
                        }
                    } else {
                        chk.checked = !chk.checked;
                        div.classList.toggle("selected", chk.checked);
                        lastClickedIndex = index;
                    }

                    updateSelectedVersesMemory();
                };

                // 실시간 미리보기 마우스 오버/아웃 인터랙션
                div.onmouseenter = () => showBibleLivePreview(item);
                div.onmouseleave = () => hideBibleLivePreview();

                container.appendChild(div);
            });
        }

        function updateSelectedVersesMemory() {
            selectedBibleVerses = [];
            const items = document.querySelectorAll(".bible-result-item");
            items.forEach(div => {
                const chk = div.querySelector(".bible-item-checkbox");
                if (chk && chk.checked) {
                    selectedBibleVerses.push(JSON.parse(div.dataset.verseData));
                }
            });

            // 전체 선택 체크박스 상태 갱신
            const allCheckboxes = document.querySelectorAll(".bible-item-checkbox");
            const allChecked = allCheckboxes.length > 0 && Array.from(allCheckboxes).every(c => c.checked);
            document.getElementById("chk-select-all-bible").checked = allChecked;

            syncViewerFromLeftPanel();
            updateBibleExpectedSlides();
        }

        function toggleSelectAllBible() {
            const state = document.getElementById("chk-select-all-bible").checked;
            const items = document.querySelectorAll(".bible-result-item");
            items.forEach(div => {
                const chk = div.querySelector(".bible-item-checkbox");
                if (chk) {
                    chk.checked = state;
                    div.classList.toggle("selected", state);
                }
            });
            updateSelectedVersesMemory();
        }

        function updateBibleExpectedSlides() {
            const count = selectedBibleVerses.length;
            const mode = document.getElementById("select-bible-split-mode").value;
            let expected = 0;

            if (count > 0) {
                if (mode === "1") {
                    expected = count;
                } else if (mode === "2") {
                    expected = Math.ceil(count / 2);
                } else if (mode === "all") {
                    expected = 1;
                } else if (mode === "auto") {
                    // 80자 기준 분할 예측
                    let tempSlides = 0;
                    selectedBibleVerses.forEach(v => {
                        tempSlides += Math.ceil(v.content.length / 80);
                    });
                    expected = tempSlides;
                }
            }

            document.getElementById("val-selected-count").textContent = count;
            document.getElementById("val-expected-slides").textContent = expected;

            const btn = document.getElementById("btn-add-bible-slides");
            if (count > 0) {
                btn.disabled = false;
                btn.style.cursor = "pointer";
                btn.style.opacity = "1";
            } else {
                btn.disabled = true;
                btn.style.cursor = "not-allowed";
                btn.style.opacity = "0.5";
            }
        }

        // 방송용 약칭 치환 함수
        function convertToShortBookName(fullName) {
            const nameMap = {
                "창세기": "창", "출애굽기": "출", "레위기": "레", "민수기": "민", "신명기": "신",
                "여호수아": "수", "사사기": "사", "룻기": "룻", "사무엘상": "삼상", "사무엘하": "삼하",
                "열왕기상": "왕상", "열왕기하": "왕하", "역대상": "대상", "역대하": "대하", "에스라": "스",
                "느헤미야": "느", "에스더": "에", "욥기": "욥", "시편": "시", "잠언": "잠",
                "전도서": "전", "아가": "아", "이사야": "사", "예레미야": "렘", "예레미야애가": "애",
                "에스겔": "겔", "다니엘": "단", "호세아": "호", "요엘": "욜", "아모스": "암",
                "오바댜": "옵", "요나": "욘", "미가": "미", "나훔": "나", "하박국": "합",
                "스바냐": "습", "학개": "학", "스가랴": "슥", "말라기": "말", "마태복음": "마",
                "마가복음": "막", "누가복음": "눅", "요한복음": "요", "사도행전": "행", "로마서": "롬",
                "고린도전서": "고전", "고린도후서": "고후", "갈라디아서": "갈", "에베소서": "엡", "빌립보서": "빌",
                "골로새서": "골", "데살로니가전서": "살전", "데살로니가후서": "살후", "디모데전서": "딤전", "디모데후서": "딤후",
                "디도서": "딛", "빌레몬서": "몬", "히브리서": "히", "야고보서": "약", "베드로전서": "벧전",
                "베드로후서": "벧후", "요한1서": "요일", "요한2서": "요이", "요한3서": "요삼", "유다서": "유",
                "요한계시록": "계"
            };
            return nameMap[fullName] || fullName;
        }

        // 실시간 미리보기 팝업 노출
        let previewEl = null;
        function showBibleLivePreview(item) {
            if (previewEl) hideBibleLivePreview();

            // 성경 메인 표 뷰어가 활성화(display !== 'none') 상태이면 미니 미리보기 팝업 노출을 억제함
            const viewerOverlay = document.getElementById("bible-main-viewer-overlay");
            if (viewerOverlay && window.getComputedStyle(viewerOverlay).display !== "none") {
                return;
            }

            const workspace = document.querySelector(".workspace");
            if (!workspace) return;

            previewEl = document.createElement("div");
            previewEl.className = "bible-preview-overlay";

            const shortBook = convertToShortBookName(item.book_name);
            previewEl.innerHTML = `
                <div class="bible-preview-header">[송출 미리보기] ${shortBook} ${item.chapter}:${item.verse}</div>
                <div class="bible-preview-content">${item.content}</div>
            `;
            workspace.appendChild(previewEl);
        }

        function hideBibleLivePreview() {
            if (previewEl) {
                previewEl.remove();
                previewEl = null;
            }
        }

        // 슬라이드 벌크 추가 및 웹소켓 발행 (삽입 위치 지정 모달 팝업 가동)
        function addBibleSlidesToProject() {
            if (selectedBibleVerses.length === 0) return;

            const mode = document.getElementById("select-bible-split-mode").value;
            tempBibleSlidesToAdd = [];

            if (mode === "1") {
                // 1절씩 개별 추가
                selectedBibleVerses.forEach(v => {
                    const shortBook = convertToShortBookName(v.book_name);
                    const headerText = `${shortBook} ${v.chapter}:${v.verse}`;
                    tempBibleSlidesToAdd.push(createBibleSlideObject(headerText, v.content));
                });
            } else if (mode === "2") {
                // 2절씩 묶어서 추가
                for (let i = 0; i < selectedBibleVerses.length; i += 2) {
                    const v1 = selectedBibleVerses[i];
                    const v2 = selectedBibleVerses[i + 1];
                    const shortBook = convertToShortBookName(v1.book_name);

                    let headerText = `${shortBook} ${v1.chapter}:${v1.verse}`;
                    let contentText = v1.content;

                    if (v2) {
                        headerText = `${shortBook} ${v1.chapter}:${v1.verse}-${v2.verse}`;
                        contentText = `${v1.content}\n${v2.content}`;
                    }
                    tempBibleSlidesToAdd.push(createBibleSlideObject(headerText, contentText));
                }
            } else if (mode === "all") {
                // 전체 합치기
                const v1 = selectedBibleVerses[0];
                const vend = selectedBibleVerses[selectedBibleVerses.length - 1];
                const shortBook = convertToShortBookName(v1.book_name);

                let headerText = `${shortBook} ${v1.chapter}:${v1.verse}`;
                if (selectedBibleVerses.length > 1) {
                    headerText = `${shortBook} ${v1.chapter}:${v1.verse}-${vend.verse}`;
                }

                const contentText = selectedBibleVerses.map(v => v.content).join("\n");
                tempBibleSlidesToAdd.push(createBibleSlideObject(headerText, contentText));
            } else if (mode === "auto") {
                // 글자 수 기준 자동 분할 (80자)
                selectedBibleVerses.forEach(v => {
                    const shortBook = convertToShortBookName(v.book_name);
                    const headerText = `${shortBook} ${v.chapter}:${v.verse}`;

                    // 글자 분할
                    const chunks = splitTextByLength(v.content, 80);
                    chunks.forEach((chunkText, idx) => {
                        const pageSuffix = chunks.length > 1 ? ` (${idx + 1})` : "";
                        tempBibleSlidesToAdd.push(createBibleSlideObject(headerText + pageSuffix, chunkText));
                    });
                });
            }

            if (tempBibleSlidesToAdd.length > 0) {
                // 모달 띄우고 격자 목록 그리기
                targetInsertAfterSlideId = null;
                renderBibleModalSlideGrid();
                document.getElementById("bible-insert-modal").style.display = "flex";
            }
        }

        // 모달 내 슬라이드 리스트 4*X 격자 렌더링
        function renderBibleModalSlideGrid() {
            const grid = document.getElementById("bible-modal-slide-grid");
            if (!grid || !projectData || !projectData.slides) return;

            grid.innerHTML = "";

            projectData.slides.forEach((slide, index) => {
                const div = document.createElement("div");
                div.className = "bible-modal-grid-item";
                div.dataset.slideId = slide.id;

                if (slide.thumbnail) {
                    const img = document.createElement("img");
                    img.src = slide.thumbnail;
                    div.appendChild(img);
                } else {
                    const placeholder = document.createElement("div");
                    placeholder.style.margin = "auto";
                    placeholder.style.color = "var(--text-muted)";
                    placeholder.style.fontSize = "0.75rem";
                    placeholder.textContent = `슬라이드 ${index + 1}`;
                    div.appendChild(placeholder);
                }

                const title = document.createElement("div");
                title.className = "bible-modal-grid-item-title";
                title.textContent = `${index + 1}. ${slide.name || '이름 없음'}`;
                div.appendChild(title);

                div.onclick = () => {
                    const prevSel = grid.querySelector(".bible-modal-grid-item.selected");
                    if (prevSel) {
                        prevSel.classList.remove("selected");
                    }

                    if (targetInsertAfterSlideId === slide.id) {
                        // 동일 슬라이드 한 번 더 클릭 시 선택 해제 (맨 뒤 추가용)
                        targetInsertAfterSlideId = null;
                    } else {
                        div.classList.add("selected");
                        targetInsertAfterSlideId = slide.id;
                    }
                };

                grid.appendChild(div);
            });
        }

        // 모달 최종 확인 처리 (성경 및 찬양 공용)
        function confirmAddBibleSlides() {
            let slidesToSend = [];
            if (tempBibleSlidesToAdd.length > 0) {
                slidesToSend = tempBibleSlidesToAdd;
            } else if (tempPraiseSlidesToAdd.length > 0) {
                slidesToSend = tempPraiseSlidesToAdd;
            }

            if (slidesToSend.length === 0) return;

            // 백엔드로 추가 명령 전송 (삽입 기준 아이디 지정)
            ws.send(JSON.stringify({
                type: "ADD_SLIDES_BULK",
                slides: slidesToSend,
                insertAfterId: targetInsertAfterSlideId
            }));

            // 결과 초기화 피드백
            if (tempBibleSlidesToAdd.length > 0) {
                const container = document.getElementById("bible-results-list");
                if (container) {
                    container.innerHTML = `<div style="color: #10b981; font-size: 0.78rem; text-align: center; margin: auto; padding: 20px 0;">🎉 성공적으로 슬라이드가 추가되었습니다.</div>`;
                }
                selectedBibleVerses = [];
                updateBibleExpectedSlides();
            } else if (tempPraiseSlidesToAdd.length > 0) {
                // 선택 초기화 및 세부 제어창 닫기
                selectedPraiseSongs = [];
                updatePraiseSelectionUI();
                const selectionControl = document.getElementById("praise-selection-control");
                if (selectionControl) {
                    selectionControl.style.display = "none";
                }
                // 검색창 비우기 및 전체 리스트 새로고침
                const searchInput = document.getElementById("input-praise-search");
                if (searchInput) {
                    searchInput.value = "";
                    fetchPraiseSongs("");
                }
                alert("🎉 찬양 슬라이드가 성공적으로 추가되었습니다.");
            }

            // 모달 닫기 및 임시 변수 해제
            document.getElementById("bible-insert-modal").style.display = "none";
            tempBibleSlidesToAdd = [];
            tempPraiseSlidesToAdd = [];
            targetInsertAfterSlideId = null;
        }

        // 글자수 기준 텍스트 분할 알고리즘
        function splitTextByLength(text, maxLen) {
            if (text.length <= maxLen) return [text];

            const words = text.split(" ");
            const chunks = [];
            let current = "";

            words.forEach(word => {
                if ((current + " " + word).trim().length > maxLen) {
                    if (current) chunks.push(current.trim());
                    current = word;
                } else {
                    current = (current + " " + word).trim();
                }
            });
            if (current) chunks.push(current.trim());

            return chunks;
        }

        // 슬라이드 데이터 객체 빌더
        function createBibleSlideObject(header, content) {
            const slideId = "slide_bible_" + Math.random().toString(36).substr(2, 8);

            return {
                id: slideId,
                name: `성경: ${header}`,
                elements: [
                    // 검정 사각형 배경 요소 추가 (전체 화면 꽉 참)
                    {
                        id: "elem_bible_bg_" + Math.random().toString(36).substr(2, 9),
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
                    },
                    {
                        id: "elem_bible_h_" + Math.random().toString(36).substr(2, 9),
                        type: "text",
                        content: header,
                        x: 7.2,
                        y: 14.8,
                        width: 85.0,
                        height: 5.0,
                        style: {
                            fontSize: "2.2vw",
                            fontColor: "#ffffff",
                            fontFamily: "Inter",
                            fontWeight: "600",
                            textAlign: "left"
                        }
                    },
                    {
                        id: "elem_bible_c_" + Math.random().toString(36).substr(2, 9),
                        type: "text",
                        content: content,
                        x: 7.2,
                        y: 22.5,
                        width: 85.6,
                        height: 60.0,
                        style: {
                            fontSize: "3.8vw",
                            fontColor: "#ffffff",
                            fontFamily: "Inter",
                            fontWeight: "700",
                            textAlign: "left"
                        }
                    }
                ]
            };
        }

        function deleteSlides(slideIds) {
            if (!projectData || !projectData.slides) return;

            // 1. 서버로 삭제 전송
            ws.send(JSON.stringify({ type: "DELETE_SLIDES", slideIds: slideIds }));

            // 2. 로컬 slides 배열 갱신
            projectData.slides = projectData.slides.filter(s => !slideIds.includes(s.id));

            // 3. 만약 slides가 완전히 비었다면 임시 슬라이드를 하나 가상으로 얹어줍니다.
            if (projectData.slides.length === 0) {
                projectData.slides.push({
                    id: "slide_placeholder",
                    name: "새 슬라이드 1",
                    elements: []
                });
            }

            // 4. 활성 슬라이드가 삭제 대상에 포함되어 있었다면 다른 슬라이드로 포커스 이동
            if (slideIds.includes(activeSlideId)) {
                const nextActiveId = projectData.slides[0].id;
                selectedSlideIds = [nextActiveId];
                selectSlideForEdit(nextActiveId);
            } else {
                selectedSlideIds = selectedSlideIds.filter(id => !slideIds.includes(id));
                if (selectedSlideIds.length === 0 && activeSlideId) {
                    selectedSlideIds = [activeSlideId];
                }
            }

            renderSlides();
        }
