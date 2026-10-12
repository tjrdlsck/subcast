const { test, expect } = require('./fixtures');
const video = (name, size = 1048576) => ({ name, title: name, size });
function environment() {
    const same = video('same.mp4'), added = video('new.mp4'), removed = video('deleted.mp4');
    return { exists: true, revision: 'revision-1', needsRestore: false,
        local: { settingsSize: 2048, backgroundCount: 2, backgroundBytes: 2097152, backgrounds: [same, added] },
        remote: { revision: 'revision-1', settingsSize: 1024, backgroundCount: 2, backgroundBytes: 2097152, backgrounds: [same, removed] },
        changes: { added: [added], updated: [], removed: [removed] } };
}
async function connected(page, data = environment()) {
    await page.route('**/api/cloud/drive/status', route => route.fulfill({ json: { configured: true, connected: true } }));
    await page.route('**/api/cloud/drive/environment', route => route.fulfill({ json: data }));
    await page.goto('/');
    await page.locator('#btn-open-cloud-backup').click();
    await expect(page.locator('#btn-drive-backup')).toBeEnabled();
}

test('SC-18-01 미설정 안내와 닫기·Escape·포커스 복귀는 로컬 프로젝트를 유지한다', async ({ page }) => {
    await page.route('**/api/cloud/drive/status', route => route.fulfill({ json: { configured: false, connected: false } }));
    await page.goto('/');
    await page.locator('#btn-open-cloud-backup').click();
    await expect(page.locator('#cloud-drive-status')).toContainText('OAuth 클라이언트 자격 증명');
    await expect(page.locator('#btn-drive-connect')).toBeDisabled();
    await expect(page.locator('#btn-drive-backup')).toBeDisabled();
    await page.locator('#btn-close-cloud-modal').click();
    await expect(page.locator('#cloud-backup-modal')).toBeHidden();
    await expect(page.locator('#btn-open-cloud-backup')).toBeFocused();
    await page.locator('#btn-open-cloud-backup').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#cloud-backup-modal')).toBeHidden();
    await expect(page.locator('.project-item[data-id="proj_browser"]')).toBeVisible();
});

test('SC-18-02 OAuth 팝업 승인 후 환경을 불러온다', async ({ page }) => {
    let linked = false;
    await page.route('**/api/cloud/drive/status', route => route.fulfill({ json: { configured: true, connected: linked, pending: !linked } }));
    await page.route('**/api/cloud/drive/connect', route => route.fulfill({ json: { authorizationUrl: 'https://oauth.test/authorize' } }));
    await page.context().route('https://oauth.test/**', route => route.fulfill({ body: 'OAuth test', contentType: 'text/html' }));
    await page.route('**/api/cloud/drive/environment', route => route.fulfill({ json: environment() }));
    await page.goto('/');
    await page.locator('#btn-open-cloud-backup').click();
    const popupPromise = page.waitForEvent('popup');
    await page.locator('#btn-drive-connect').click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL('https://oauth.test/authorize');
    linked = true;
    await expect(page.locator('#btn-drive-backup')).toBeEnabled({ timeout: 5000 });
    await expect(page.locator('#cloud-background-list')).toContainText('new.mp4');
    await popup.close();
});

test('SC-18-03 전체 배경 크기·추가·삭제 표시와 취소 후 명시적 동기화를 검증한다', async ({ page }) => {
    let sent = [];
    let accepted = false;
    await page.route('**/api/cloud/drive/environment/sync', route => {
        sent.push(route.request().postDataJSON());
        accepted = true;
        return route.fulfill({ status: 202, json: { operationId: sent.at(-1).operationId, status: 'running' } });
    });
    await page.route('**/api/cloud/drive/environment/operations/*', route => {
        expect(accepted).toBe(true);
        return route.fulfill({ json: { operationId: sent.at(-1).operationId, action: 'sync', status: 'completed', percent: 100,
            result: { revision: 'revision-2', backgroundCount: 2, backgroundBytes: 2097152 } } });
    });
    await connected(page);
    await page.evaluate(() => localStorage.setItem('subcast_monitor_settings', JSON.stringify({ textColor: '#abc123' })));
    await expect(page.locator('#cloud-local-summary')).toHaveText('공통 설정 2.0 KB · 배경 2개 · 2.0 MB');
    await expect(page.locator('[data-state="added"]')).toHaveText('Drive에 추가');
    await expect(page.locator('[data-state="removed"]')).toHaveText('Drive에서 삭제');
    await page.locator('#btn-drive-backup').click();
    await expect(page.locator('#cloud-confirm-description')).toContainText('삭제 1개를 Drive에서 제거');
    await page.locator('#btn-cloud-confirm-cancel').click();
    expect(sent).toHaveLength(0);
    await page.locator('#btn-drive-backup').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#cloud-backup-modal')).toBeVisible();
    await expect(page.locator('#cloud-confirm')).toBeHidden();
    await page.locator('#btn-drive-backup').click();
    await page.locator('#btn-cloud-confirm-submit').click();
    await expect(page.locator('#cloud-drive-status')).toContainText('동기화 완료');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ baseRevision: 'revision-1', browserSettings: { monitorSettings: { textColor: '#abc123' }, broadcastLayout: null } });
    expect(typeof sent[0].operationId).toBe('string');
    expect(sent[0].operationId.length).toBeGreaterThan(0);
});

