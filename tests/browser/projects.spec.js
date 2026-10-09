const fs = require('node:fs/promises');
const { test, expect, openEditor } = require('./fixtures');
const item = (page, id = 'proj_browser') => page.locator(`.project-item[data-id="${id}"]`);
async function list(app) { return (await app.request.get('/api/projects')).json(); }
async function openList(page) { await page.goto('/'); await expect(item(page)).toBeVisible(); }
async function create(page, name) {
    await page.locator('#btn-open-create-modal').click();
    await page.locator('#new-project-name').fill(name);
    await page.locator('#btn-submit-create').click();
}
async function second(app) {
    const response = await app.request.post('/api/projects', { data: { name: '비교 프로젝트 B' } });
    expect(response.ok()).toBe(true);
    return (await response.json()).id;
}

test('SC-01-01 UI 프로젝트 생성과 서버 재실행', async ({ page, app }) => {
    await openList(page);
    await create(page, '테스트 예배 A');
    const created = page.locator('.project-item').filter({ hasText: '테스트 예배 A' });
    await expect(created).toBeVisible();
    const id = await created.getAttribute('data-id');
    await created.locator('.btn-editor').click();
    await expect(page).toHaveURL(/editor.html/);
    await expect.poll(() => page.evaluate(() => typeof projectData !== 'undefined' && projectData?.name)).toBe('테스트 예배 A');
    await expect.poll(() => page.evaluate(() => Boolean(activeSlideId && lockedSlides[activeSlideId]?.ownerId === myEditorId))).toBe(true);
    const beforeSlides = (await app.exportProject(id)).slides.length;
    await page.locator('#btn-add-slide').click();
    await expect.poll(async () => (await app.exportProject(id)).slides.length).toBe(beforeSlides + 1);
    await app.restart();
    await page.goto('/');
    await expect(item(page, id)).toContainText('테스트 예배 A');
    expect((await app.exportProject(id)).slides).toHaveLength(beforeSlides + 1);
    expect((await list(app)).filter(project => project.name === '테스트 예배 A')).toHaveLength(1);
});

test('SC-01-02 프로젝트 전환은 저장 내용을 분리한다', async ({ page, app }) => {
    const idB = await second(app);
    const original = await app.exportProject('proj_browser');
    await openList(page);
    await item(page, idB).locator('.btn-select').click();
    await expect(item(page, idB)).toHaveClass(/active/);
    await item(page, idB).locator('.btn-editor').click();
    await expect(page).toHaveURL(/editor.html/);
    await expect(page.locator('#btn-add-slide')).toBeEnabled();
    await expect.poll(() => page.evaluate(() => typeof activeSlideId !== 'undefined' && Boolean(activeSlideId && lockedSlides[activeSlideId]?.ownerId === myEditorId))).toBe(true);
    await page.locator('[data-target="panel-text"]').click();
    await page.locator('#btn-add-text-body').click();
    await page.locator('#text-editor').fill('프로젝트 B에만 저장할 본문');
    await page.locator('#text-editor').press('Tab');
    await expect.poll(async () => (await app.exportProject(idB)).slides.some(slide => slide.elements.some(element => element.content === '프로젝트 B에만 저장할 본문'))).toBe(true);
    await page.goto('/');
    await item(page).locator('.btn-select').click();
    await expect(item(page)).toHaveClass(/active/);
    expect((await app.exportProject('proj_browser')).slides).toEqual(original.slides);
    expect((await app.exportProject(idB)).name).toBe('비교 프로젝트 B');
});

for (const commit of [true, false]) {
    test(`SC-01-03 이름 변경 ${commit ? '확정' : '취소'}`, async ({ page, app }) => {
        await openList(page);
        await item(page).locator('.project-name').dblclick();
        await page.locator('.project-name-input').fill('수정한 프로젝트 이름');
        await page.locator('.project-name-input').press(commit ? 'Enter' : 'Escape');
        const expected = commit ? '수정한 프로젝트 이름' : '브라우저 테스트';
        await expect(item(page).locator('.project-name')).toHaveText(expected);
        expect((await app.exportProject('proj_browser')).name).toBe(expected);
    });
}

