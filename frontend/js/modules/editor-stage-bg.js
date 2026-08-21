// === 현장 모니터 배경 연출 & 라이브러리 & PiP 미리보기 모듈 ===
let currentStageBg = {
    type: 'ambient',
    videoUrl: '',
    opacity: 0.8,
    blur: 0
};
let allStageBgFiles = [];
let selectedStageBgFiles = [];
let stageBgClipboardFiles = [];
let lastSelectedStageBgIndex = -1;
let _renderedStageBgFiles = [];
let pipAmbientAnimId = null;
let stageBgGridMinSize = 220;
let stageBgDebounceTimer = null;

// PiP 백그라운드 렌더링 루프 및 미디어 재생 완전 정지 (자원 해제)
window.stopPipPreview = function() {
    if (pipAmbientAnimId) {
        cancelAnimationFrame(pipAmbientAnimId);
        pipAmbientAnimId = null;
    }
    const pipVideo = document.getElementById('pip-bg-video');
    if (pipVideo) {
        pipVideo.pause();
    }
};

function updateStageBgGridColumns() {
    const gridContainer = document.getElementById('stage-bg-main-grid');
    if (gridContainer) {
        gridContainer.style.gridTemplateColumns = `repeat(auto-fill, minmax(${stageBgGridMinSize}px, 1fr))`;
    }
}

// 현장 배경 복사 / 붙여넣기 / 삭제 함수
window.copySelectedStageBgFiles = function() {
    if (!selectedStageBgFiles || selectedStageBgFiles.length === 0) return;
    stageBgClipboardFiles = JSON.parse(JSON.stringify(selectedStageBgFiles));
    if (typeof showToast === 'function') {
        showToast(`${selectedStageBgFiles.length}개의 현장 배경이 복사되었습니다.`);
    }
};

window.pasteStageBgFiles = async function() {
    if (!stageBgClipboardFiles || stageBgClipboardFiles.length === 0) return;
    try {
        const res = await fetch('/api/backgrounds/duplicate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ names: stageBgClipboardFiles.map(f => f.name) })
        });
        if (res.ok) {
            const data = await res.json();
            if (typeof showToast === 'function') {
                showToast(`${data.new_files?.length || 0}개의 현장 배경이 붙여넣기 되었습니다.`);
            }
            await loadStageBgLibrary();
        } else {
            const err = await res.json().catch(() => ({}));
            alert("붙여넣기 실패: " + (err.detail || res.statusText));
        }
    } catch (e) {
        console.error("Failed to paste stage bg files", e);
    }
};

window.deleteSelectedStageBgFilesWithConfirm = async function(confirmRequired = true) {
    if (!selectedStageBgFiles || selectedStageBgFiles.length === 0) return;

    if (confirmRequired) {
        const namesStr = selectedStageBgFiles.map(f => f.name).slice(0, 3).join(", ") + (selectedStageBgFiles.length > 3 ? ` 외 ${selectedStageBgFiles.length - 3}건` : "");
        if (!confirm(`선택한 현장 배경 (${selectedStageBgFiles.length}개: ${namesStr})을 삭제하시겠습니까?`)) {
            return;
        }
    }

    const deletedNames = selectedStageBgFiles.map(f => f.name);

    // 1. 삭제 후 자동으로 선택 및 미리보기 재생할 다음 배경 영상 결정
    let nextFileToSelect = null;
    if (_renderedStageBgFiles && _renderedStageBgFiles.length > 0) {
        const firstDelIdx = _renderedStageBgFiles.findIndex(f => deletedNames.includes(f.name));
        const remainingFiles = _renderedStageBgFiles.filter(f => !deletedNames.includes(f.name));
        if (remainingFiles.length > 0) {
            if (firstDelIdx >= 0 && firstDelIdx < remainingFiles.length) {
                nextFileToSelect = remainingFiles[firstDelIdx];
            } else {
                nextFileToSelect = remainingFiles[remainingFiles.length - 1];
            }
        }
    }
    // 검색 필터 등으로 렌더링 목록에 없더라도 전체 목록에 남은 비디오가 있으면 폴백 선택
    if (!nextFileToSelect) {
        const remainingInAll = allStageBgFiles.filter(f => !deletedNames.includes(f.name));
        if (remainingInAll.length > 0) {
            nextFileToSelect = remainingInAll[0];
        }
    }

    // 2. 프론트엔드 메모리 목록에서 삭제 대상 즉시 제거 (Optimistic UI Update)
    allStageBgFiles = allStageBgFiles.filter(f => !deletedNames.includes(f.name));
    _renderedStageBgFiles = _renderedStageBgFiles.filter(f => !deletedNames.includes(f.name));
    lastSelectedStageBgIndex = -1; // 삭제 후 인덱스 오염 방지를 위해 초기화

    // 3. 삭제 대상 중 현재 적용 중인 비디오 배경이 있는 경우 미리보기 릴리즈
    const isDeletingCurrent = currentStageBg.type === 'video' && deletedNames.some(name => currentStageBg.videoUrl === `/static/backgrounds/${name}`);
    const pipVideo = document.getElementById('pip-bg-video');
    if (isDeletingCurrent || pipVideo) {
        if (pipVideo) {
            pipVideo.pause();
            pipVideo.removeAttribute('src');
            pipVideo.load();
        }
    }

    // 4. 즉시 다음 배경 영상으로 화면 선택 및 미리보기 전환 (남은 영상이 없으면 Ambient)
    if (nextFileToSelect) {
        selectedStageBgFiles = [nextFileToSelect];
        selectStageBg({ type: 'video', videoUrl: nextFileToSelect.url, title: nextFileToSelect.name }, true);
    } else {
        selectedStageBgFiles = [];
        selectStageBg({ type: 'ambient' }, true);
    }

    // 5. UI 카드 그리드 즉시 갱신 및 완료 토스트 출력 (사용자 화면에서 즉각 삭제 처리)
    filterAndRenderStageBgLibrary();
    if (typeof showToast === 'function') {
        showToast(`${deletedNames.length}개의 현장 배경이 삭제되었습니다.`);
    }

    // 6. 백엔드 비동기 삭제 API 호출 (백엔드가 메타 제거 및 백그라운드 파일 정리 수행)
    try {
        await fetch('/api/backgrounds/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ names: deletedNames })
        });
    } catch (e) {
        console.error("Failed to call background delete API", e);
    }
};

