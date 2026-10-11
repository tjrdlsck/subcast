const { test, expect } = require('./fixtures');

test('SC-18-01 Drive 미설정 상태에서도 백업 안내를 표시하고 로컬 프로젝트 목록을 유지한다', async ({ page }) => {
    await page.route('**/api/cloud/drive/status', route => route.fulfill({
        json: { configured: false, connected: false, pending: false },
    }));

    await page.goto('/');
    await expect(page.locator('.project-item[data-id="proj_browser"]')).toBeVisible();
    await page.locator('#btn-open-cloud-backup').click();

    const modal = page.locator('#cloud-backup-modal');
    await expect(modal).toBeVisible();
    await expect(page.locator('#cloud-drive-status')).toContainText('OAuth 클라이언트 자격 증명');
    await expect(page.locator('#btn-drive-connect')).toBeDisabled();
    await expect(page.locator('#btn-drive-backup')).toBeDisabled();

    await page.locator('#btn-close-cloud-modal').click();
    await expect(modal).toBeHidden();
    await expect(page.locator('.project-item[data-id="proj_browser"]')).toBeVisible();

    await page.locator('#btn-open-cloud-backup').click();
    await expect(modal).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
});

test('SC-18-02 연결 버튼은 팝업 승인 뒤 연결 상태와 백업 목록을 갱신한다', async ({ page }) => {
    let connected = false;
    let listedSnapshots = 0;
    await page.route('**/api/cloud/drive/status', route => route.fulfill({
        json: { configured: true, connected, pending: !connected },
    }));
    await page.route('**/api/cloud/drive/connect', route => route.request().method() === 'POST'
        ? route.fulfill({ json: { authorizationUrl: 'https://oauth.test/authorize' } })
        : route.fulfill({ json: { connected: false } }));
    await page.context().route('https://oauth.test/**', route => route.fulfill({ body: 'Fake OAuth consent page', contentType: 'text/html' }));
    await page.route('**/api/cloud/drive/snapshots', route => {
        listedSnapshots++;
        return route.fulfill({ json: { snapshots: [] } });
    });

    await page.goto('/');
    await page.locator('#btn-open-cloud-backup').click();
    await expect(page.locator('#cloud-drive-status')).toContainText('브라우저에서 Google 계정 권한을 승인해 주세요.');
    const popupPromise = page.waitForEvent('popup');
    await page.locator('#btn-drive-connect').click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL('https://oauth.test/authorize');

    connected = true;
    await expect(page.locator('#cloud-drive-status')).toContainText('Google Drive 연결됨', { timeout: 5000 });
    await expect(page.locator('#btn-drive-backup')).toBeEnabled();
    await expect.poll(() => listedSnapshots).toBeGreaterThan(0);
    await popup.close();
});

test('SC-18-03 백업은 선택 프로젝트와 기기 이름을 보내고 새 스냅샷을 표시한다', async ({ page }) => {
    let backupRequest;
    let snapshotListCalls = 0;
    const snapshots = [{
        fileId: 'drive-snapshot-1', snapshotId: 'snapshot-0001', parentSnapshotId: null,
        projectName: '브라우저 테스트', deviceLabel: '예배실 PC', createdAt: '2026-10-11T00:00:00Z', hasConflict: false,
    }];
    await page.route('**/api/projects', route => route.fulfill({ json: [
        { id: 'proj_browser', name: '브라우저 테스트', isActive: true, slideCount: 2 },
    ] }));
    await page.route('**/api/cloud/drive/status', route => route.fulfill({ json: { configured: true, connected: true } }));
    await page.route('**/api/cloud/drive/snapshots', route => {
        snapshotListCalls++;
        return route.fulfill({ json: { snapshots } });
    });
    await page.route('**/api/cloud/drive/projects/proj_browser/snapshots', async route => {
        backupRequest = { method: route.request().method(), body: route.request().postDataJSON() };
        snapshots.unshift({ ...snapshots[0], fileId: 'drive-snapshot-2', snapshotId: 'snapshot-0002', parentSnapshotId: 'snapshot-0001' });
        await route.fulfill({ json: {
            snapshot: { size: 2048, createdAt: '2026-10-11T01:00:00Z' }, heads: [],
        } });
    });

    await page.goto('/');
    await page.locator('#btn-open-cloud-backup').click();
    await page.locator('#cloud-device-label').fill('예배실 PC');
    await page.locator('#btn-drive-backup').click();

    await expect(page.locator('#cloud-drive-status')).toContainText('백업 완료');
    expect(backupRequest).toEqual({ method: 'POST', body: { deviceLabel: '예배실 PC' } });
    await expect(page.locator('[data-cloud-restore="drive-snapshot-2"]')).toBeVisible();
    await expect.poll(() => snapshotListCalls).toBeGreaterThan(1);
});

