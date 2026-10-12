document.addEventListener('DOMContentLoaded', () => {
    const byId = id => document.getElementById(id);
    const modal = byId('cloud-backup-modal');
    let statusPoll = null;
    let returnFocusTo = null;
    let environment = null;
    let connected = false;
    let configured = false;
    let busy = false;
    let confirmAction = null;
    let requestGeneration = 0;
    const operationStorageKey = 'subcast_cloud_environment_operation';
    let activeOperationId = localStorage.getItem(operationStorageKey);
    let operationStatus = null;
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
    const bytes = value => {
        const size = Number(value) || 0;
        if (size < 1024) return `${size} B`;
        if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
        if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`;
        return `${(size / 1024 ** 3).toFixed(2)} GB`;
    };
    const textBytes = value => new TextEncoder().encode(value).length;
    const setStatus = (message, error = false) => {
        byId('cloud-drive-status').textContent = message;
        byId('cloud-drive-status').style.color = error ? '#fca5a5' : '';
    };
    const readBrowserSettings = () => {
        const read = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; } };
        return { monitorSettings: read('subcast_monitor_settings'), broadcastLayout: read('subcast_praise_broadcast_layout') };
    };
    function renderOperation(operation) {
        operationStatus = operation;
        const indicator = byId('cloud-operation-indicator');
        const terminal = operation.status === 'completed' || operation.status === 'failed';
        const visible = !modal.classList.contains('show');
        indicator.hidden = !visible;
        byId('cloud-operation-title').textContent = operation.action === 'restore' ? 'Drive 환경 적용' : 'Drive 환경 동기화';
        byId('cloud-operation-percent').textContent = `${operation.percent || 0}%`;
        byId('cloud-operation-progress').value = operation.percent || 0;
        byId('cloud-operation-message').textContent = operation.message || '작업 상태를 확인하고 있습니다.';
        const file = operation.currentFile ? ` · ${operation.currentFile}` : '';
        const items = operation.totalItems ? `${operation.completedItems || 0}/${operation.totalItems}개` : '';
        const transfer = operation.totalBytes ? `${bytes(operation.transferredBytes)} / ${bytes(operation.totalBytes)}` : '';
        byId('cloud-operation-detail').textContent = [items, transfer].filter(Boolean).join(' · ') + file;
        byId('btn-cloud-operation-dismiss').hidden = !terminal;
        busy = !terminal;
        buttons();
        if (modal.classList.contains('show')) setStatus(operation.message || 'Drive 작업 중... ', operation.status === 'failed');
    }
    const wait = duration => new Promise(resolve => setTimeout(resolve, duration));
    async function pollOperation(operationId) {
        while (activeOperationId === operationId) {
            try {
                const status = await request(`/api/cloud/drive/environment/operations/${encodeURIComponent(operationId)}`, { cache: 'no-store' });
                if (activeOperationId !== operationId) break;
                renderOperation(status);
                if (status.status === 'completed' || status.status === 'failed') {
                    activeOperationId = null;
                    localStorage.removeItem(operationStorageKey);
                    if (status.status === 'completed' && status.action === 'restore') {
                        for (const [field, key] of [['monitorSettings', 'subcast_monitor_settings'], ['broadcastLayout', 'subcast_praise_broadcast_layout']]) {
                            if (status.result?.browserSettings?.[field] != null) localStorage.setItem(key, JSON.stringify(status.result.browserSettings[field]));
                            else localStorage.removeItem(key);
                        }
                        document.dispatchEvent(new CustomEvent('subcast:environment-updated'));
                    }
                    if (modal.classList.contains('show') && status.status === 'completed') {
                        await loadEnvironment();
                        setStatus(status.action === 'sync'
                            ? (status.result?.unchanged ? '변경 사항이 없어 Drive 저장을 생략했습니다.' : '환경과 배경 전체 동기화 완료')
                            : 'Drive 환경을 이 PC에 적용했습니다.');
                    } else if (status.status === 'failed' && status.errorStatus === 409 && modal.classList.contains('show')) {
                        await loadEnvironment();
                    }
                    break;
                }
            } catch (error) {
                if (activeOperationId !== operationId) break;
                renderOperation({ action: operationStatus?.action || 'sync', status: 'failed', percent: 0, message: error.status === 404 ? '작업 상태를 찾을 수 없습니다. Drive 상태를 새로 확인해 주세요.' : error.message });
                activeOperationId = null;
                localStorage.removeItem(operationStorageKey);
                break;
            }
            await wait(1000);
        }
    }
    const buttons = () => {
        byId('btn-drive-connect').disabled = busy || !configured || connected;
        byId('btn-drive-disconnect').disabled = busy || !connected;
        byId('btn-drive-refresh').disabled = busy || !connected;
        byId('btn-drive-backup').disabled = busy || !connected || !environment || environment.needsRestore;
        byId('btn-drive-restore').disabled = busy || !connected || !environment?.exists;
    };
    async function request(url, options) {
        const response = await fetch(url, options);
        const data = await response.json();
        if (!response.ok) {
            const error = new Error(data.detail || 'Drive 요청을 완료하지 못했습니다.');
            error.status = response.status;
            throw error;
        }
        return data;
    }
    function render() {
        const localBrowserSettings = readBrowserSettings();
        const browserSettingsSize = textBytes(JSON.stringify(localBrowserSettings)) - textBytes('{}');
        const localSummary = { ...(environment.local || {}), settingsSize: (environment.local?.settingsSize || 0) + browserSettingsSize };
        const summary = side => `공통 설정 ${bytes(side.settingsSize)} · 배경 ${side.backgroundCount || 0}개 · ${bytes(side.backgroundBytes)}`;
        const row = (file, state, label) => `<div class="cloud-snapshot-item"><div><strong>${escapeHtml(file.title || file.name)}</strong><small>${escapeHtml(file.name)} · ${bytes(file.size)}</small></div><span class="cloud-background-state" data-state="${state}">${label}</span></div>`;
        const changes = environment.changes || {};
        const added = new Set((changes.added || []).map(file => typeof file === 'string' ? file : file.name));
        const updated = new Set((changes.updated || []).map(file => typeof file === 'string' ? file : file.name));
        byId('cloud-local-summary').textContent = summary(localSummary);
        byId('cloud-remote-summary').textContent = environment.exists ? summary(environment.remote || {}) : 'Drive에 저장된 환경이 없습니다.';
        byId('cloud-change-summary').textContent = environment.needsRestore
            ? '다른 PC에서 저장한 환경이 있습니다. 먼저 Drive 환경을 이 PC에 적용해 주세요.'
            : `Drive에 추가 ${added.size}개 · 변경 ${updated.size}개 · Drive에서 삭제 ${(changes.removed || []).length}개`;
        const localSettings = { ...(localSummary.settingsSummary || {}) };
        localSettings.browserMonitorSettings = localBrowserSettings.monitorSettings != null;
        localSettings.broadcastLayout = localBrowserSettings.broadcastLayout != null;
        const settingsRows = summary => [
            ['찬양곡', `${summary.praiseSongs || 0}개`],
            ['템플릿', `${summary.templates || 0}개`],
            ['현장 모니터', summary.monitorSettings ? '설정 있음' : '설정 없음'],
            ['태그', `${summary.moodTags || 0}개`],
            ['태그 연결', `${summary.importTagMappings || 0}개`],
            ['브라우저 모니터', summary.browserMonitorSettings ? '설정 있음' : '설정 없음'],
            ['방송 화면', summary.broadcastLayout ? '설정 있음' : '설정 없음'],
        ];
        const renderSettings = (target, summary, emptyMessage) => {
            if (!summary || !Object.keys(summary).length) {
                byId(target).innerHTML = `<li class="cloud-settings-empty">${emptyMessage}</li>`;
                return;
            }
            byId(target).innerHTML = settingsRows(summary).map(([name, value]) => `<li><span>${name}</span> ${escapeHtml(value)}</li>`).join('');
        };
        renderSettings('cloud-local-settings', localSettings, '이 PC 설정이 없습니다.');
        renderSettings('cloud-remote-settings', environment.remote?.settingsSummary, 'Drive에 저장된 설정이 없습니다.');
        byId('cloud-settings-state').textContent = !environment.exists ? 'Drive에 저장 전' : environment.needsRestore ? '다른 PC에서 변경됨' : environment.settingsChanged ? '앱 공통 데이터 변경됨' : '앱 공통 데이터 동일 · 브라우저 설정은 동기화 때 포함';
        const local = environment.local?.backgrounds || [];
        byId('cloud-background-list').innerHTML = local.map(file => added.has(file.name) ? row(file, 'added', 'Drive에 추가') : updated.has(file.name) ? row(file, 'updated', 'Drive에서 갱신') : row(file, 'same', '동일')).join('') + (changes.removed || []).map(file => row(typeof file === 'string' ? { name: file } : file, 'removed', 'Drive에서 삭제')).join('') || '<p class="import-tag-description">사용자가 업로드한 배경이 없습니다.</p>';
        byId('cloud-remote-list').innerHTML = (environment.remote?.backgrounds || []).map(file => row(file, 'same', 'Drive에 저장됨')).join('');
        buttons();
    }
    async function loadEnvironment() {
        const generation = ++requestGeneration;
        environment = null;
        buttons();
        try {
            const data = await request('/api/cloud/drive/environment', { cache: 'no-store' });
            if (generation !== requestGeneration || !connected) return;
            environment = data;
            render();
        } catch (error) {
            if (generation === requestGeneration) { setStatus(error.message, true); buttons(); }
        }
    }
    async function refreshStatus() {
        try {
            const status = await request('/api/cloud/drive/status', { cache: 'no-store' });
            configured = status.configured;
            connected = status.connected;
            if (!configured) setStatus('Google Drive OAuth 클라이언트 자격 증명이 설정되지 않았습니다. 앱을 업데이트한 뒤 다시 시도해 주세요.', true);
            else if (connected) setStatus('Google Drive 연결됨. 환경과 배경은 사용자 Drive의 Subcast 폴더에 저장됩니다.');
            else if (status.error) setStatus(status.error, true);
            else setStatus(status.pending ? '브라우저에서 Google 계정 권한을 승인해 주세요.' : 'Google Drive 연결이 필요합니다.');
            buttons();
            return status;
        } catch (error) { connected = false; buttons(); setStatus(error.message, true); return null; }
    }
    function cancelConfirmation() {
        byId('cloud-confirm').hidden = true;
        const action = confirmAction;
        confirmAction = null;
        if (action) byId(action === 'sync' ? 'btn-drive-backup' : 'btn-drive-restore').focus();
    }
    function closeModal() {
        modal.classList.remove('show');
        clearInterval(statusPoll);
        cancelConfirmation();
        returnFocusTo?.focus();
        if (operationStatus) renderOperation(operationStatus);
    }
    function selectTab(name) {
        cancelConfirmation();
        for (const tab of ['sync', 'restore']) {
            const active = tab === name;
            byId(`cloud-tab-${tab}`).setAttribute('aria-selected', String(active));
            byId(`cloud-tab-${tab}`).tabIndex = active ? 0 : -1;
            byId(`cloud-panel-${tab}`).hidden = !active;
        }
    }
    for (const name of ['sync', 'restore']) {
        byId(`cloud-tab-${name}`).addEventListener('click', () => selectTab(name));
        byId(`cloud-tab-${name}`).addEventListener('keydown', event => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const next = event.key === 'Home' ? 'sync' : event.key === 'End' ? 'restore' : name === 'sync' ? 'restore' : 'sync';
                selectTab(next); byId(`cloud-tab-${next}`).focus();
            }
        });
    }
    byId('btn-open-cloud-backup').addEventListener('click', async () => {
        returnFocusTo = document.activeElement;
        modal.classList.add('show');
        if (operationStatus) renderOperation(operationStatus);
        byId('btn-close-cloud-modal').focus();
        const status = await refreshStatus();
        if (status?.connected && !busy) await loadEnvironment();
        if (operationStatus) renderOperation(operationStatus);
    });
    byId('btn-close-cloud-modal').addEventListener('click', closeModal);
    modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
    document.addEventListener('keydown', event => {
        if (!modal.classList.contains('show')) return;
        if (event.key === 'Escape') { if (!byId('cloud-confirm').hidden) cancelConfirmation(); else closeModal(); }
        if (event.key === 'Tab') {
            const focusable = [...modal.querySelectorAll('button:not(:disabled), [tabindex="0"]')].filter(element => element.getClientRects().length);
            const first = focusable[0], last = focusable.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
    });
    byId('btn-drive-connect').addEventListener('click', async () => {
        const authWindow = window.open('about:blank', '_blank');
        if (!authWindow) return setStatus('브라우저 팝업이 차단되었습니다. 팝업을 허용한 뒤 다시 연결해 주세요.', true);
        try {
            const data = await request('/api/cloud/drive/connect', { method: 'POST' });
            authWindow.location = data.authorizationUrl;
            setStatus('새 브라우저 창에서 Google 계정 권한을 승인해 주세요.');
            let attempts = 0;
            clearInterval(statusPoll);
            statusPoll = setInterval(async () => {
                attempts++;
                const status = await refreshStatus();
                if (status?.connected) { clearInterval(statusPoll); await loadEnvironment(); }
                else if (status?.error || attempts >= 120) clearInterval(statusPoll);
            }, 1500);
        } catch (error) { authWindow.close(); setStatus(error.message, true); }
    });
    byId('btn-drive-refresh').addEventListener('click', loadEnvironment);
    byId('btn-drive-disconnect').addEventListener('click', async () => {
        busy = true; buttons();
        try {
            await request('/api/cloud/drive/connect', { method: 'DELETE' });
            clearInterval(statusPoll); requestGeneration++; environment = null;
            for (const id of ['cloud-background-list', 'cloud-remote-list', 'cloud-local-summary', 'cloud-remote-summary', 'cloud-change-summary', 'cloud-local-settings', 'cloud-remote-settings', 'cloud-settings-state']) byId(id).textContent = '';
            cancelConfirmation(); await refreshStatus();
        } catch (error) { setStatus(error.message, true); }
        finally { busy = false; buttons(); }
    });
    function confirmOperation(action) {
        confirmAction = action;
        byId('cloud-confirm-title').textContent = action === 'sync' ? '이 PC 기준으로 Drive를 동기화할까요?' : 'Drive 환경을 이 PC에 적용할까요?';
        const changes = environment.changes || {};
        byId('cloud-confirm-description').textContent = action === 'sync'
            ? `추가 ${(changes.added || []).length}개 · 변경 ${(changes.updated || []).length}개를 업로드하고, 삭제 ${(changes.removed || []).length}개를 Drive에서 제거합니다. 공통 설정도 이 PC의 값으로 저장됩니다.`
            : '이 PC의 공통 설정과 배경 전체를 Drive의 환경으로 교체합니다. 프로젝트와 슬라이드는 유지되며, 복원에 실패하면 기존 환경으로 되돌립니다.';
        byId('cloud-confirm').hidden = false;
        byId('btn-cloud-confirm-cancel').focus();
    }
    byId('btn-drive-backup').addEventListener('click', () => confirmOperation('sync'));
    byId('btn-drive-restore').addEventListener('click', () => confirmOperation('restore'));
    byId('btn-cloud-confirm-cancel').addEventListener('click', cancelConfirmation);
    byId('btn-cloud-confirm-submit').addEventListener('click', async () => {
        if (busy || !environment || !confirmAction) return;
        const action = confirmAction;
        const operationId = crypto.randomUUID();
        const body = { baseRevision: environment.revision || environment.remote?.revision || null, operationId };
        if (action === 'sync') body.browserSettings = readBrowserSettings();
        busy = true; cancelConfirmation(); buttons();
        activeOperationId = operationId;
        localStorage.setItem(operationStorageKey, operationId);
        renderOperation({ operationId, action, status: 'running', phase: 'preparing', percent: 1,
            message: action === 'sync' ? '환경과 배경을 준비하고 있습니다.' : 'Drive 환경을 준비하고 있습니다.',
            transferredBytes: 0, totalBytes: 0, completedItems: 0, totalItems: 0 });
        try {
            const accepted = await request(`/api/cloud/drive/environment/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (accepted.operationId !== operationId) throw new Error('Drive 작업을 등록하지 못했습니다.');
            void pollOperation(operationId);
        } catch (error) {
            if (error.status === 409) await loadEnvironment();
            renderOperation({ ...(operationStatus || {}), action, status: 'failed', message: error.message });
            activeOperationId = null;
            localStorage.removeItem(operationStorageKey);
            setStatus(error.message, true);
        } finally { busy = false; buttons(); }
    });
    byId('btn-cloud-operation-open').addEventListener('click', () => byId('btn-open-cloud-backup').click());
    byId('btn-cloud-operation-dismiss').addEventListener('click', () => {
        operationStatus = null;
        byId('cloud-operation-indicator').hidden = true;
    });
    buttons();
    if (activeOperationId) {
        busy = true;
        renderOperation({ operationId: activeOperationId, action: 'sync', status: 'running', percent: 0,
            message: 'Drive 작업 상태를 불러오고 있습니다.', transferredBytes: 0, totalBytes: 0,
            completedItems: 0, totalItems: 0 });
        void pollOperation(activeOperationId);
    }
});