test('SC-18-04 원격 변경 409는 재조회하고 파괴적 동기화를 자동 재시도하지 않는다', async ({ page }) => {
    const data = environment();
    let syncCalls = 0;
    await page.route('**/api/cloud/drive/environment/sync', route => {
        syncCalls++; data.needsRestore = true; data.revision = 'revision-2';
        return route.fulfill({ status: 202, json: { operationId: route.request().postDataJSON().operationId, status: 'running' } });
    });
    await page.route('**/api/cloud/drive/environment/operations/*', route => route.fulfill({ json: {
        operationId: route.request().url().split('/').at(-1), action: 'sync', status: 'failed', percent: 1,
        errorStatus: 409, message: '다른 PC에서 환경이 변경되었습니다.',
    } }));
    await connected(page, data);
    await page.locator('#btn-drive-backup').click();
    await page.locator('#btn-cloud-confirm-submit').click();
    await expect(page.locator('#cloud-drive-status')).toContainText('다른 PC');
    await expect(page.locator('#btn-drive-backup')).toBeDisabled();
    expect(syncCalls).toBe(1);
    await expect(page.locator('#cloud-change-summary')).toContainText('먼저 Drive 환경');
});

test('SC-18-05 복원 확인·취소와 브라우저 공통 설정 적용은 프로젝트를 유지한다', async ({ page }) => {
    let body;
    await page.route('**/api/cloud/drive/environment/restore', route => {
        body = route.request().postDataJSON();
        return route.fulfill({ status: 202, json: { operationId: body.operationId, status: 'running' } });
    });
    await page.route('**/api/cloud/drive/environment/operations/*', route => route.fulfill({ json: {
        operationId: body.operationId, action: 'restore', status: 'completed', percent: 100,
        result: { revision: 'revision-1', browserSettings: { monitorSettings: { textColor: '#123456' }, broadcastLayout: { width: 900 } } },
    } }));
    await connected(page);
    await page.locator('#cloud-tab-restore').click();
    await expect(page.locator('#cloud-panel-sync')).toBeHidden();
    await expect(page.locator('#cloud-remote-list')).toContainText('deleted.mp4');
    await page.locator('#btn-drive-restore').click();
    await expect(page.locator('#cloud-confirm-description')).toContainText('교체');
    await page.locator('#btn-cloud-confirm-cancel').click();
    expect(body).toBeUndefined();
    await page.locator('#btn-drive-restore').click();
    await page.locator('#btn-cloud-confirm-submit').click();
    await expect(page.locator('#cloud-drive-status')).toContainText('적용했습니다');
    expect(body).toMatchObject({ baseRevision: 'revision-1' });
    expect(typeof body.operationId).toBe('string');
    expect(body.operationId.length).toBeGreaterThan(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('subcast_monitor_settings')))).toEqual({ textColor: '#123456' });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('subcast_praise_broadcast_layout')))).toEqual({ width: 900 });
    await page.locator('#btn-close-cloud-modal').click();
    await expect(page.locator('.project-item[data-id="proj_browser"]')).toBeVisible();
});