for (const name of ['', '   ', '브라우저 테스트']) {
    test(`SC-01-03 새 이름 입력 거부 ${JSON.stringify(name)}`, async ({ page, app }) => {
        await openList(page);
        const before = await list(app);
        const dialogPromise = page.waitForEvent('dialog');
        const creation = create(page, name);
        const dialog = await dialogPromise;
        expect(dialog.message()).toMatch(/이름|이미 존재/);
        await dialog.accept();
        await creation;
        expect(await list(app)).toEqual(before);
    });
}

for (const count of [1, 2]) {
    test(`SC-01-04 ${count}개 프로젝트 Ctrl+C/V 복제`, async ({ page, app }) => {
        const idB = count === 2 ? await second(app) : null;
        const before = await list(app);
        const originals = await Promise.all(before.map(project => app.exportProject(project.id)));
        await openList(page);
        await item(page).click();
        if (idB) await item(page, idB).click({ modifiers: ['Control'] });
        await page.keyboard.press('Control+c');
        await page.keyboard.press('Control+v');
        await expect(page.locator('.project-item')).toHaveCount(before.length + count);
        const copies = (await list(app)).filter(project => !before.some(original => original.id === project.id));
        expect(copies).toHaveLength(count);
        for (const copy of copies) {
            const exported = await app.exportProject(copy.id);
            expect(originals.some(original => JSON.stringify(original.slides.map(slide => slide.elements)) === JSON.stringify(exported.slides.map(slide => slide.elements)))).toBe(true);
        }
        expect((await app.exportProject('proj_browser')).slides).toEqual(originals.find(project => project.id === 'proj_browser').slides);
    });
}

for (const accept of [false, true]) {
    test(`SC-01-05 프로젝트 삭제 ${accept ? '확정' : '취소'}`, async ({ page, app }) => {
        const idB = await second(app);
        await openList(page);
        page.once('dialog', dialog => accept ? dialog.accept() : dialog.dismiss());
        await item(page, idB).locator('.btn-delete').click();
        await expect(page.locator('.project-item')).toHaveCount(accept ? 1 : 2);
        expect((await list(app)).some(project => project.id === idB)).toBe(!accept);
        expect((await app.exportProject('proj_browser')).slides).toHaveLength(2);
    });
}

for (const count of [1, 2]) {
    test(`SC-02-01 ${count}개 프로젝트 UI 내보내기와 가져오기 왕복`, async ({ page, app }) => {
        const idB = count === 2 ? await second(app) : null;
        await openList(page);
        const before = await list(app);
        const downloadPromise = page.waitForEvent('download');
        if (count === 1) await item(page).locator('.btn-export').click();
        else {
            await item(page).click();
            await item(page, idB).click({ modifiers: ['Control'] });
            await page.locator('#btn-export-selected').click();
        }
        const download = await downloadPromise;
        const bytes = await fs.readFile(await download.path());
        const exported = JSON.parse(bytes.toString('utf8'));
        expect(Array.isArray(exported) ? exported.length : 1).toBe(count);
        await page.locator('#file-import-project').setInputFiles({ name: 'roundtrip.json', mimeType: 'application/json', buffer: bytes });
        await expect(page.locator('#project-import-tag-modal')).toHaveClass(/show/);
        await page.locator('#btn-confirm-project-import').click();
        await expect(page.locator('.project-item')).toHaveCount(before.length + count);
        const imported = (await list(app)).filter(project => !before.some(original => original.id === project.id));
        expect(imported).toHaveLength(count);
        const expectedProjects = Array.isArray(exported) ? exported : [exported];
        for (const project of imported) {
            const data = await app.exportProject(project.id);
            expect(expectedProjects.some(expected => JSON.stringify(expected.slides.map(slide => slide.elements)) === JSON.stringify(data.slides.map(slide => slide.elements)))).toBe(true);
        }
    });
}