window.handleStageBgCardClick = function(e, index) {
    const fileObj = _renderedStageBgFiles[index];
    if (!fileObj) return;

    if (e.ctrlKey || e.metaKey) {
        const existsIdx = selectedStageBgFiles.findIndex(f => f.name === fileObj.name);
        if (existsIdx !== -1) {
            selectedStageBgFiles.splice(existsIdx, 1);
        } else {
            selectedStageBgFiles.push(fileObj);
        }
        lastSelectedStageBgIndex = index;
    } else if (e.shiftKey && lastSelectedStageBgIndex >= 0) {
        const start = Math.min(lastSelectedStageBgIndex, index);
        const end = Math.max(lastSelectedStageBgIndex, index);
        for (let i = start; i <= end; i++) {
            const targetFile = _renderedStageBgFiles[i];
            if (targetFile && !selectedStageBgFiles.some(f => f.name === targetFile.name)) {
                selectedStageBgFiles.push(targetFile);
            }
        }
    } else {
        selectedStageBgFiles = [fileObj];
        lastSelectedStageBgIndex = index;
        selectStageBg({type: 'video', videoUrl: fileObj.url, title: fileObj.name}, false);
    }

    filterAndRenderStageBgLibrary();
};

window.handleStageBgCardContextMenu = function(e, index) {
    e.preventDefault();
    e.stopPropagation();
    const fileObj = _renderedStageBgFiles[index];
    if (fileObj) {
        if (!selectedStageBgFiles.some(f => f.name === fileObj.name)) {
            selectedStageBgFiles = [fileObj];
            lastSelectedStageBgIndex = index;
            filterAndRenderStageBgLibrary();
        }
    }
    showStageBgContextMenu(e.clientX, e.clientY);
};

window.toggleSelectStageBgCard = function(e, index) {
    const fileObj = _renderedStageBgFiles[index];
    if (!fileObj) return;
    const existsIdx = selectedStageBgFiles.findIndex(f => f.name === fileObj.name);
    if (existsIdx !== -1) {
        selectedStageBgFiles.splice(existsIdx, 1);
    } else {
        selectedStageBgFiles.push(fileObj);
    }
    lastSelectedStageBgIndex = index;
    filterAndRenderStageBgLibrary();
};

window.updateStageBgBulkBar = function() {
    const bulkBar = document.getElementById('stage-bg-bulk-bar');
    const bulkCount = document.getElementById('stage-bg-bulk-count');
    if (!bulkBar || !bulkCount) return;

    if (selectedStageBgFiles && selectedStageBgFiles.length > 0) {
        bulkBar.style.display = 'flex';
        bulkCount.textContent = `☑ ${selectedStageBgFiles.length}개 배경 선택됨`;
    } else {
        bulkBar.style.display = 'none';
    }
};

function saveStageBgLibraryData() {
    if (projectData && projectData.settings) {
        projectData.settings.stageBgLibrary = allStageBgFiles;
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: "UPDATE_STAGE_BG_LIBRARY",
            library: allStageBgFiles
        }));
    }
    if (typeof triggerAutoSave === 'function') {
        triggerAutoSave();
    }
}

