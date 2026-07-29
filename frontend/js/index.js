document.addEventListener('DOMContentLoaded', () => {
            const projectListContainer = document.getElementById('project-list-container');
            const projectsCountBadge = document.getElementById('projects-count');
            const selectedCountBadge = document.getElementById('selected-count-badge');
            const createModal = document.getElementById('create-modal');
            const btnOpenCreateModal = document.getElementById('btn-open-create-modal');
            const btnCloseModal = document.getElementById('btn-close-modal');
            const btnSubmitCreate = document.getElementById('btn-submit-create');
            const inputProjectName = document.getElementById('new-project-name');
            const projectSearchInput = document.getElementById('project-search-input');
            const toastEl = document.getElementById('toast');

            // 로컬 상태 관리
            let currentProjects = [];
            let selectedProjectIds = new Set();
            let clipboardProjectIds = [];
            let lastSelectedIndex = -1;
            let searchQuery = '';

            if (projectSearchInput) {
                projectSearchInput.addEventListener('input', (e) => {
                    searchQuery = e.target.value.trim().toLowerCase();
                    renderProjects();
                });
            }

            // 토스트 알림 보이기
            function showToast(message, duration = 2500) {
                toastEl.textContent = message;
                toastEl.classList.add('show');
                setTimeout(() => {
                    toastEl.classList.remove('show');
                }, duration);
            }

            // 프로젝트 목록 조회 및 렌더링
            async function fetchProjects() {
                try {
                    const response = await fetch('/api/projects');
                    if (!response.ok) throw new Error('프로젝트 목록을 불러오지 못했습니다.');
                    currentProjects = await response.json();
                    
                    // 삭제된 프로젝트 ID 정리
                    const validIds = new Set(currentProjects.map(p => p.id));
                    selectedProjectIds = new Set([...selectedProjectIds].filter(id => validIds.has(id)));
                    
                    renderProjects();
                } catch (error) {
                    console.error('Error fetching projects:', error);
                    projectListContainer.innerHTML = `<div class="empty-projects">프로젝트 목록을 불러오는 중 오류가 발생했습니다.</div>`;
                }
            }

            function updateSelectedUI() {
                // 각 DOM 아이템의 클래스 갱신
                const items = projectListContainer.querySelectorAll('.project-item');
                items.forEach(item => {
                    const id = item.getAttribute('data-id');
                    const badgeContainer = item.querySelector('.badge-container');
                    
                    if (selectedProjectIds.has(id)) {
                        item.classList.add('selected');
                        if (badgeContainer && !badgeContainer.querySelector('.selected-badge')) {
                            const selectedBadge = document.createElement('span');
                            selectedBadge.className = 'selected-badge';
                            selectedBadge.textContent = '선택됨';
                            badgeContainer.appendChild(selectedBadge);
                        }
                    } else {
                        item.classList.remove('selected');
                        if (badgeContainer) {
                            const badge = badgeContainer.querySelector('.selected-badge');
                            if (badge) badge.remove();
                        }
                    }
                });

                // 상단 선택 개수 뱃지 및 선택 내보내기 버튼 갱신
                const btnExportSelected = document.getElementById('btn-export-selected');
                if (selectedProjectIds.size > 0) {
                    selectedCountBadge.textContent = `${selectedProjectIds.size}개 선택됨`;
                    selectedCountBadge.classList.add('show');
                    if (btnExportSelected) btnExportSelected.style.display = 'inline-flex';
                } else {
                    selectedCountBadge.classList.remove('show');
                    if (btnExportSelected) btnExportSelected.style.display = 'none';
                }
            }

            function renderProjects() {
                const filteredProjects = currentProjects.filter(proj =>
                    !searchQuery || (proj.name && proj.name.toLowerCase().includes(searchQuery))
                );

                if (searchQuery) {
                    projectsCountBadge.textContent = `${filteredProjects.length}개 / 총 ${currentProjects.length}개`;
                } else {
                    projectsCountBadge.textContent = `${currentProjects.length}개`;
                }

                if (!currentProjects || currentProjects.length === 0) {
                    projectListContainer.innerHTML = `
                        <div class="empty-projects">
                            등록된 프로젝트가 없습니다.<br>
                            상단의 '+ 새 프로젝트 추가' 버튼을 눌러 프로젝트를 생성해 주세요.
                        </div>
                    `;
                    updateSelectedUI();
                    return;
                }

                if (filteredProjects.length === 0) {
                    projectListContainer.innerHTML = `
                        <div class="empty-projects">
                            '${escapeHtml(searchQuery)}' 검색 결과와 일치하는 프로젝트가 없습니다.
                        </div>
                    `;
                    updateSelectedUI();
                    return;
                }

                projectListContainer.innerHTML = filteredProjects.map((proj, idx) => {
                    const isActive = proj.isActive;
                    const isSelected = selectedProjectIds.has(proj.id);
                    const updatedAt = proj.updatedAt || '일시 정보 없음';
                    const slideCount = proj.slideCount || 0;

                    return `
                        <div class="project-item ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}" 
                             data-id="${proj.id}" 
                             data-index="${idx}">
                            <div class="project-info">
                                <div class="project-title-row">
                                    <span class="project-name" title="두 번 클릭하여 이름 수정" ondblclick="event.stopPropagation(); startInlineRename(this, '${proj.id}', '${escapeHtml(proj.name)}')">${escapeHtml(proj.name)}</span>
                                    <div class="badge-container">
                                        ${isActive ? '<span class="active-badge">✓ 현재 작업중</span>' : ''}
                                        ${isSelected ? '<span class="selected-badge">선택됨</span>' : ''}
                                    </div>
                                </div>
                                <div class="project-meta">
                                    <span>📄 슬라이드 ${slideCount}개</span>
                                    <span>🕒 ${updatedAt}</span>
                                </div>
                            </div>
                            <div class="project-actions">
                                ${isActive ? `
                                    <span class="action-btn btn-select current">현재 선택됨</span>
                                ` : `
                                    <button class="action-btn btn-select" onclick="event.stopPropagation(); selectProject('${proj.id}')">작업 전환</button>
                                `}
                                <button class="action-btn btn-editor" onclick="event.stopPropagation(); openPage('${proj.id}', '/static/editor.html')">Editor</button>
                                <button class="action-btn btn-presenter" onclick="event.stopPropagation(); openPage('${proj.id}', '/static/presenter.html')">Presenter</button>
                                <button class="action-btn btn-export" title="프로젝트 내보내기" style="padding: 8px 10px;" onclick="event.stopPropagation(); exportProject('${proj.id}')"><img src="/static/assets/icons/upload.svg" style="width: 14px; height: 14px; filter: brightness(0) invert(1);" alt="내보내기" /></button>
                                ${currentProjects.length > 1 ? `
                                    <button class="action-btn btn-delete" onclick="event.stopPropagation(); deleteProject('${proj.id}', '${escapeHtml(proj.name)}')">삭제</button>
                                ` : ''}
                            </div>
                        </div>
                    `;
                }).join('');

                // 아이템 클릭 다중 선택 이벤트 바인딩
                const items = projectListContainer.querySelectorAll('.project-item');
                items.forEach((item) => {
                    item.addEventListener('click', (e) => {
                        const index = parseInt(item.getAttribute('data-index'));
                        const id = item.getAttribute('data-id');

                        if (e.shiftKey && lastSelectedIndex !== -1) {
                            // Shift 범위 선택
                            const start = Math.min(lastSelectedIndex, index);
                            const end = Math.max(lastSelectedIndex, index);
                            if (!e.ctrlKey && !e.metaKey) {
                                selectedProjectIds.clear();
                            }
                            for (let i = start; i <= end; i++) {
                                if (filteredProjects[i]) {
                                    selectedProjectIds.add(filteredProjects[i].id);
                                }
                            }
                        } else if (e.ctrlKey || e.metaKey) {
                            // Ctrl/Cmd 토글 선택
                            if (selectedProjectIds.has(id)) {
                                selectedProjectIds.delete(id);
                            } else {
                                selectedProjectIds.add(id);
                            }
                            lastSelectedIndex = index;
                        } else {
                            // 단일 클릭 선택
                            selectedProjectIds.clear();
                            selectedProjectIds.add(id);
                            lastSelectedIndex = index;
                        }

                        updateSelectedUI();
                    });
                });

                updateSelectedUI();
            }

            // XSS 방지 HTML escape
            function escapeHtml(text) {
                if (!text) return '';
                return text
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#039;");
            }

            // 프로젝트 선택 (글로벌 바인딩)
            window.selectProject = async function(projectId) {
                try {
                    const res = await fetch(`/api/projects/${projectId}/select`, { method: 'POST' });
                    if (!res.ok) throw new Error('프로젝트 전환 실패');
                    showToast('작업 프로젝트가 변경되었습니다.');
                    await fetchProjects();
                } catch (err) {
                    alert('프로젝트 선택 중 오류가 발생했습니다: ' + err.message);
                }
            };

            // 단일 프로젝트 내보내기 (글로벌 바인딩)
            window.exportProject = function(projectId) {
                window.location.href = `/api/projects/${projectId}/export`;
            };

            // 선택한 프로젝트 다중 내보내기
            const btnExportSelected = document.getElementById('btn-export-selected');
            if (btnExportSelected) {
                btnExportSelected.addEventListener('click', async () => {
                    if (selectedProjectIds.size === 0) return;
                    if (selectedProjectIds.size === 1) {
                        const pid = Array.from(selectedProjectIds)[0];
                        window.exportProject(pid);
                        return;
                    }
                    try {
                        showToast(`${selectedProjectIds.size}개 프로젝트 내보내는 중...`);
                        const response = await fetch('/api/projects/export-bulk', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ids: Array.from(selectedProjectIds) })
                        });
                        if (!response.ok) throw new Error('프로젝트 일괄 내보내기 실패');
                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `projects_export_${new Date().toISOString().slice(0,10)}.json`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        window.URL.revokeObjectURL(url);
                        showToast(`${selectedProjectIds.size}개 프로젝트가 내보내졌습니다.`);
                    } catch (err) {
                        alert('프로젝트 내보내기 오류: ' + err.message);
                    }
                });
            }

            // 프로젝트 가져오기 처리
            const btnImportProjectTrigger = document.getElementById('btn-import-project-trigger');
            const fileImportProject = document.getElementById('file-import-project');
            if (btnImportProjectTrigger && fileImportProject) {
                btnImportProjectTrigger.addEventListener('click', () => {
                    fileImportProject.value = '';
                    fileImportProject.click();
                });

                fileImportProject.addEventListener('change', async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;

                    const formData = new FormData();
                    formData.append('file', file);

                    try {
                        showToast('프로젝트 가져오는 중...');
                        const res = await fetch('/api/projects/import', {
                            method: 'POST',
                            body: formData
                        });
                        if (!res.ok) {
                            const errData = await res.json();
                            throw new Error(errData.detail || '가져오기 실패');
                        }
                        const data = await res.json();
                        showToast(`성공적으로 ${data.imported_count || 1}개의 프로젝트를 가져왔습니다.`);
                        await fetchProjects();
                    } catch (err) {
                        alert('프로젝트 가져오기 실패: ' + err.message);
                    }
                });
            }

            // 선택 후 페이지 이동 (글로벌 바인딩)
            window.openPage = async function(projectId, targetUrl) {
                try {
                    const res = await fetch(`/api/projects/${projectId}/select`, { method: 'POST' });
                    if (!res.ok) throw new Error('프로젝트 전환 실패');
                    window.location.href = targetUrl;
                } catch (err) {
                    alert('프로젝트 이동 중 오류가 발생했습니다: ' + err.message);
                }
            };

            // 프로젝트 이름 인라인 수정 (글로벌 바인딩 - 더블클릭)
            window.startInlineRename = function(spanElement, projectId, currentName) {
                if (spanElement.querySelector('input')) return;

                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'project-name-input';
                input.value = currentName;
                
                input.onclick = (e) => e.stopPropagation();
                input.ondblclick = (e) => e.stopPropagation();

                let isSaved = false;
                const saveRename = async () => {
                    if (isSaved) return;
                    isSaved = true;

                    const newName = input.value.trim();
                    if (!newName) {
                        alert('프로젝트 이름을 입력해 주세요.');
                        spanElement.textContent = currentName;
                        return;
                    }
                    if (newName === currentName) {
                        spanElement.textContent = currentName;
                        return;
                    }

                    try {
                        const res = await fetch(`/api/projects/${projectId}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: newName })
                        });
                        if (!res.ok) {
                            const err = await res.json();
                            throw new Error(err.detail || '프로젝트 이름 수정 실패');
                        }
                        showToast('프로젝트 이름이 변경되었습니다.');
                        await fetchProjects();
                    } catch (err) {
                        alert('프로젝트 이름 변경 중 오류가 발생했습니다: ' + err.message);
                        spanElement.textContent = currentName;
                    }
                };

                input.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        input.blur();
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        isSaved = true;
                        spanElement.textContent = currentName;
                    }
                };

                input.onblur = saveRename;

                spanElement.innerHTML = '';
                spanElement.appendChild(input);
                input.focus();
                input.select();
            };

            // 단일 프로젝트 삭제 (글로벌 바인딩)
            window.deleteProject = async function(projectId, projectName) {
                if (!confirm(`'${projectName}' 프로젝트를 정말 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.`)) {
                    return;
                }
                try {
                    const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
                    if (!res.ok) throw new Error('프로젝트 삭제 실패');
                    selectedProjectIds.delete(projectId);
                    showToast('프로젝트가 삭제되었습니다.');
                    await fetchProjects();
                } catch (err) {
                    alert('프로젝트 삭제 중 오류가 발생했습니다: ' + err.message);
                }
            };

            // 다중 프로젝트 삭제 (Delete 키)
            async function deleteSelectedProjects() {
                if (selectedProjectIds.size === 0) return;

                const count = selectedProjectIds.size;
                if (!confirm(`선택한 ${count}개의 프로젝트를 정말 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.`)) {
                    return;
                }

                try {
                    const res = await fetch('/api/projects/delete-bulk', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ids: Array.from(selectedProjectIds) })
                    });
                    if (!res.ok) throw new Error('프로젝트 일괄 삭제 실패');
                    selectedProjectIds.clear();
                    showToast(`${count}개 프로젝트가 삭제되었습니다.`);
                    await fetchProjects();
                } catch (err) {
                    alert('다중 삭제 중 오류가 발생했습니다: ' + err.message);
                }
            }

            // 다중 프로젝트 복제 (Ctrl+V)
            async function duplicateClipboardProjects() {
                if (clipboardProjectIds.length === 0) {
                    showToast('클립보드에 복사된 프로젝트가 없습니다.');
                    return;
                }

                try {
                    showToast(`${clipboardProjectIds.length}개 프로젝트 복제 중...`);
                    const res = await fetch('/api/projects/duplicate-bulk', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ids: clipboardProjectIds })
                    });
                    if (!res.ok) throw new Error('프로젝트 일괄 복제 실패');
                    const data = await res.json();
                    
                    // 복제된 프로젝트 자동 선택 처리
                    if (data.duplicated && data.duplicated.length > 0) {
                        selectedProjectIds.clear();
                        data.duplicated.forEach(p => selectedProjectIds.add(p.id));
                    }
                    showToast(`${clipboardProjectIds.length}개 프로젝트가 성공적으로 복제되었습니다.`);
                    await fetchProjects();
                } catch (err) {
                    alert('프로젝트 복제 중 오류가 발생했습니다: ' + err.message);
                }
            }

            // 키보드 단축키 (Ctrl+C, Ctrl+V, Delete) 이벤트
            window.addEventListener('keydown', (e) => {
                // input 또는 textarea 입력 중이면 단축키 동작 안함
                const activeEl = document.activeElement;
                if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
                    return;
                }

                // Delete / Del 키
                if (e.key === 'Delete' || e.key === 'Del') {
                    if (selectedProjectIds.size > 0) {
                        e.preventDefault();
                        deleteSelectedProjects();
                    }
                }

                // Ctrl+C (복사)
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
                    if (selectedProjectIds.size > 0) {
                        e.preventDefault();
                        clipboardProjectIds = Array.from(selectedProjectIds);
                        showToast(`${clipboardProjectIds.length}개 프로젝트가 클립보드에 복사되었습니다. (Ctrl+V로 붙여넣기)`);
                    }
                }

                // Ctrl+V (붙여넣기 / 복제)
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
                    if (clipboardProjectIds.length > 0) {
                        e.preventDefault();
                        duplicateClipboardProjects();
                    }
                }
            });

            // 모달 조작
            btnOpenCreateModal.addEventListener('click', () => {
                inputProjectName.value = '';
                createModal.classList.add('show');
                inputProjectName.focus();
            });

            btnCloseModal.addEventListener('click', () => {
                createModal.classList.remove('show');
            });

            createModal.addEventListener('click', (e) => {
                if (e.target === createModal) {
                    createModal.classList.remove('show');
                }
            });

            // 새 프로젝트 생성 제출
            async function handleCreateProject() {
                const name = inputProjectName.value.trim();
                if (!name) {
                    alert('프로젝트 이름을 입력해 주세요.');
                    inputProjectName.focus();
                    return;
                }

                // 중복 이름 사전 검증
                if (currentProjects.some(p => p.name.trim() === name)) {
                    alert(`'${name}' 프로젝트가 이미 존재합니다. 다른 이름을 사용해 주세요.`);
                    inputProjectName.focus();
                    return;
                }

                try {
                    const res = await fetch('/api/projects', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name })
                    });
                    if (!res.ok) {
                        const errorData = await res.json();
                        throw new Error(errorData.detail || '프로젝트 생성 실패');
                    }
                    const newProj = await res.json();
                    createModal.classList.remove('show');
                    // 새 프로젝트를 작업 중 상태로 설정
                    await window.selectProject(newProj.id);
                } catch (err) {
                    alert('프로젝트 생성 오류: ' + err.message);
                }
            }

            btnSubmitCreate.addEventListener('click', handleCreateProject);
            inputProjectName.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    handleCreateProject();
                }
            });

            // 최초 목록 로드
            fetchProjects();

            // 현재 시스템 버전 동적 로드
            fetch('/api/system/version').then(r => r.json()).then(data => {
                const badge = document.getElementById('app-version-badge');
                if (badge && data.version) {
                    badge.innerText = 'v' + data.version;
                }
            }).catch(() => {});

            // ────────────────────────────────────────────────
            // 자동 업데이트 오버레이 (캐시 클리어 강제 새로고침 포함)
            // ────────────────────────────────────────────────
            function showUpdateOverlay(message, isCountdown = false, countdownSec = 10) {
                let overlay = document.getElementById('update-overlay');
                if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.id = 'update-overlay';
                    overlay.style.cssText = `
                        position:fixed;inset:0;z-index:99999;
                        background:rgba(10,10,20,0.92);backdrop-filter:blur(12px);
                        display:flex;flex-direction:column;align-items:center;justify-content:center;
                        color:#fff;font-family:'Outfit',sans-serif;gap:18px;
                    `;
                    document.body.appendChild(overlay);
                }
                overlay.innerHTML = `
                    <div style="font-size:3rem;">🚀</div>
                    <div style="font-size:1.25rem;font-weight:700;color:#818cf8;">${message}</div>
                    <div id="update-countdown" style="font-size:0.95rem;color:#9ca3af;"></div>
                    <div style="width:200px;height:4px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden;">
                        <div id="update-progress-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#6366f1,#818cf8);transition:width 0.5s ease;border-radius:4px;"></div>
                    </div>
                `;
                if (isCountdown) {
                    let remaining = countdownSec;
                    const bar = document.getElementById('update-progress-bar');
                    const cd = document.getElementById('update-countdown');
                    const tick = setInterval(() => {
                        remaining--;
                        const pct = ((countdownSec - remaining) / countdownSec * 100).toFixed(0);
                        if (bar) bar.style.width = pct + '%';
                        if (cd) cd.textContent = `서버 재시작 후 자동으로 새로고침됩니다 (${remaining}초)`;
                        if (remaining <= 0) clearInterval(tick);
                    }, 1000);
                }
                return overlay;
            }

            function pollUntilServerReady(onReady, maxWaitMs = 60000) {
                const start = Date.now();
                const interval = setInterval(async () => {
                    if (Date.now() - start > maxWaitMs) {
                        clearInterval(interval);
                        onReady(); // 타임아웃 시에도 새로고침 시도
                        return;
                    }
                    try {
                        const r = await fetch('/api/system/version', { cache: 'no-store' });
                        if (r.ok) {
                            clearInterval(interval);
                            onReady();
                        }
                    } catch (_) { /* 서버 아직 재시작 중 */ }
                }, 1500);
            }

            function hardReload() {
                // 캐시 버스팅: 타임스탬프 쿼리스트링으로 강제 새로고침
                const url = new URL(window.location.href);
                url.searchParams.set('_v', Date.now());
                window.location.replace(url.toString());
            }

            // 업데이트 확인 이벤트 핸들러
            const btnCheckUpdate = document.getElementById('btn-check-update');
            if (btnCheckUpdate) {
                btnCheckUpdate.addEventListener('click', async () => {
                    btnCheckUpdate.disabled = true;
                    btnCheckUpdate.innerText = '확인 중...';
                    try {
                        const res = await fetch('/api/system/check-update');
                        const data = await res.json();
                        if (data.has_update) {
                            const confirmUpdate = confirm(`🚀 새 버전 [${data.latest_version}]이 출시되었습니다!\n현재 버전: ${data.current_version}\n\n지금 자동으로 업데이트를 진행하시겠습니까?`);
                            if (confirmUpdate) {
                                btnCheckUpdate.innerText = '다운로드 중...';
                                showUpdateOverlay('업데이트를 다운로드하고 있습니다...');

                                const updateRes = await fetch('/api/system/auto-update', { method: 'POST' });
                                if (!updateRes.ok) {
                                    const errData = await updateRes.json().catch(() => ({}));
                                    throw new Error(errData.detail || '업데이트 요청 실패');
                                }

                                // 서버가 인스톨러를 실행하고 종료되기까지 대기 후 폴링
                                showUpdateOverlay('업데이트 설치 중... 앱이 재시작됩니다.', true, 15);
                                await new Promise(r => setTimeout(r, 8000)); // 서버 종료 대기

                                pollUntilServerReady(() => {
                                    showUpdateOverlay('업데이트 완료! 페이지를 새로고침합니다.');
                                    setTimeout(hardReload, 1500);
                                }, 60000);
                            }
                        } else {
                            alert(`현재 최신 버전(v${data.current_version})을 사용 중입니다.`);
                        }
                    } catch (err) {
                        const overlay = document.getElementById('update-overlay');
                        if (overlay) overlay.remove();
                        alert('업데이트 오류: ' + err.message);
                    } finally {
                        if (!document.getElementById('update-overlay')) {
                            btnCheckUpdate.disabled = false;
                            btnCheckUpdate.innerHTML = `<svg style="width: 14px; height: 14px; fill: currentColor;" viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg> 업데이트 확인`;
                        }
                    }
                });
            }
        });