test('SC-18-06 동기화·복원 실패는 이전 브라우저 설정을 유지하고 연결 해제는 목록을 비운다', async ({ page }) => {
    let linked = true;
    await connected(page);
    await page.route('**/api/cloud/drive/status', route => route.fulfill({ json: { configured: true, connected: linked } }));
    await page.route('**/api/cloud/drive/environment/sync', route => route.fulfill({ status: 502, json: { detail: 'Drive 업로드 오류' } }));
    await page.route('**/api/cloud/drive/environment/restore', route => route.fulfill({ status: 400, json: { detail: '배경 체크섬 오류' } }));
    await page.route('**/api/cloud/drive/connect', route => { linked = false; return route.fulfill({ json: { connected: false } }); });
    await page.evaluate(() => localStorage.setItem('subcast_monitor_settings', '{"original":true}'));
    await page.locator('#btn-drive-backup').click();
    await page.locator('#btn-cloud-confirm-submit').click();
    await expect(page.locator('#cloud-drive-status')).toContainText('Drive 업로드 오류');
    await expect(page.locator('#btn-drive-backup')).toBeEnabled();
    await page.locator('#cloud-tab-restore').click();
    await page.locator('#btn-drive-restore').click();
    await page.locator('#btn-cloud-confirm-submit').click();
    await expect(page.locator('#cloud-drive-status')).toContainText('체크섬 오류');
    expect(await page.evaluate(() => localStorage.getItem('subcast_monitor_settings'))).toBe('{"original":true}');
    await page.locator('#btn-drive-disconnect').click();
    await expect(page.locator('#btn-drive-backup')).toBeDisabled();
    await expect(page.locator('#btn-drive-restore')).toBeDisabled();
    await expect(page.locator('#cloud-background-list')).toBeEmpty();
    await expect(page.locator('#cloud-drive-status')).toContainText('연결이 필요');
});

test('SC-18-07 새로고침 실패·빈 라이브러리·키보드 탭·좁은 화면을 검증한다', async ({ page }) => {
    const data = environment();
    data.local = { settingsSize: 0, backgroundCount: 0, backgroundBytes: 0, backgrounds: [] };
    data.changes = { added: [], updated: [], removed: [] }; data.exists = false;
    await connected(page, data);
    await expect(page.locator('#cloud-background-list')).toContainText('배경이 없습니다');
    await page.locator('#cloud-tab-sync').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#cloud-tab-restore')).toBeFocused();
    await expect(page.locator('#btn-drive-restore')).toBeDisabled();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.locator('.cloud-backup-modal-box').evaluate(element => { const bounds = element.getBoundingClientRect(); return bounds.left >= 0 && bounds.right <= innerWidth && element.scrollWidth <= element.clientWidth; })).toBe(true);
    await page.route('**/api/cloud/drive/environment', route => route.fulfill({ status: 502, json: { detail: 'Drive 환경 조회 오류' } }));
    await page.locator('#btn-drive-refresh').click();
    await expect(page.locator('#cloud-drive-status')).toContainText('조회 오류');
    await expect(page.locator('#btn-drive-backup')).toBeDisabled();
});

test('SC-18-08 설정 구성요소를 모두 표시하고 배경 목록은 정해진 높이에서 스크롤된다', async ({ page }) => {
    const data = environment();
    data.local.settingsSummary = { praiseSongs: 12, templates: 3, moodTags: 5, importTagMappings: 2,
        monitorSettings: true, browserMonitorSettings: true, broadcastLayout: true };
    data.remote.settingsSummary = { praiseSongs: 10, templates: 2, moodTags: 4, importTagMappings: 1,
        monitorSettings: true, browserMonitorSettings: false, broadcastLayout: true };
    data.local.backgrounds = Array.from({ length: 24 }, (_, index) => video(`local-${index}.mp4`));
    await page.addInitScript(() => {
        localStorage.setItem('subcast_monitor_settings', JSON.stringify({ textColor: '#fefefe' }));
        localStorage.setItem('subcast_praise_broadcast_layout', JSON.stringify({ width: 1920 }));
    });
    await connected(page, data);

    await expect(page.locator('#cloud-local-settings')).toContainText('찬양곡 12개');
    await expect(page.locator('#cloud-local-settings')).toContainText('브라우저 모니터 설정 있음');
    await expect(page.locator('#cloud-local-settings')).toContainText('방송 화면 설정 있음');
    await expect(page.locator('#cloud-remote-settings')).toContainText('태그 연결 1개');
    await expect(page.locator('#cloud-settings-state')).toContainText('브라우저 설정은 동기화 때 포함');
    const list = page.locator('#cloud-background-list');
    const metrics = await list.evaluate(element => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overflowY: getComputedStyle(element).overflowY,
        modalWidth: document.querySelector('.cloud-backup-modal-box').getBoundingClientRect().width,
    }));
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
    expect(metrics.overflowY).toBe('auto');
    expect(metrics.modalWidth).toBeGreaterThan(680);
});