let _stageBgMoodTargets = [];
window.openStageBgMoodModal = function(targetFiles) {
    _stageBgMoodTargets = targetFiles || selectedStageBgFiles || [];
    if (_stageBgMoodTargets.length === 0) return;

    const modal = document.getElementById('stage-bg-mood-modal');
    const title = document.getElementById('modal-stage-bg-mood-title');
    const desc = document.getElementById('modal-stage-bg-mood-desc');
    const chipsContainer = document.getElementById('stage-bg-mood-chips-container');
    const bulkModeContainer = document.getElementById('stage-bg-bulk-mode-container');

    if (title) {
        title.textContent = _stageBgMoodTargets.length === 1 
            ? `🏷️ 배경 [${_stageBgMoodTargets[0].name}] 분위기 태그 설정` 
            : `🏷️ 선택한 ${_stageBgMoodTargets.length}개 배경 분위기 태그 일괄 설정`;
    }
    if (desc) {
        desc.textContent = _stageBgMoodTargets.length === 1
            ? "영상에 부여할 분위기 태그를 선택하거나 신규 추가해 주세요."
            : `선택된 ${_stageBgMoodTargets.length}개의 배경 영상에 일괄로 적용할 태그를 선택해 주세요.`;
    }
    if (bulkModeContainer) {
        bulkModeContainer.style.display = _stageBgMoodTargets.length > 1 ? 'flex' : 'none';
    }

    const standardPresets = ["경배/찬양", "잔잔/묵상", "기도/회개", "결단/헌금", "웅장/선포", "절기/특별", "기본/일반"];
    let currentSelectedMood = "경배/찬양";
    if (_stageBgMoodTargets.length > 0) {
        const firstBg = _stageBgMoodTargets[0];
        currentSelectedMood = (firstBg.moods && firstBg.moods[0]) || firstBg.mood || "경배/찬양";
    }

    function renderChips() {
        if (!chipsContainer) return;
        let html = '';
        standardPresets.forEach(m => {
            const isActive = m === currentSelectedMood;
            const style = isActive 
                ? 'padding: 5px 12px; font-size: 0.76rem; border-radius: 14px; border: 1px solid var(--primary); background: var(--primary); color: #fff; cursor: pointer; font-weight: 600;'
                : 'padding: 5px 12px; font-size: 0.76rem; border-radius: 14px; border: 1px solid var(--panel-border); background: rgba(255,255,255,0.05); color: #cbd5e1; cursor: pointer;';
            html += `<button type="button" class="stage-bg-mood-chip ${isActive ? 'active' : ''}" data-mood="${m}" style="${style}">#${m}</button>`;
        });
        chipsContainer.innerHTML = html;

        chipsContainer.querySelectorAll('.stage-bg-mood-chip').forEach(btn => {
            btn.onclick = () => {
                currentSelectedMood = btn.getAttribute('data-mood');
                renderChips();
            };
        });
    }

    renderChips();

    if (modal) modal.style.display = 'flex';
};

function initStageBgMoodModalEvents() {
    const modal = document.getElementById('stage-bg-mood-modal');
    const closeBtn = document.getElementById('btn-stage-bg-mood-modal-close');
    const cancelBtn = document.getElementById('btn-stage-bg-mood-modal-cancel');
    const saveBtn = document.getElementById('btn-stage-bg-mood-modal-save');

    const closeModal = () => { if (modal) modal.style.display = 'none'; };
    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;

    if (saveBtn) {
        saveBtn.onclick = () => {
            const activeChip = document.querySelector('.stage-bg-mood-chip.active');
            const selectedMood = activeChip ? activeChip.getAttribute('data-mood') : "기본/일반";

            _stageBgMoodTargets.forEach(targetBg => {
                targetBg.mood = selectedMood;
                targetBg.moods = [selectedMood];
                const matchInAll = allStageBgFiles.find(f => f.name === targetBg.name);
                if (matchInAll) {
                    matchInAll.mood = selectedMood;
                    matchInAll.moods = [selectedMood];
                }
            });

            saveStageBgLibraryData();
            filterAndRenderStageBgLibrary();
            closeModal();
        };
    }

    const btnBulkMoods = document.getElementById('btn-stage-bg-bulk-moods');
    if (btnBulkMoods) {
        btnBulkMoods.onclick = () => {
            openStageBgMoodModal(selectedStageBgFiles);
        };
    }

    const btnBulkDefault = document.getElementById('btn-stage-bg-bulk-default');
    if (btnBulkDefault) {
        btnBulkDefault.onclick = () => {
            if (!selectedStageBgFiles || selectedStageBgFiles.length === 0) return;
            const isDef = confirm(`선택한 ${selectedStageBgFiles.length}개 배경을 기본(Default) 배경으로 지정하시겠습니까?`);
            selectedStageBgFiles.forEach(f => {
                f.isDefault = isDef;
                const matchInAll = allStageBgFiles.find(item => item.name === f.name);
                if (matchInAll) {
                    matchInAll.isDefault = isDef;
                }
            });
            saveStageBgLibraryData();
            filterAndRenderStageBgLibrary();
        };
    }

    const btnBulkDelete = document.getElementById('btn-stage-bg-bulk-delete');
    if (btnBulkDelete) {
        btnBulkDelete.onclick = () => {
            if (typeof deleteSelectedStageBgFilesWithConfirm === 'function') {
                deleteSelectedStageBgFilesWithConfirm();
            }
        };
    }

    const btnBulkClear = document.getElementById('btn-stage-bg-bulk-clear');
    if (btnBulkClear) {
        btnBulkClear.onclick = () => {
            selectedStageBgFiles = [];
            filterAndRenderStageBgLibrary();
        };
    }
}

