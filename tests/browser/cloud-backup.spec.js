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
    await page.route('**/api/cloud/drive/environment/sync', route => {
        sent.push(route.request().postDataJSON());
        return route.fulfill({ json: { revision: 'revision-2', backgroundCount: 2, backgroundBytes: 2097152 } });
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
    expect(sent).toEqual([{ baseRevision: 'revision-1', browserSettings: { monitorSettings: { textColor: '#abc123' }, broadcastLayout: null } }]);
});

test('SC-18-04 원격 변경 409는 재조회하고 파괴적 동기화를 자동 재시도하지 않는다', async ({ page }) => {
    const data = environment();
    let syncCalls = 0;
    await page.route('**/api/cloud/drive/environment/sync', route => {
        syncCalls++; data.needsRestore = true; data.revision = 'revision-2';
        return route.fulfill({ status: 409, json: { detail: '다른 PC에서 환경이 변경되었습니다.' } });
    });
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
        return route.fulfill({ json: { revision: 'revision-1', browserSettings: { monitorSettings: { textColor: '#123456' }, broadcastLayout: { width: 900 } } } });
    });
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
    expect(body).toEqual({ baseRevision: 'revision-1' });
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
