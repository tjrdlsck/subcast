document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('cloud-backup-modal');
    const statusBox = document.getElementById('cloud-drive-status');
    const projectSelect = document.getElementById('cloud-project-select');
    const snapshotList = document.getElementById('cloud-snapshot-list');
    let statusPoll = null;
    let returnFocusTo = null;

    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[char]));
    const setStatus = (message, error = false) => {
        statusBox.textContent = message;
        statusBox.style.color = error ? '#fca5a5' : '';
    };

    async function loadProjects() {
        const response = await fetch('/api/projects');
        if (!response.ok) throw new Error('프로젝트 목록을 불러오지 못했습니다.');
        const projects = await response.json();
        projectSelect.innerHTML = projects.map(project =>
            `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`
        ).join('');
        const active = projects.find(project => project.isActive);
        if (active) projectSelect.value = active.id;
    }

    async function loadSnapshots() {
        snapshotList.innerHTML = '<div class="cloud-drive-status">Drive 백업 목록을 불러오는 중...</div>';
        try {
            const response = await fetch('/api/cloud/drive/snapshots');
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || '백업 목록을 불러오지 못했습니다.');
            if (!data.snapshots?.length) {
                snapshotList.innerHTML = '<div class="cloud-drive-status">Drive에 저장된 백업이 없습니다.</div>';
                return;
            }
            snapshotList.innerHTML = data.snapshots.map(snapshot => {
                const date = snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString() : '시각 정보 없음';
                const branch = snapshot.hasConflict ? '<span class="cloud-conflict-badge">분기</span> · ' : '';
                const parent = snapshot.parentSnapshotId ? `부모 ${(snapshot.parentSnapshotId || '').slice(0, 8)}` : '최초 백업';
                return `<div class="cloud-snapshot-item"><div><strong>${branch}${escapeHtml(snapshot.projectName || 'Subcast 프로젝트')}</strong><small>${escapeHtml(snapshot.deviceLabel || '기기')} · ${escapeHtml(date)}</small><small>${escapeHtml(parent)} · 스냅샷 ${(snapshot.snapshotId || '').slice(0, 8)}</small></div><button type="button" class="action-btn btn-select" data-cloud-restore="${escapeHtml(snapshot.fileId)}">새 프로젝트로 복원</button></div>`;
            }).join('');
        } catch (error) {
            snapshotList.innerHTML = `<div class="cloud-drive-status" style="color:#fca5a5">${escapeHtml(error.message)}</div>`;
        }
    }

    async function refreshStatus() {
        try {
            const response = await fetch('/api/cloud/drive/status', { cache: 'no-store' });
            const status = await response.json();
            if (!status.configured) setStatus('Google Drive OAuth 클라이언트 자격 증명이 설정되지 않았습니다. 앱을 업데이트한 뒤 다시 시도해 주세요.', true);
            else if (status.connected) setStatus('Google Drive 연결됨. 백업은 사용자 Drive의 Subcast 폴더에 저장됩니다.');
            else if (status.error) setStatus(status.error, true);
            else setStatus(status.pending ? '브라우저에서 Google 계정 권한을 승인해 주세요.' : 'Google Drive 연결이 필요합니다.');
            document.getElementById('btn-drive-connect').disabled = !status.configured || status.connected;
            document.getElementById('btn-drive-backup').disabled = !status.connected || !projectSelect.options.length;
            document.getElementById('btn-drive-refresh').disabled = !status.connected;
            document.getElementById('btn-drive-disconnect').disabled = !status.connected;
            return status;
        } catch (_) {
            setStatus('Drive 연결 상태를 확인하지 못했습니다. 로컬 프로젝트 사용에는 영향이 없습니다.', true);
            return null;
        }
    }

    document.getElementById('btn-open-cloud-backup')?.addEventListener('click', async () => {
        returnFocusTo = document.activeElement;
        modal.classList.add('show');
        document.getElementById('btn-close-cloud-modal').focus();
        try { await loadProjects(); } catch (error) { setStatus(error.message, true); }
        const status = await refreshStatus();
        if (status?.connected) await loadSnapshots();
    });

    function closeModal() {
        modal.classList.remove('show');
        clearInterval(statusPoll);
        returnFocusTo?.focus();
    }
    document.getElementById('btn-close-cloud-modal')?.addEventListener('click', closeModal);
    modal?.addEventListener('click', event => { if (event.target === modal) closeModal(); });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modal.classList.contains('show')) closeModal();
    });

    document.getElementById('btn-drive-connect')?.addEventListener('click', async () => {
        const authWindow = window.open('about:blank', '_blank');
        if (!authWindow) return setStatus('브라우저 팝업이 차단되었습니다. 팝업을 허용한 뒤 다시 연결해 주세요.', true);
        try {
            const response = await fetch('/api/cloud/drive/connect', { method: 'POST' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || 'Google Drive 연결을 시작하지 못했습니다.');
            authWindow.location = data.authorizationUrl;
            setStatus('새 브라우저 창에서 Google 계정 권한을 승인해 주세요.');
            let attempts = 0;
            clearInterval(statusPoll);
            statusPoll = setInterval(async () => {
                attempts++;
                const status = await refreshStatus();
                if (status?.connected) {
                    clearInterval(statusPoll);
                    await loadSnapshots();
                } else if (status?.error || attempts >= 120) clearInterval(statusPoll);
            }, 1500);
        } catch (error) {
            authWindow.close();
            setStatus(error.message, true);
        }
    });

    document.getElementById('btn-drive-backup')?.addEventListener('click', async event => {
        const button = event.currentTarget;
        const projectId = projectSelect.value;
        if (!projectId) return;
        button.disabled = true;
        setStatus('프로젝트와 참조 영상·글꼴을 확인하고 백업하는 중...');
        try {
            const response = await fetch(`/api/cloud/drive/projects/${encodeURIComponent(projectId)}/snapshots`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceLabel: document.getElementById('cloud-device-label').value || '이 PC' })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || '백업에 실패했습니다.');
            setStatus(`백업 완료 · ${(data.snapshot.size / 1024).toFixed(1)} KB · ${new Date(data.snapshot.createdAt).toLocaleString()}`);
            await loadSnapshots();
        } catch (error) { setStatus(error.message, true); }
        finally { button.disabled = false; }
    });

    document.getElementById('btn-drive-refresh')?.addEventListener('click', loadSnapshots);
    document.getElementById('btn-drive-disconnect')?.addEventListener('click', async () => {
        await fetch('/api/cloud/drive/connect', { method: 'DELETE' });
        snapshotList.innerHTML = '';
        await refreshStatus();
    });
    snapshotList?.addEventListener('click', async event => {
        const button = event.target.closest('[data-cloud-restore]');
        if (!button || !confirm('이 백업을 새 프로젝트로 복원합니다. 기존 프로젝트는 덮어쓰지 않습니다. 계속할까요?')) return;
        button.disabled = true;
        try {
            const response = await fetch('/api/cloud/drive/restore', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileId: button.dataset.cloudRestore })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || '복원에 실패했습니다.');
            await loadProjects();
            projectSelect.value = data.project.id;
            setStatus(`새 프로젝트로 복원했습니다: ${data.project.name}`);
            await loadSnapshots();
            document.dispatchEvent(new CustomEvent('subcast:projects-updated'));
        } catch (error) { setStatus(error.message, true); }
        finally { button.disabled = false; }
    });
});