// 현장 배경 메인 뷰어 열기/닫기
function showStageBgMainViewer() {
    initStageBgMoodModalEvents();
    const overlay = document.getElementById('stage-bg-main-viewer-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
    }

    const gridBody = document.getElementById('stage-bg-main-grid-body');
    if (gridBody && !gridBody.dataset.wheelBound) {
        gridBody.dataset.wheelBound = "true";
        gridBody.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                e.stopPropagation();
                const delta = e.deltaY > 0 ? -20 : 20;
                stageBgGridMinSize = Math.max(100, Math.min(420, stageBgGridMinSize + delta));
                updateStageBgGridColumns();
            }
        }, { passive: false });
    }

    updateStageBgGridColumns();
    loadStageBgLibrary(false);
    initPipPreview();
    const pipContainer = document.getElementById('pip-stage-preview-container');
    if (pipContainer) pipContainer.style.display = 'flex';
}

function hideStageBgMainViewer() {
    const overlay = document.getElementById('stage-bg-main-viewer-overlay');
    if (overlay) overlay.style.display = 'none';
    const pipContainer = document.getElementById('pip-stage-preview-container');
    if (pipContainer) pipContainer.style.display = 'none';
    if (typeof stopPipPreview === 'function') {
        stopPipPreview();
    }
}

// 백엔드 API에서 배경 라이브러리 목록 로드 (캐싱 지원)
async function loadStageBgLibrary(force = false) {
    if (!force && allStageBgFiles && allStageBgFiles.length > 0) {
        filterAndRenderStageBgLibrary();
        return;
    }
    try {
        const res = await fetch('/api/backgrounds/list');
        if (res.ok) {
            const data = await res.json();
            allStageBgFiles = data.files || [];
            filterAndRenderStageBgLibrary();
        }
    } catch (e) {
        console.error("Failed to load stage bg list", e);
    }
}