test('SC-02-04 가져오기 취소는 프로젝트를 추가하지 않는다', async ({ page, app }) => {
    const exported = await app.exportProject('proj_browser');
    await openList(page);
    const before = await list(app);
    await page.locator('#file-import-project').setInputFiles({ name: 'cancel.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
    await expect(page.locator('#project-import-tag-modal')).toHaveClass(/show/);
    await page.locator('#btn-cancel-project-import').click();
    await expect(page.locator('#project-import-tag-modal')).not.toHaveClass(/show/);
    expect(await list(app)).toEqual(before);
});

test('SC-02-05 JSON 문법 오류는 기존 프로젝트를 보존한다', async ({ page, app }) => {
    await openList(page);
    const before = await app.exportProject('proj_browser');
    const dialogPromise = page.waitForEvent('dialog');
    const upload = page.locator('#file-import-project').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{ broken') });
    const dialog = await dialogPromise;
    expect(dialog.message()).toContain('읽지 못했습니다');
    await dialog.accept();
    await upload;
    expect(await app.exportProject('proj_browser')).toEqual(before);
    await openEditor(page);
    await expect(page.locator('.slide-item')).toHaveCount(2);
});

test('SC-02-02 동일 파일을 두 번 가져오면 독립 ID를 가진다', async ({ page, app }) => {
    const original = await app.exportProject();
    await openList(page);
    const file = { name: 'repeat.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(original)) };
    for (const count of [2, 3]) {
        await page.locator('#file-import-project').setInputFiles(file);
        await expect(page.locator('#project-import-tag-modal')).toHaveClass(/show/);
        await page.locator('#btn-confirm-project-import').click();
        await expect(page.locator('.project-item')).toHaveCount(count);
    }
    const projects = await list(app);
    expect(new Set(projects.map(project => project.id)).size).toBe(3);
    const imported = projects.find(project => project.id !== 'proj_browser');
    await item(page, imported.id).locator('.project-name').dblclick();
    await page.locator('.project-name-input').fill('가져온 프로젝트만 변경');
    await page.locator('.project-name-input').press('Enter');
    await expect(item(page, imported.id)).toContainText('가져온 프로젝트만 변경');
    expect((await app.exportProject()).name).toBe(original.name);
    expect((await app.exportProject()).slides).toEqual(original.slides);
});

test('SC-02-03 외부 태그 연결은 저장되고 다음 가져오기에 재사용된다', async ({ page, app }) => {
    const response = await app.request.post('/api/tags', { data: { name: '로컬잔잔' } });
    expect(response.ok()).toBe(true);
    const external = await app.exportProject();
    external.slides[0].moods = ['외부잔잔'];
    external.slides[0].mood = '외부잔잔';
    const file = { name: 'external.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(external)) };
    await openList(page);
    await page.locator('#file-import-project').setInputFiles(file);
    await expect(page.locator('#project-import-tag-modal')).toHaveClass(/show/);
    await page.getByLabel('외부잔잔 태그 연결').selectOption('로컬잔잔');
    await page.locator('#btn-confirm-project-import').click();
    await expect(page.locator('.project-item')).toHaveCount(2);
    const imported = (await list(app)).find(project => project.id !== 'proj_browser');
    expect((await app.exportProject(imported.id)).slides[0].moods).toEqual(['로컬잔잔']);
    expect((await (await app.request.get('/api/projects/import/tag-mappings')).json()).mappings['외부잔잔']).toBe('로컬잔잔');
    await page.locator('#file-import-project').setInputFiles(file);
    await expect(page.getByLabel('외부잔잔 태그 연결')).toHaveValue('로컬잔잔');
    await page.locator('#btn-cancel-project-import').click();
    expect((await list(app))).toHaveLength(2);
});
