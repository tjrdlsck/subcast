        // ==========================================================================
        // Bible Search & Integration Feature Logic
        // ==========================================================================
        let selectedBibleVerses = [];
        let bibleBooksList = [];
        let lastFilteredBooks = [];
        let tempBibleSlidesToAdd = [];
        let targetInsertAfterSlideId = null;

        // 인메모리 검색 결과 캐시 및 선택 인덱스 Set (O(1) 접근 최적화)
        let currentBibleSearchResults = [];
        let selectedBibleVerseIndices = new Set();
        let isBibleGlobalEventsBound = false;

        // HTML 문자열 이스케이프 유틸리티 (XSS 방어 및 마크업 파싱 깨짐 방지)
        function escapeHtml(str) {
            if (str === null || str === undefined) return "";
            return String(str)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        function initBibleFeature() {
            // 성경 책 목록 가져오기
            fetchBibleBooks();

            // 성경 번역본 선택 변경 이벤트 바인딩 (이전 검색 결과 및 선택 상태 초기화)
            const selectVer = document.getElementById("select-bible-version");
            if (selectVer) {
                selectVer.addEventListener("change", () => {
                    selectedBibleVerses = [];
                    selectedBibleVerseIndices.clear();
                    currentBibleSearchResults = [];
                    const container = document.getElementById("bible-results-list");
                    if (container) {
                        container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.78rem; text-align: center; margin: auto; padding: 20px 0;">성경 장/절 혹은 키워드를 검색해 주세요.</div>`;
                    }
                    const countLabel = document.getElementById("lbl-result-count");
                    if (countLabel) countLabel.textContent = "검색 결과 (0건)";
                    const chkAll = document.getElementById("chk-select-all-bible");
                    if (chkAll) chkAll.checked = false;

                    hideBibleMainViewer();
                    updateBibleExpectedSlides();
                    fetchBibleBooks();
                });
            }

            // 성경 모달 취소 및 닫기 바인딩
            const closeBibleModal = () => {
                const modal = document.getElementById("bible-insert-modal");
                if (modal) modal.style.display = "none";
                tempBibleSlidesToAdd = [];
                targetInsertAfterSlideId = null;
            };

            const closeBtn = document.getElementById("btn-bible-modal-close");
            const cancelBtn = document.getElementById("btn-bible-modal-cancel");
            const confirmBtn = document.getElementById("btn-bible-modal-confirm");
            if (closeBtn) closeBtn.onclick = closeBibleModal;
            if (cancelBtn) cancelBtn.onclick = closeBibleModal;
            if (confirmBtn) confirmBtn.onclick = confirmAddBibleSlides;

            // 검색 모드 전환 핸들러
            const btnModeCoord = document.getElementById("btn-mode-coord");
            const btnModeKw = document.getElementById("btn-mode-keyword");
            if (btnModeCoord) btnModeCoord.onclick = () => switchBibleSearchMode("coord");
            if (btnModeKw) btnModeKw.onclick = () => switchBibleSearchMode("keyword");

            // 장/절 조회 버튼
            const btnFetch = document.getElementById("btn-bible-fetch");
            if (btnFetch) btnFetch.onclick = fetchBibleCoordinates;

            // 키워드 검색 버튼 및 엔터 키 바인딩
            const btnSearch = document.getElementById("btn-bible-search");
            const inputKw = document.getElementById("input-bible-keyword");
            if (btnSearch) btnSearch.onclick = searchBibleKeywords;
            if (inputKw) {
                inputKw.onkeydown = (e) => {
                    if (e.key === "Enter") searchBibleKeywords();
                };
            }

            // 책 선택 변경 시 최대 장 수 조절
            const selectBook = document.getElementById("select-bible-book");
            if (selectBook) selectBook.onchange = onBibleBookChange;

            // 도서 검색 필터 및 팝업 제어 리스너 연동
            const filterInput = document.getElementById("input-bible-book-filter");
            if (filterInput) {
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
                            const sel = document.getElementById("select-bible-book");
                            if (sel) {
                                sel.value = book.book_code;
                                onBibleBookChange();
                            }
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
            }

            // 전역 이벤트 리스너 중복 바인딩 방지 (바깥 영역 클릭 시 자동완성 팝업 닫기)
            if (!isBibleGlobalEventsBound) {
                document.addEventListener("mousedown", (e) => {
                    const wrapper = document.getElementById("bible-book-search-wrapper");
                    const popup = document.getElementById("bible-book-dropdown-popup");
                    if (wrapper && popup && !wrapper.contains(e.target)) {
                        popup.style.display = "none";
                    }
                });
                isBibleGlobalEventsBound = true;
            }

            // 전체 선택 체크박스
            const chkAll = document.getElementById("chk-select-all-bible");
            if (chkAll) chkAll.onchange = toggleSelectAllBible;

            // 분할 모드 변경 및 슬라이드 추가 버튼 바인딩
            const selectSplit = document.getElementById("select-bible-split-mode");
            const btnAddSlides = document.getElementById("btn-add-bible-slides");
            if (selectSplit) selectSplit.onchange = updateBibleExpectedSlides;
            if (btnAddSlides) btnAddSlides.onclick = addBibleSlidesToProject;

            // 성경 메인 표 뷰어 이벤트 바인딩
            initBibleMainViewerEvents();
        }

        // 영타 오타 한글 자동 변환기 (Keyboard Layout Translation)
        function engTypeToKor(eng) {
            if (!/^[a-zA-Z\s]+$/.test(eng)) {
                return eng; // 영문 알파벳만 있을 때만 오타로 취급하여 한글 변환 수행
            }

            const choMap = { 'r': 0, 'R': 1, 's': 2, 'e': 3, 'E': 4, 'f': 5, 'a': 6, 'q': 7, 'Q': 8, 't': 9, 'T': 10, 'd': 11, 'w': 12, 'W': 13, 'c': 14, 'z': 15, 'x': 16, 'v': 17, 'g': 18 };
            const jungMap = {
                'k': 0, 'o': 1, 'i': 2, 'O': 3, 'j': 4, 'p': 5, 'u': 6, 'P': 7, 'h': 8, 'y': 12, 'n': 13, 'b': 17, 'm': 18, 'l': 20,
                // CapsLock 활성화 시 대문자 모음 정규화 매핑
                'K': 0, 'I': 2, 'J': 4, 'U': 6, 'H': 8, 'Y': 12, 'N': 13, 'B': 17, 'M': 18, 'L': 20
            };

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
            if (!selectBook || !selectBook.value) {
                alert("성경 권을 선택해 주세요.");
                return;
            }
            const bookCode = selectBook.value;
            const chapterInput = document.getElementById("input-bible-chapter");
            const chapter = chapterInput ? parseInt(chapterInput.value, 10) : 1;
            const startVerseVal = document.getElementById("input-bible-start-verse")?.value;
            const endVerseVal = document.getElementById("input-bible-end-verse")?.value;
            const version = getSelectedBibleVersion();

            if (!chapter || chapter < 1) {
                alert("올바른 장 번호를 입력하세요.");
                return;
            }

            const startVerse = startVerseVal ? parseInt(startVerseVal, 10) : 1;
            const endVerse = endVerseVal ? parseInt(endVerseVal, 10) : 999;

            if (startVerse > endVerse) {
                alert("시작 절은 끝 절보다 작거나 같아야 합니다.");
                return;
            }

            setBibleLoadingState(true, "btn-bible-fetch");
            try {
                const response = await fetch(`/api/bible/read?book_code=${encodeURIComponent(bookCode)}&chapter=${chapter}&start_verse=${startVerse}&end_verse=${endVerse}&version=${encodeURIComponent(version)}`);
                if (!response.ok) throw new Error("성경 구절 로드에 실패했습니다.");
                const data = await response.json();

                renderBibleResults(data.verses.map(v => ({
                    book_name: data.book_name,
                    book_code: data.book_code,
                    chapter: data.chapter,
                    verse: v.verse,
                    content: v.content
                })), "coord");
            } catch (err) {
                alert("오류 발생: " + err.message);
            } finally {
                setBibleLoadingState(false, "btn-bible-fetch");
            }
        }

        async function searchBibleKeywords() {
            const keywordInput = document.getElementById("input-bible-keyword");
            const query = keywordInput ? keywordInput.value.trim() : "";
            const version = getSelectedBibleVersion();
            if (query.length < 2) {
                alert("검색어는 공백 제외 2글자 이상 입력해 주세요.");
                return;
            }

            setBibleLoadingState(true, "btn-bible-search");
            try {
                const response = await fetch(`/api/bible/search?query=${encodeURIComponent(query)}&version=${encodeURIComponent(version)}`);
                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.detail || "검색 실패");
                }
                const data = await response.json();
                renderBibleResults(data.results || [], "keyword");
            } catch (err) {
                alert("오류 발생: " + err.message);
            } finally {
                setBibleLoadingState(false, "btn-bible-search");
            }
        }

        function setBibleLoadingState(isLoading, buttonId) {
            const btn = document.getElementById(buttonId);
            if (!btn) return;
            if (isLoading) {
                btn.disabled = true;
                if (!btn.dataset.originalHtml) {
                    btn.dataset.originalHtml = btn.innerHTML;
                }
                btn.innerHTML = `<span class="btn-loading-spinner"></span> <span>조회 중...</span>`;
            } else {
                btn.disabled = false;
                if (btn.dataset.originalHtml) {
                    btn.innerHTML = btn.dataset.originalHtml;
                    delete btn.dataset.originalHtml;
                }
            }
        }

        // 성경 메인 표 뷰어 (중앙 슬라이드 영역 오버레이) 상태 제어
        let bibleViewerFontSize = 16; // 기본 글자 크기 (px)
        let isBibleViewerWheelBound = false;

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

            if (viewerOverlay && !isBibleViewerWheelBound) {
                // Ctrl + 마우스 휠 글자 크기 조절 (중복 리스너 등록 방지)
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
                isBibleViewerWheelBound = true;
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
                        if (selectedBibleVerseIndices.has(idx)) {
                            selectedBibleVerseIndices.delete(idx);
                        } else {
                            selectedBibleVerseIndices.add(idx);
                        }
                        bibleViewerLastClickedIndex = idx;
                        updateSelectedVersesMemory();
                    } else if (e.shiftKey && bibleViewerLastClickedIndex !== -1) {
                        const start = Math.min(bibleViewerLastClickedIndex, idx);
                        const end = Math.max(bibleViewerLastClickedIndex, idx);
                        for (let k = start; k <= end; k++) {
                            selectedBibleVerseIndices.add(k);
                        }
                        updateSelectedVersesMemory();
                    }
                };

                tr.onmouseenter = (e) => {
                    if (isBibleViewerMouseDown && bibleViewerDragStartIdx !== -1) {
                        bibleViewerIsDragging = true;
                        const start = Math.min(bibleViewerDragStartIdx, idx);
                        const end = Math.max(bibleViewerDragStartIdx, idx);

                        if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                            selectedBibleVerseIndices.clear();
                        }
                        for (let k = start; k <= end; k++) {
                            selectedBibleVerseIndices.add(k);
                        }
                        updateSelectedVersesMemory();
                    }
                };

                tr.onclick = (e) => {
                    if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !bibleViewerIsDragging) {
                        const isCurrentlyOnlySelected = selectedBibleVerseIndices.size === 1 && selectedBibleVerseIndices.has(idx);

                        selectedBibleVerseIndices.clear();
                        if (!isCurrentlyOnlySelected) {
                            selectedBibleVerseIndices.add(idx);
                        }
                        bibleViewerLastClickedIndex = idx;
                        updateSelectedVersesMemory();
                    }
                };
            });
        }

        function syncSelectionFromViewer(results) {
            updateSelectedVersesMemory();
        }

        function syncViewerFromLeftPanel() {
            const tbody = document.getElementById("tbody-bible-main-viewer");
            if (!tbody) return;

            const leftItems = document.querySelectorAll("#bible-results-list .bible-result-item");
            const rows = tbody.querySelectorAll("tr");

            rows.forEach((tr, idx) => {
                const isSelected = selectedBibleVerseIndices.has(idx);
                tr.classList.toggle("selected", isSelected);
                if (leftItems[idx]) {
                    const chk = leftItems[idx].querySelector(".bible-item-checkbox");
                    if (chk) chk.checked = isSelected;
                    leftItems[idx].classList.toggle("selected", isSelected);
                }
            });

            const count = selectedBibleVerseIndices.size;
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
                        <td class="verse-badge">${escapeHtml(verseText)}</td>
                        <td>${escapeHtml(item.content)}</td>
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

        function renderBibleResults(results, searchType = "coord") {
            const container = document.getElementById("bible-results-list");
            if (!container) return;
            container.innerHTML = "";

            currentBibleSearchResults = results || [];
            selectedBibleVerseIndices.clear();
            selectedBibleVerses = [];

            const countEl = document.getElementById("lbl-result-count");
            if (countEl) countEl.textContent = `검색 결과 (${currentBibleSearchResults.length}건)`;
            const chkAll = document.getElementById("chk-select-all-bible");
            if (chkAll) chkAll.checked = false;
            updateBibleExpectedSlides();

            if (currentBibleSearchResults.length === 0) {
                container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.78rem; text-align: center; margin: auto; padding: 20px 0;">일치하는 구절이 없습니다.</div>`;
                showBibleMainViewer([], "성경 검색 결과 없음");
                return;
            }

            let lastClickedIndex = -1;

            // 1. 좌측 목록 DOM 먼저 렌더링
            currentBibleSearchResults.forEach((item, index) => {
                const div = document.createElement("div");
                div.className = "bible-result-item";

                // 방송용 약칭 맵 적용
                const shortBook = convertToShortBookName(item.book_name);
                const headerText = `${shortBook} ${item.chapter}:${item.verse}`;

                div.innerHTML = `
                    <input type="checkbox" class="bible-item-checkbox" data-index="${index}" style="margin-top: 4px; pointer-events: none;">
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                        <span class="bible-result-item-header">${escapeHtml(headerText)}</span>
                        <span class="bible-result-item-content">${escapeHtml(item.content)}</span>
                    </div>
                `;

                // 클릭 인터랙션 (Shift 클릭 범위 다중 선택 탑재)
                div.onclick = (e) => {
                    if (e.shiftKey && lastClickedIndex !== -1) {
                        const start = Math.min(lastClickedIndex, index);
                        const end = Math.max(lastClickedIndex, index);
                        const targetState = !selectedBibleVerseIndices.has(index);

                        for (let k = start; k <= end; k++) {
                            if (targetState) {
                                selectedBibleVerseIndices.add(k);
                            } else {
                                selectedBibleVerseIndices.delete(k);
                            }
                        }
                    } else {
                        if (selectedBibleVerseIndices.has(index)) {
                            selectedBibleVerseIndices.delete(index);
                        } else {
                            selectedBibleVerseIndices.add(index);
                        }
                        lastClickedIndex = index;
                    }

                    updateSelectedVersesMemory();
                };

                // 실시간 미리보기 마우스 오버/아웃 인터랙션
                div.onmouseenter = () => showBibleLivePreview(item);
                div.onmouseleave = () => hideBibleLivePreview();

                container.appendChild(div);
            });

            // 2. 검색 타입에 맞는 정확한 헤더 타이틀 산출
            let titleText = "성경 검색 결과";
            if (searchType === "keyword") {
                const kw = document.getElementById("input-bible-keyword")?.value.trim() || "";
                titleText = kw ? `키워드 '${kw}' 검색 결과 (총 ${currentBibleSearchResults.length}구절)` : `키워드 검색 결과 (총 ${currentBibleSearchResults.length}구절)`;
            } else if (currentBibleSearchResults.length > 0) {
                titleText = `${currentBibleSearchResults[0].book_name} ${currentBibleSearchResults[0].chapter}장 (총 ${currentBibleSearchResults.length}구절)`;
            }

            // 3. 좌측 DOM 완료 후 메인 뷰어 출력 및 동기화
            showBibleMainViewer(currentBibleSearchResults, titleText);
        }

        function updateSelectedVersesMemory() {
            selectedBibleVerses = Array.from(selectedBibleVerseIndices)
                .sort((a, b) => a - b)
                .map(idx => currentBibleSearchResults[idx])
                .filter(Boolean);

            const chkAll = document.getElementById("chk-select-all-bible");
            if (chkAll) {
                chkAll.checked = currentBibleSearchResults.length > 0 && selectedBibleVerseIndices.size === currentBibleSearchResults.length;
            }

            syncViewerFromLeftPanel();
            updateBibleExpectedSlides();
        }

        function toggleSelectAllBible() {
            const chkAll = document.getElementById("chk-select-all-bible");
            const state = chkAll ? chkAll.checked : false;

            selectedBibleVerseIndices.clear();
            if (state && currentBibleSearchResults.length > 0) {
                currentBibleSearchResults.forEach((_, idx) => selectedBibleVerseIndices.add(idx));
            }
            updateSelectedVersesMemory();
        }

        function updateBibleExpectedSlides() {
            const count = selectedBibleVerses.length;
            const splitSelect = document.getElementById("select-bible-split-mode");
            const mode = splitSelect ? splitSelect.value : "1";
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
                        tempSlides += Math.ceil((v.content || "").length / 80);
                    });
                    expected = tempSlides;
                }
            }

            const selCountEl = document.getElementById("val-selected-count");
            const expSlidesEl = document.getElementById("val-expected-slides");
            if (selCountEl) selCountEl.textContent = count;
            if (expSlidesEl) expSlidesEl.textContent = expected;

            const btn = document.getElementById("btn-add-bible-slides");
            if (btn) {
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
        }

        // 방송용 약칭 치환 함수 (한글 66권 + NIV 영문 66권 완전 지원)
        function convertToShortBookName(fullName) {
            if (!fullName) return "";
            const nameMap = {
                // 한글 66권 (사사기는 '삿', 이사야는 '사'로 충돌 해소)
                "창세기": "창", "출애굽기": "출", "레위기": "레", "민수기": "민", "신명기": "신",
                "여호수아": "수", "사사기": "삿", "룻기": "룻", "사무엘상": "삼상", "사무엘하": "삼하",
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
                "요한계시록": "계",
                // 영문 성경 약칭 (NIV 등 대응)
                "Genesis": "Gen", "Exodus": "Exo", "Leviticus": "Lev", "Numbers": "Num", "Deuteronomy": "Deu",
                "Joshua": "Jos", "Judges": "Jdg", "Ruth": "Rut", "1 Samuel": "1Sa", "2 Samuel": "2Sa",
                "1 Kings": "1Ki", "2 Kings": "2Ki", "1 Chronicles": "1Ch", "2 Chronicles": "2Ch", "Ezra": "Ezr",
                "Nehemiah": "Neh", "Esther": "Est", "Job": "Job", "Psalms": "Psa", "Proverbs": "Pro",
                "Ecclesiastes": "Ecc", "Song of Songs": "Song", "Isaiah": "Isa", "Jeremiah": "Jer", "Lamentations": "Lam",
                "Ezekiel": "Eze", "Daniel": "Dan", "Hosea": "Hos", "Joel": "Joe", "Amos": "Amo",
                "Obadiah": "Oba", "Jonah": "Jon", "Micah": "Mic", "Nahum": "Nah", "Habakkuk": "Hab",
                "Zephaniah": "Zep", "Haggai": "Hag", "Zechariah": "Zec", "Malachi": "Mal", "Matthew": "Mat",
                "Mark": "Mar", "Luke": "Luk", "John": "Joh", "Acts": "Act", "Romans": "Rom",
                "1 Corinthians": "1Co", "2 Corinthians": "2Co", "Galatians": "Gal", "Ephesians": "Eph", "Philippians": "Phi",
                "Colossians": "Col", "1 Thessalonians": "1Th", "2 Thessalonians": "2Th", "1 Timothy": "1Ti", "2 Timothy": "2Ti",
                "Titus": "Tit", "Philemon": "Phm", "Hebrews": "Heb", "James": "Jas", "1 Peter": "1Pe",
                "2 Peter": "2Pe", "1 John": "1Jn", "2 John": "2Jn", "3 John": "3Jn", "Jude": "Jud",
                "Revelation": "Rev"
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
                <div class="bible-preview-header">[송출 미리보기] ${escapeHtml(shortBook)} ${item.chapter}:${item.verse}</div>
                <div class="bible-preview-content">${escapeHtml(item.content)}</div>
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

            const splitSelect = document.getElementById("select-bible-split-mode");
            const mode = splitSelect ? splitSelect.value : "1";
            tempBibleSlidesToAdd = [];

            if (mode === "1") {
                // 1절씩 개별 추가
                selectedBibleVerses.forEach(v => {
                    const shortBook = convertToShortBookName(v.book_name);
                    const headerText = `${shortBook} ${v.chapter}:${v.verse}`;
                    tempBibleSlidesToAdd.push(createBibleSlideObject(headerText, v.content));
                });
            } else if (mode === "2") {
                // 2절씩 묶어서 추가 (서로 다른 권/장 결합 시 헤더 왜곡 방지)
                for (let i = 0; i < selectedBibleVerses.length; i += 2) {
                    const v1 = selectedBibleVerses[i];
                    const v2 = selectedBibleVerses[i + 1];
                    const shortBook1 = convertToShortBookName(v1.book_name);

                    let headerText = `${shortBook1} ${v1.chapter}:${v1.verse}`;
                    let contentText = v1.content;

                    if (v2) {
                        const shortBook2 = convertToShortBookName(v2.book_name);
                        if (v1.book_name === v2.book_name && v1.chapter === v2.chapter) {
                            headerText = `${shortBook1} ${v1.chapter}:${v1.verse}-${v2.verse}`;
                        } else if (v1.book_name === v2.book_name) {
                            headerText = `${shortBook1} ${v1.chapter}:${v1.verse} ~ ${v2.chapter}:${v2.verse}`;
                        } else {
                            headerText = `${shortBook1} ${v1.chapter}:${v1.verse} ~ ${shortBook2} ${v2.chapter}:${v2.verse}`;
                        }
                        contentText = `${v1.content}\n${v2.content}`;
                    }
                    tempBibleSlidesToAdd.push(createBibleSlideObject(headerText, contentText));
                }
            } else if (mode === "all") {
                // 전체 합치기 (서로 다른 권/장 결합 시 헤더 왜곡 방지)
                const v1 = selectedBibleVerses[0];
                const vend = selectedBibleVerses[selectedBibleVerses.length - 1];
                const shortBook1 = convertToShortBookName(v1.book_name);
                const shortBookEnd = convertToShortBookName(vend.book_name);

                let headerText = `${shortBook1} ${v1.chapter}:${v1.verse}`;
                if (selectedBibleVerses.length > 1) {
                    if (v1.book_name === vend.book_name && v1.chapter === vend.chapter) {
                        headerText = `${shortBook1} ${v1.chapter}:${v1.verse}-${vend.verse}`;
                    } else if (v1.book_name === vend.book_name) {
                        headerText = `${shortBook1} ${v1.chapter}:${v1.verse} ~ ${vend.chapter}:${vend.verse}`;
                    } else {
                        headerText = `${shortBook1} ${v1.chapter}:${v1.verse} ~ ${shortBookEnd} ${vend.chapter}:${vend.verse}`;
                    }
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
                const modal = document.getElementById("bible-insert-modal");
                if (modal) modal.style.display = "flex";
            }
        }

        // 모달 내 슬라이드 리스트 4*X 격자 렌더링
        function renderBibleModalSlideGrid() {
            const grid = document.getElementById("bible-modal-slide-grid");
            if (!grid || typeof projectData === "undefined" || !projectData || !projectData.slides) return;

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
            const isBible = tempBibleSlidesToAdd.length > 0;
            const isPraise = typeof tempPraiseSlidesToAdd !== "undefined" && tempPraiseSlidesToAdd.length > 0;

            if (isBible) {
                slidesToSend = tempBibleSlidesToAdd;
            } else if (isPraise) {
                slidesToSend = tempPraiseSlidesToAdd;
            }

            if (slidesToSend.length === 0) return;

            // WebSocket 실시간 연결 상태 안전 검증
            if (typeof ws === "undefined" || !ws || ws.readyState !== WebSocket.OPEN) {
                alert("서버와 실시간 연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.");
                return;
            }

            // 백엔드로 추가 명령 전송 (삽입 기준 아이디 지정)
            ws.send(JSON.stringify({
                type: "ADD_SLIDES_BULK",
                slides: slidesToSend,
                insertAfterId: targetInsertAfterSlideId
            }));

            // 결과 초기화 피드백
            if (isBible) {
                const container = document.getElementById("bible-results-list");
                if (container) {
                    container.innerHTML = `<div style="color: #10b981; font-size: 0.78rem; text-align: center; margin: auto; padding: 20px 0;">🎉 성공적으로 슬라이드가 추가되었습니다.</div>`;
                }
                selectedBibleVerses = [];
                selectedBibleVerseIndices.clear();
                updateBibleExpectedSlides();
            } else if (isPraise) {
                // 선택 초기화 및 세부 제어창 닫기
                if (typeof selectedPraiseSongs !== "undefined") selectedPraiseSongs = [];
                if (typeof updatePraiseSelectionUI === "function") updatePraiseSelectionUI();
                const selectionControl = document.getElementById("praise-selection-control");
                if (selectionControl) {
                    selectionControl.style.display = "none";
                }
                // 검색창 비우기 및 전체 리스트 새로고침
                const searchInput = document.getElementById("input-praise-search");
                if (searchInput) {
                    searchInput.value = "";
                    if (typeof fetchPraiseSongs === "function") fetchPraiseSongs("");
                }
                if (typeof showToast === "function") {
                    showToast("🎉 찬양 슬라이드가 성공적으로 추가되었습니다.");
                }
            }

            // 모달 닫기 및 임시 변수 해제
            const modal = document.getElementById("bible-insert-modal");
            if (modal) modal.style.display = "none";
            tempBibleSlidesToAdd = [];
            if (typeof tempPraiseSlidesToAdd !== "undefined") tempPraiseSlidesToAdd = [];
            targetInsertAfterSlideId = null;
        }