// 오른쪽 메인 칸 배경 라이브러리 그리드 & 검색 필터링 렌더링
function filterAndRenderStageBgLibrary() {
    const gridContainer = document.getElementById('stage-bg-main-grid');
    if (!gridContainer) return;

    updateStageBgGridColumns();

    const searchInput = document.getElementById('input-stage-bg-search');
    const filterSelect = document.getElementById('select-stage-bg-filter');

    const searchVal = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const filterVal = filterSelect ? filterSelect.value : 'all';

    let filesToRender = allStageBgFiles.filter(f => {
        const searchTarget = `${f.title || ''} ${f.name || ''}`.toLowerCase();
        if (searchVal && !searchTarget.includes(searchVal)) return false;
        if (filterVal === 'default') return (f.isDefault || f.is_default) === true;
        if (filterVal === 'video') return true;
        return true;
    });

    _renderedStageBgFiles = filesToRender;

    let html = '';

    filesToRender.forEach((f, idx) => {
        const isCurrent = currentStageBg.type === 'video' && currentStageBg.videoUrl === f.url;
        const isSelected = selectedStageBgFiles.some(sel => sel.name === f.name);
        const filenameWOExt = f.name.substring(0, f.name.lastIndexOf('.'));
        const isYt = filenameWOExt.length === 11 && !f.name.startsWith('upload_');
        const thumbUrl = f.thumbnailUrl || (isYt ? `https://img.youtube.com/vi/${filenameWOExt}/hqdefault.jpg` : '');
        const displayName = f.title || (f.name.startsWith('upload_') ? f.name.replace(/^upload_[a-f0-9]+_/, '') : f.name);
        const safeOldName = f.name.replace(/"/g, '&quot;');
        const safeName = displayName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const borderStyle = isSelected ? '2px solid #38bdf8' : (isCurrent ? '2px solid #0284c7' : '2px solid var(--panel-border, #3f3f46)');
        const bgStyle = isSelected ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255,255,255,0.04)';

        const moodsList = f.moods || [];
        const moodChipsHtml = moodsList.map(m => `<span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 0.65rem; padding: 2px 6px; border-radius: 10px; border: 1px solid rgba(56, 189, 248, 0.3);">#${m}</span>`).join(' ');
        const defaultBadgeHtml = (f.isDefault || f.is_default) ? `<span style="background: #eab308; color: #000; font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 4px;">⭐ 기본</span>` : '';

        html += `
            <div class="stage-bg-card-main ${isCurrent ? 'active' : ''} ${isSelected ? 'selected' : ''}" 
                onclick="handleStageBgCardClick(event, ${idx})" 
                oncontextmenu="handleStageBgCardContextMenu(event, ${idx})"
                style="background: ${bgStyle}; border: ${borderStyle}; border-radius: 8px; padding: 12px; cursor: pointer; display: flex; flex-direction: column; gap: 10px; transition: all 0.2s; position: relative;">
                <input type="checkbox" ${isSelected ? 'checked' : ''} 
                       onclick="event.stopPropagation(); toggleSelectStageBgCard(event, ${idx})" 
                       style="position: absolute; top: 10px; left: 10px; z-index: 10; width: 16px; height: 16px; cursor: pointer;">
                <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 4px; z-index: 5;">
                    ${defaultBadgeHtml}
                    ${isCurrent ? `<span style="background: #0284c7; color: #fff; font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 4px;">적용 중</span>` : ''}
                </div>
                <div style="width: 100%; aspect-ratio: 16/9; max-height: 140px; background: #0f172a; border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; position: relative;">
                    ${thumbUrl ? `<img src="${thumbUrl}" style="width: 100%; height: 100%; object-fit: cover;">` : `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: #60a5fa;"><span style="font-size: 2rem;">🎬</span><span style="font-size: 0.68rem; color: var(--text-muted);">로컬 미디어</span></div>`}
                </div>
                <div>
                    <div class="stage-bg-title" 
                         data-filename="${safeOldName}"
                         style="font-size: 0.85rem; font-weight: 600; color: #fff; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; margin-bottom: 4px; cursor: text;" 
                         title="${safeName} (두 번 클릭하여 제목 수정)" 
                         onclick="event.stopPropagation();" 
                         ondblclick="event.stopPropagation(); startInlineRenameStageBg(this)">
                        ${safeName}
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
                        ${moodChipsHtml || '<span style="color: var(--text-muted); font-size: 0.68rem;">태그 없음</span>'}
                    </div>
                </div>
            </div>
        `;
    });

    if (filesToRender.length === 0) {
        html = `
            <div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
                🔍 검색 조건에 일치하는 현장 배경이 없습니다.
            </div>
        `;
    }

    gridContainer.innerHTML = html;
    updateStageBgBulkBar();
}

// 배경 라이브러리 더블 클릭 인라인 이름 변경
window.startInlineRenameStageBg = function(containerEl, explicitOldName) {
    if (containerEl.querySelector('input')) return;
    const oldName = explicitOldName || containerEl.getAttribute('data-filename') || containerEl.textContent.trim();
    if (!oldName) return;

    // 확장자 및 순수 이름 분리 (예: test.mp4 -> base: test, ext: .mp4)
    const lastDotIdx = oldName.lastIndexOf('.');
    const ext = lastDotIdx !== -1 ? oldName.substring(lastDotIdx) : '';
    const baseOldName = lastDotIdx !== -1 ? oldName.substring(0, lastDotIdx) : oldName;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'stage-bg-name-input';
    input.value = baseOldName;
    input.style.cssText = "width: 100%; padding: 3px 6px; background: rgba(0,0,0,0.9); border: 1.5px solid #38bdf8; border-radius: 4px; color: #fff; font-size: 0.82rem; outline: none; font-weight: 600; box-shadow: 0 0 6px rgba(56, 189, 248, 0.4);";

    const stopEvents = (e) => e.stopPropagation();
    input.onmousedown = stopEvents;
    input.onclick = stopEvents;
    input.ondblclick = stopEvents;

    let isSaved = false;
    const saveRename = async () => {
        if (isSaved) return;
        isSaved = true;

        let inputVal = input.value.trim();
        if (!inputVal) {
            if (typeof showToast === 'function') showToast('변경할 제목을 입력해주세요.');
            containerEl.textContent = oldName;
            return;
        }

        // 입력값에 원래 확장자가 없으면 자동 결합
        let finalNewName = inputVal;
        if (ext && !finalNewName.toLowerCase().endsWith(ext.toLowerCase())) {
            finalNewName += ext;
        }

        if (finalNewName === oldName) {
            containerEl.textContent = oldName;
            return;
        }

        try {
            const res = await fetch('/api/backgrounds/rename', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ old_name: oldName, new_name: finalNewName })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || '제목 변경 실패');
            }

            const data = await res.json();
            if (typeof showToast === 'function') showToast('라이브러리 제목이 변경되었습니다.');

            // 만약 현재 적용 중인 비디오 배경이었다면 videoUrl 업데이트
            if (currentStageBg.type === 'video' && currentStageBg.videoUrl === `/static/backgrounds/${oldName}`) {
                currentStageBg.videoUrl = data.videoUrl;
                applyAndBroadcastStageBg();
            }

            await loadStageBgLibrary();
        } catch (err) {
            alert('제목 변경 오류: ' + err.message);
            containerEl.textContent = oldName;
        }
    };

    input.onblur = saveRename;
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            saveRename();
        } else if (e.key === 'Escape') {
            isSaved = true;
            containerEl.textContent = oldName;
        }
    };

    containerEl.innerHTML = '';
    containerEl.appendChild(input);
    input.focus();
    input.select();
};

window.selectStageBg = function(config, shouldRender = true) {
    currentStageBg.type = config.type;
    if (config.type === 'ambient') {
        selectedStageBgFiles = [];
    }
    if (config.videoUrl) currentStageBg.videoUrl = config.videoUrl;
    applyAndBroadcastStageBg();
    if (shouldRender) {
        filterAndRenderStageBgLibrary();
    }
};

function applyAndBroadcastStageBg(debounce = false) {
    const opacityInput = document.getElementById('range-stage-bg-opacity');
    const blurInput = document.getElementById('range-stage-bg-blur');

    const valOpacity = opacityInput ? opacityInput.value : 80;
    const valBlur = blurInput ? blurInput.value : 0;

    currentStageBg.opacity = parseFloat(valOpacity) / 100;
    currentStageBg.blur = parseInt(valBlur) || 0;

    if (debounce) {
        if (stageBgDebounceTimer) clearTimeout(stageBgDebounceTimer);
        stageBgDebounceTimer = setTimeout(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'SET_STAGE_BACKGROUND',
                    background: currentStageBg
                }));
            }
        }, 50);
    } else {
        if (stageBgDebounceTimer) {
            clearTimeout(stageBgDebounceTimer);
            stageBgDebounceTimer = null;
        }
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'SET_STAGE_BACKGROUND',
                background: currentStageBg
            }));
        }
    }

    updatePipBgLayer();
}

// === PiP (Picture-in-Picture) 미리보기 구현 ===
window.togglePipPreview = function() {
    const pipContainer = document.getElementById('pip-stage-preview-container');
    if (!pipContainer) return;
    if (pipContainer.style.display === 'none' || !pipContainer.style.display) {
        pipContainer.style.display = 'flex';
        initPipPreview();
    } else {
        pipContainer.style.display = 'none';
        if (typeof stopPipPreview === 'function') {
            stopPipPreview();
        }
    }
};

function initPipPreview() {
    initPipDragging();
    initPipResizing();
    updatePipCanvasDimensions();
    updatePipBgLayer();
    updatePipSlideOverlay();

    if (canvas && !canvas._pipBound) {
        canvas.on('after:render', () => {
            updatePipSlideOverlay();
        });
        canvas._pipBound = true;
    }
}

function initPipDragging() {
    const pipContainer = document.getElementById('pip-stage-preview-container');
    const pipHeader = document.getElementById('pip-header');
    if (!pipContainer || !pipHeader || pipHeader._dragBound) return;

    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    pipHeader.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        const rect = pipContainer.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        pipContainer.style.bottom = 'auto';
        pipContainer.style.right = 'auto';
        pipContainer.style.left = initialLeft + 'px';
        pipContainer.style.top = initialTop + 'px';

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        pipContainer.style.left = Math.max(0, Math.min(window.innerWidth - pipContainer.offsetWidth, initialLeft + dx)) + 'px';
        pipContainer.style.top = Math.max(0, Math.min(window.innerHeight - pipContainer.offsetHeight, initialTop + dy)) + 'px';
    }

    function onMouseUp() {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }

    pipHeader._dragBound = true;
}

function initPipResizing() {
    const pipContainer = document.getElementById('pip-stage-preview-container');
    if (!pipContainer || pipContainer._resizeBound) return;

    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
            updatePipCanvasDimensions();
            updatePipSlideOverlay();
        });
        ro.observe(pipContainer);
    }
    pipContainer._resizeBound = true;
}

function updatePipCanvasDimensions() {
    const pipBody = document.getElementById('pip-body');
    const slideCanvas = document.getElementById('pip-slide-canvas');
    const ambientCanvas = document.getElementById('pip-bg-ambient-canvas');

    if (!pipBody) return;
    const w = pipBody.clientWidth || 340;
    const h = pipBody.clientHeight || 180;

    if (slideCanvas) {
        slideCanvas.width = w;
        slideCanvas.height = h;
    }
    if (ambientCanvas) {
        ambientCanvas.width = w;
        ambientCanvas.height = h;
    }
}

function updatePipBgLayer() {
    const video = document.getElementById('pip-bg-video');
    const ambientCanvas = document.getElementById('pip-bg-ambient-canvas');
    if (!video || !ambientCanvas) return;

    const opacity = currentStageBg.opacity !== undefined ? currentStageBg.opacity : 0.8;
    const blur = currentStageBg.blur || 0;

    if (currentStageBg.type === 'video' && currentStageBg.videoUrl) {
        ambientCanvas.style.display = 'none';
        video.style.display = 'block';
        video.muted = true;
        const targetUrl = currentStageBg.videoUrl.startsWith('http') ? currentStageBg.videoUrl : (window.location.origin + currentStageBg.videoUrl);
        if (video.src !== targetUrl && !video.src.endsWith(currentStageBg.videoUrl)) {
            video.src = currentStageBg.videoUrl;
            video.load();
        }
        video.style.opacity = opacity;
        video.style.filter = blur > 0 ? `blur(${blur}px)` : 'none';
        video.play().catch(e => console.warn("PiP video play warning:", e));
        if (pipAmbientAnimId) {
            cancelAnimationFrame(pipAmbientAnimId);
            pipAmbientAnimId = null;
        }
    } else {
        video.style.display = 'none';
        video.pause();
        ambientCanvas.style.display = 'block';
        ambientCanvas.style.opacity = opacity;
        ambientCanvas.style.filter = blur > 0 ? `blur(${blur}px)` : 'none';
        startPipAmbientLoop();
    }
}

function startPipAmbientLoop() {
    if (pipAmbientAnimId) cancelAnimationFrame(pipAmbientAnimId);
    const canvasEl = document.getElementById('pip-bg-ambient-canvas');
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    let t = 0;

    function render() {
        t += 0.015;
        const w = canvasEl.width || 340;
        const h = canvasEl.height || 180;

        const grad = ctx.createLinearGradient(
            (Math.sin(t) * 0.5 + 0.5) * w,
            0,
            (Math.cos(t) * 0.5 + 0.5) * w,
            h
        );
        grad.addColorStop(0, '#0b0f19');
        grad.addColorStop(0.5, '#0369a1');
        grad.addColorStop(1, '#1e1b4b');

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        for (let i = 0; i < 15; i++) {
            const x = (Math.sin(t + i * 1.3) * 0.5 + 0.5) * w;
            const y = (Math.cos(t * 0.8 + i * 1.7) * 0.5 + 0.5) * h;
            const r = (Math.sin(t + i) * 0.5 + 0.5) * 3 + 1;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        pipAmbientAnimId = requestAnimationFrame(render);
    }
    render();
}

let pipTempCanvas = null;
let isPipUpdating = false;

function updatePipSlideOverlay() {
    if (isPipUpdating) return;
    const pipContainer = document.getElementById('pip-stage-preview-container');
    if (!pipContainer || pipContainer.style.display === 'none') return;

    const slideCanvas = document.getElementById('pip-slide-canvas');
    if (!slideCanvas) return;
    const ctx = slideCanvas.getContext('2d');
    ctx.clearRect(0, 0, slideCanvas.width, slideCanvas.height);

    if (!canvas) return;

    try {
        isPipUpdating = true;
        const baseW = (typeof BASE_WIDTH !== 'undefined' && BASE_WIDTH) ? BASE_WIDTH : 1920;
        const baseH = (typeof BASE_HEIGHT !== 'undefined' && BASE_HEIGHT) ? BASE_HEIGHT : 1080;

        if (!pipTempCanvas) {
            pipTempCanvas = document.createElement('canvas');
        }
        if (pipTempCanvas.width !== baseW || pipTempCanvas.height !== baseH) {
            pipTempCanvas.width = baseW;
            pipTempCanvas.height = baseH;
        }

        const tempCtx = pipTempCanvas.getContext('2d');
        tempCtx.clearRect(0, 0, baseW, baseH);

        // 에디터 캔버스 줌(canvasZoom) 및 여백 변환(transform)을 제외하고 1:1 슬라이드 원본 해상도로 고정 렌더링
        tempCtx.save();
        tempCtx.setTransform(1, 0, 0, 1, 0, 0);

        const objects = canvas.getObjects();
        for (let i = 0; i < objects.length; i++) {
            const obj = objects[i];
            if (obj && obj.visible !== false) {
                obj.render(tempCtx);
            }
        }
        tempCtx.restore();

        // 슬라이드 원본 레이어(1920x1080) 전체를 PiP 화면에 풀 스케일로 꽉 채워 합성
        ctx.drawImage(pipTempCanvas, 0, 0, slideCanvas.width, slideCanvas.height);
    } catch (e) {
        console.error("Failed to render PiP slide overlay", e);
    } finally {
        isPipUpdating = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadStageBgLibrary();

    const searchInput = document.getElementById('input-stage-bg-search');
    const filterSelect = document.getElementById('select-stage-bg-filter');
    if (searchInput) searchInput.addEventListener('input', filterAndRenderStageBgLibrary);
    if (filterSelect) filterSelect.addEventListener('change', filterAndRenderStageBgLibrary);

    const btnPipClose = document.getElementById('btn-pip-close');
    const btnPipMin = document.getElementById('btn-pip-toggle-min');
    if (btnPipClose) {
        btnPipClose.addEventListener('click', () => {
            const container = document.getElementById('pip-stage-preview-container');
            if (container) container.style.display = 'none';
            if (typeof stopPipPreview === 'function') {
                stopPipPreview();
            }
        });
    }
    if (btnPipMin) {
        btnPipMin.addEventListener('click', () => {
            const body = document.getElementById('pip-body');
            const container = document.getElementById('pip-stage-preview-container');
            if (body && container) {
                if (body.style.display === 'none') {
                    body.style.display = 'flex';
                    container.style.height = '215px';
                } else {
                    body.style.display = 'none';
                    container.style.height = '36px';
                }
            }
        });
    }

    const opacityInput = document.getElementById('range-stage-bg-opacity');
    const opacityVal = document.getElementById('val-stage-bg-opacity');
    if (opacityInput) {
        opacityInput.addEventListener('input', (e) => {
            if (opacityVal) opacityVal.innerText = `${e.target.value}%`;
            applyAndBroadcastStageBg(true);
        });
    }

    const blurInput = document.getElementById('range-stage-bg-blur');
    const blurVal = document.getElementById('val-stage-bg-blur');
    if (blurInput) {
        blurInput.addEventListener('input', (e) => {
            if (blurVal) blurVal.innerText = `${e.target.value}px`;
            applyAndBroadcastStageBg(true);
        });
    }

    const btnUploadFile = document.getElementById('btn-upload-bg-file');
    const inputUploadFile = document.getElementById('file-upload-bg-input');

    function updateYtStatus(msg, color) {
        console.log(`[Stage BG Upload Status] ${msg}`);
        const statusEl = document.getElementById('stage-bg-upload-status');
        if (statusEl) {
            statusEl.textContent = msg;
            if (color) statusEl.style.color = color;
        }
    }

    async function handleLocalFileUpload(fileInput) {
        if (!fileInput || !fileInput.files || !fileInput.files[0]) return;
        const file = fileInput.files[0];
        const formData = new FormData();
        formData.append('file', file);

        updateYtStatus(`⏳ 로컬 비디오 파일 업로드 중... 0%`, '#fbbf24');

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/backgrounds/upload', true);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                updateYtStatus(`⏳ 로컬 비디오 파일 업로드 중... ${percent}%`, '#fbbf24');
            }
        };

        xhr.onload = async () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const data = JSON.parse(xhr.responseText);
                    if (data.success) {
                        const displayName = data.title || file.name;
                        updateYtStatus(`✅ 업로드 완료! 100% (${displayName})`, '#34d399');
                        if (typeof showToast === 'function') {
                            showToast(`🎬 배경 동영상 '${displayName}' 업로드 완료!`);
                        }
                        selectStageBg({ type: 'video', videoUrl: data.videoUrl, title: displayName });
                        await loadStageBgLibrary();
                        setTimeout(() => {
                            const statusEl = document.getElementById('stage-bg-upload-status');
                            if (statusEl && statusEl.textContent.includes('업로드 완료')) {
                                statusEl.textContent = '';
                            }
                        }, 5000);
                    } else {
                        updateYtStatus(`❌ 업로드 실패: ${data.detail || '오류 발생'}`, '#ef4444');
                    }
                } catch (e) {
                    updateYtStatus(`❌ 응답 처리 오류: ${e.message}`, '#ef4444');
                }
            } else {
                updateYtStatus(`❌ 업로드 실패: HTTP ${xhr.status}`, '#ef4444');
            }
            fileInput.value = '';
        };

        xhr.onerror = () => {
            updateYtStatus(`❌ 업로드 통신 오류 발생`, '#ef4444');
            fileInput.value = '';
        };

        xhr.send(formData);
    }

    if (btnUploadFile && inputUploadFile) {
        btnUploadFile.addEventListener('click', () => inputUploadFile.click());
        inputUploadFile.addEventListener('change', () => handleLocalFileUpload(inputUploadFile));
    }
});