test('SC-18-04 스냅샷 목록은 분기를 표시하고 새로고침 실패를 알린다', async ({ page }) => {
    let listFails = false;
    await page.route('**/api/cloud/drive/status', route => route.fulfill({ json: { configured: true, connected: true } }));
    await page.route('**/api/cloud/drive/snapshots', route => listFails
        ? route.fulfill({ status: 502, json: { detail: 'Drive 목록 응답 오류' } })
        : route.fulfill({ json: { snapshots: [{
            fileId: 'branch-b', snapshotId: 'branch-b-snapshot', parentSnapshotId: 'base-snapshot',
            projectName: '기도회', deviceLabel: '다른 PC', createdAt: '2026-10-11T00:00:00Z', hasConflict: true,
        }] } }));

    await page.goto('/');
    await page.locator('#btn-open-cloud-backup').click();
    await expect(page.locator('.cloud-conflict-badge')).toHaveText('분기');
    await expect(page.locator('[data-cloud-restore="branch-b"]')).toBeVisible();

    listFails = true;
    await page.locator('#btn-drive-refresh').click();
    await expect(page.locator('#cloud-snapshot-list')).toContainText('Drive 목록 응답 오류');
});

test('SC-18-05 복원은 확인 후 새 프로젝트로 추가하고 기존 프로젝트를 유지한다', async ({ page }) => {
    const projects = [
        { id: 'proj_browser', name: '원본 프로젝트', isActive: true, slideCount: 2 },
    ];
    let restoreRequest;
    await page.route('**/api/projects', route => route.fulfill({ json: projects }));
    await page.route('**/api/cloud/drive/status', route => route.fulfill({ json: { configured: true, connected: true } }));
    await page.route('**/api/cloud/drive/snapshots', route => route.fulfill({ json: { snapshots: [{
        fileId: 'snapshot-to-restore', snapshotId: 'snapshot-restore', parentSnapshotId: null,
        projectName: '백업 프로젝트', deviceLabel: '기존 PC', createdAt: '2026-10-11T00:00:00Z', hasConflict: false,
    }] } }));
    await page.route('**/api/cloud/drive/restore', async route => {
        restoreRequest = route.request().postDataJSON();
        projects.push({ id: 'proj_restored', name: '백업 프로젝트 (복원)', isActive: false, slideCount: 2 });
        await route.fulfill({ json: { project: { id: 'proj_restored', name: '백업 프로젝트 (복원)' } } });
    });

    await page.goto('/');
    await page.locator('#btn-open-cloud-backup').click();
    let confirmCount = 0;
    page.once('dialog', async dialog => { confirmCount++; await dialog.accept(); });
    await page.locator('[data-cloud-restore="snapshot-to-restore"]').click();

    expect(confirmCount).toBe(1);
    expect(restoreRequest).toEqual({ fileId: 'snapshot-to-restore' });
    await expect(page.locator('#cloud-project-select')).toHaveValue('proj_restored');
    await expect(page.locator('#cloud-drive-status')).toContainText('새 프로젝트로 복원했습니다');
    expect(projects.map(project => project.id)).toEqual(['proj_browser', 'proj_restored']);
});

test('SC-18-06 백업·복원 실패는 안내하고 연결 해제 시 버튼을 잠근다', async ({ page }) => {
    let connected = true;
    await page.route('**/api/projects', route => route.fulfill({ json: [
        { id: 'proj_browser', name: '브라우저 테스트', isActive: true, slideCount: 2 },
    ] }));
    await page.route('**/api/cloud/drive/status', route => route.fulfill({ json: { configured: true, connected } }));
    await page.route('**/api/cloud/drive/snapshots', route => route.fulfill({ json: { snapshots: [{
        fileId: 'restore-fails', snapshotId: 'snapshot-bad', projectName: '백업 프로젝트',
        createdAt: '2026-10-11T00:00:00Z', hasConflict: false,
    }] } }));
    await page.route('**/api/cloud/drive/projects/proj_browser/snapshots', route =>
        route.fulfill({ status: 502, json: { detail: 'Drive 업로드 오류' } }));
    await page.route('**/api/cloud/drive/restore', route =>
        route.fulfill({ status: 400, json: { detail: '백업 체크섬 오류' } }));
    await page.route('**/api/cloud/drive/connect', route => {
        if (route.request().method() === 'DELETE') {
            connected = false;
            return route.fulfill({ json: { connected: false } });
        }
        return route.fulfill({ json: { authorizationUrl: 'https://oauth.test/authorize' } });
    });

    await page.goto('/');
    await page.locator('#btn-open-cloud-backup').click();
    await page.locator('#btn-drive-backup').click();
    await expect(page.locator('#cloud-drive-status')).toContainText('Drive 업로드 오류');
    await expect(page.locator('#btn-drive-backup')).toBeEnabled();

    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-cloud-restore="restore-fails"]').click();
    await expect(page.locator('#cloud-drive-status')).toContainText('백업 체크섬 오류');
    await expect(page.locator('[data-cloud-restore="restore-fails"]')).toBeEnabled();

    await page.locator('#btn-drive-disconnect').click();
    await expect(page.locator('#cloud-drive-status')).toContainText('Google Drive 연결이 필요합니다');
    await expect(page.locator('#btn-drive-backup')).toBeDisabled();
    await expect(page.locator('#btn-drive-refresh')).toBeDisabled();
    await expect(page.locator('#cloud-snapshot-list')).toBeEmpty();
});