test('SC-18-09 모달을 닫아도 실제 진행률을 보고 완료 후 다시 열 수 있다', async ({ page }) => {
    let syncFinished = false;
    let polls = 0;
    await page.route('**/api/cloud/drive/environment/operations/*', route => {
        polls++;
        const completed = syncFinished;
        return route.fulfill({ json: {
            operationId: 'operation-1', action: 'sync', status: completed ? 'completed' : 'running',
            phase: completed ? 'complete' : 'uploading', percent: completed ? 100 : 38,
            message: completed ? '환경 작업을 완료했습니다.' : '변경된 배경을 Drive에 올리고 있습니다.',
            transferredBytes: completed ? 1048576 : 398458, totalBytes: 1048576,
            completedItems: completed ? 1 : 0, totalItems: 1, currentFile: 'large-video.mp4',
        } });
    });
    await page.route('**/api/cloud/drive/environment/sync', async route => {
        setTimeout(() => { syncFinished = true; }, 1600);
        await route.fulfill({ status: 202, json: { operationId: route.request().postDataJSON().operationId, status: 'running' } });
    });
    await connected(page);
    await page.locator('#btn-drive-backup').click();
    await page.locator('#btn-cloud-confirm-submit').click();
    await expect(page.locator('#cloud-operation-percent')).toHaveText('38%');
    await page.locator('#btn-close-cloud-modal').click();
    await expect(page.locator('#cloud-backup-modal')).toBeHidden();
    await expect(page.locator('#cloud-operation-indicator')).toBeVisible();
    await expect(page.locator('#cloud-operation-detail')).toContainText('large-video.mp4');
    await expect(page.locator('#cloud-operation-percent')).toHaveText('100%', { timeout: 5000 });
    await expect(page.locator('#btn-cloud-operation-dismiss')).toBeVisible();
    expect(polls).toBeGreaterThan(1);
    await page.locator('#btn-cloud-operation-open').click();
    await expect(page.locator('#cloud-backup-modal')).toBeVisible();
    await expect(page.locator('#cloud-drive-status')).toContainText('완료');
});

test('SC-18-10 Drive 작업은 등록 응답 뒤에만 상태를 조회하고 404 없이 완료한다', async ({ page }) => {
    const requestOrder = [];
    let accepted = false;
    let operationId;
    page.on('response', response => {
        if (response.url().includes('/api/cloud/drive/environment/operations/')) {
            requestOrder.push({ type: 'poll', status: response.status(), afterAcceptance: accepted });
        }
    });
    await page.route('**/api/cloud/drive/environment/sync', route => {
        requestOrder.push({ type: 'start' });
        operationId = route.request().postDataJSON().operationId;
        accepted = true;
        return route.fulfill({ status: 202, json: { operationId, status: 'running' } });
    });
    await page.route('**/api/cloud/drive/environment/operations/*', route => route.fulfill({ json: {
        operationId, action: 'sync', status: 'completed', percent: 100,
        result: { revision: 'revision-2', backgroundCount: 2, backgroundBytes: 2097152 },
    } }));
    await connected(page);
    await page.locator('#btn-drive-backup').click();
    await page.locator('#btn-cloud-confirm-submit').click();
    await expect(page.locator('#cloud-drive-status')).toContainText('동기화 완료');
    expect(requestOrder[0]).toEqual({ type: 'start' });
    expect(requestOrder.length).toBeGreaterThan(1);
    expect(requestOrder.slice(1).every(item => item.type === 'poll' && item.status === 200 && item.afterAcceptance)).toBe(true);
});

test('SC-18-11 변경 없는 동기화는 Drive 저장을 생략했다고 안내한다', async ({ page }) => {
    let operationId;
    await page.route('**/api/cloud/drive/environment/sync', route => {
        operationId = route.request().postDataJSON().operationId;
        return route.fulfill({ status: 202, json: { operationId, status: 'running' } });
    });
    await page.route('**/api/cloud/drive/environment/operations/*', route => route.fulfill({ json: {
        operationId, action: 'sync', status: 'completed', percent: 100,
        result: { revision: 'revision-1', backgroundCount: 2, backgroundBytes: 2097152, unchanged: true },
    } }));
    await connected(page);
    await page.locator('#btn-drive-backup').click();
    await page.locator('#btn-cloud-confirm-submit').click();
    await expect(page.locator('#cloud-drive-status')).toContainText('변경 사항이 없어 Drive 저장을 생략했습니다.');
});
