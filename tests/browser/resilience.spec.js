const fs = require('node:fs/promises');
const { test, expect, openEditor } = require('./fixtures');

async function addText(page, text) {
  await page.locator('[data-target="panel-text"]').click();
  await page.locator('#btn-add-text-body').click();
  await page.locator('#text-editor').fill(text);
  await page.locator('#text-editor').press('Tab');
}

for (const mode of ['missing-ack', 'refused-save']) {
  test(`SC-05-06 ${mode} is reported as failure, never as confirmed save`, async ({ page, app }) => {
    await page.routeWebSocket('**/ws?role=editor', socket => {
      const server = socket.connectToServer();
      socket.onMessage(message => {
        const event = JSON.parse(message.toString());
        if (mode === 'refused-save' && event.type === 'SAVE_SLIDE') {
          socket.send(JSON.stringify({ type: 'SAVE_SLIDE_RESULT', requestId: event.requestId, success: false }));
        } else server.send(message);
      });
      server.onMessage(message => {
        const event = JSON.parse(message.toString());
        if (mode !== 'missing-ack' || event.type !== 'SAVE_SLIDE_RESULT') socket.send(message);
      });
    });
    await openEditor(page);
    await addText(page, '응답 확인이 필요한 저장');
    await expect(page.locator('#autosave-status-text')).toContainText('저장 실패', { timeout: 15_000 });
    const data = await app.exportProject();
    expect(data.slides[0].elements.some(element => element.content === '응답 확인이 필요한 저장')).toBe(mode === 'missing-ack');
  });
}

test('저장 응답 후 다른 슬라이드로 전환하고 수정 내용을 보존한다', async ({ page, app }) => {
  await openEditor(page);
  await page.locator('[data-target="panel-layers"]').click();
  await page.locator('.layer-item').first().click();
  await page.locator('#btn-bold').click();
  await expect.poll(() => page.evaluate(() => isSlideDirty)).toBe(true);

  await page.locator('[data-target="panel-slides"]').click();
  await page.locator('#slide-item-slide_b').click();
  await expect.poll(() => page.evaluate(() => activeSlideId), { timeout: 5_000 }).toBe('slide_b');
  await expect.poll(async () => (await app.exportProject()).slides[0].elements[0].style.fontWeight).toBe('bold');
});

test('SC-15-05 second editor cannot overwrite a locked slide and closing releases it', async ({ page, context, app }) => {
  await openEditor(page);
  const second = await context.newPage();
  await second.goto('/static/editor.html');
  await expect(second.locator('#lock-banner')).toContainText('편집 중');
  await expect(second.locator('#btn-add-text-body')).toBeDisabled();
  await page.close();
  await expect(second.locator('#lock-banner')).toBeHidden();
  await second.locator('#slide-item-slide_a').click();
  await expect(second.locator('#btn-add-slide')).toBeEnabled();
  await addText(second, '잠금 해제 후 수정');
  await expect.poll(async () => (await app.exportProject()).slides[0].elements.some(element => element.content === '잠금 해제 후 수정')).toBe(true);
});

test('SC-15-06 two editors on different slides preserve both saves', async ({ page, context, app }) => {
  await openEditor(page);
  const second = await context.newPage();
  await second.goto('/static/editor.html');
  await expect(second.locator('#slide-item-slide_b')).toBeVisible();
  await second.locator('#slide-item-slide_b').click();
  await expect(second.locator('#btn-add-slide')).toBeEnabled();
  await Promise.all([addText(page, '편집자 A 변경'), addText(second, '편집자 B 변경')]);
  await expect.poll(async () => {
    const data = await app.exportProject();
    return data.slides.map(slide => slide.elements.map(element => element.content).join('\n'));
  }).toEqual(expect.arrayContaining([expect.stringContaining('편집자 A 변경'), expect.stringContaining('편집자 B 변경')]));
  await app.restart();
  const data = await app.exportProject();
  expect(data.slides[0].elements.some(element => element.content === '편집자 A 변경')).toBe(true);
  expect(data.slides[1].elements.some(element => element.content === '편집자 B 변경')).toBe(true);
});

test('SC-15-01 every arrow direction moves the selected shape by 1 and Shift by 10', async ({ page, app }) => {
  await openEditor(page);
  await page.locator('[data-target="panel-shapes"]').click();
  await page.locator('#btn-add-rect').click();
  const before = await page.evaluate(() => ({ left: canvas.getActiveObject().left, top: canvas.getActiveObject().top }));
  const expected = { ...before };
  for (const shift of [false, true]) {
    for (const [key, axis, direction] of [['ArrowRight', 'left', 1], ['ArrowDown', 'top', 1], ['ArrowLeft', 'left', -1], ['ArrowUp', 'top', -1]]) {
      await page.keyboard.press(`${shift ? 'Shift+' : ''}${key}`);
      expected[axis] += direction * (shift ? 10 : 1);
      await expect.poll(() => page.evaluate(() => ({ left: canvas.getActiveObject().left, top: canvas.getActiveObject().top }))).toEqual(expected);
    }
  }
  await expect.poll(async () => (await app.exportProject()).slides[0].elements.length).toBe(2);
});

test('SC-15-01 Ctrl+G toggles slide sorter and Escape returns to the active slide', async ({ page }) => {
  await openEditor(page);
  const activeId = await page.evaluate(() => activeSlideId);
  const sorter = page.locator('#slide-sorter-overlay');
  await page.keyboard.press('Control+g');
  await expect(sorter).toBeVisible();
  await expect(page.locator('.sorter-card')).toHaveCount(2);
  await page.keyboard.press('Control+g');
  await expect(sorter).toBeHidden();
  await page.keyboard.press('Control+g');
  await expect(sorter).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sorter).toBeHidden();
  await expect.poll(() => page.evaluate(() => activeSlideId)).toBe(activeId);
  await expect(page.locator(`#slide-item-${activeId}`)).toHaveClass(/editing/);
});

test('SC-15-03 canvas zoom buttons resize the canvas and enforce 30 to 300 percent bounds', async ({ page, app }) => {
  await openEditor(page);
  const before = (await app.exportProject()).slides;
  const dimensions = () => page.locator('.canvas-wrapper').evaluate(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }));
  const base = await dimensions();
  await page.locator('#btn-zoom-in').click();
  await expect(page.locator('#zoom-percent')).toHaveText('110%');
  const larger = await dimensions();
  expect(larger.width).toBeGreaterThan(base.width);
  expect(larger.height).toBeGreaterThan(base.height);
  await page.locator('#btn-zoom-reset').click();
  await expect(page.locator('#zoom-percent')).toHaveText('100%');
  for (let i = 0; i < 9; i++) await page.locator('#btn-zoom-out').click();
  await expect(page.locator('#zoom-percent')).toHaveText('30%');
  for (let i = 0; i < 29; i++) await page.locator('#btn-zoom-in').click();
  await expect(page.locator('#zoom-percent')).toHaveText('300%');
  await page.locator('#btn-zoom-reset').click();
  await expect(page.locator('#zoom-percent')).toHaveText('100%');
  await expect.poll(dimensions).toEqual(base);
  expect((await app.exportProject()).slides.map(slide => slide.elements)).toEqual(before.map(slide => slide.elements));
});

test('SC-15-03 actual Alt and Ctrl wheel inputs zoom the canvas while ordinary wheel leaves scale unchanged', async ({ page }) => {
  await openEditor(page);
  const canvasSurface = page.locator('.upper-canvas');
  await canvasSurface.hover();
  await page.mouse.wheel(0, -100);
  await expect(page.locator('#zoom-percent')).toHaveText('100%');
  await page.keyboard.down('Alt');
  await page.mouse.wheel(0, -100);
  await expect(page.locator('#zoom-percent')).toHaveText('105%');
  await page.mouse.wheel(0, 100);
  await expect(page.locator('#zoom-percent')).toHaveText('100%');
  await page.keyboard.up('Alt');
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await expect(page.locator('#zoom-percent')).toHaveText('105%');
  await page.keyboard.up('Control');
  await page.locator('#btn-zoom-reset').click();
  await expect(page.locator('#zoom-percent')).toHaveText('100%');
});

test('SC-03-08 sorter scroll, Ctrl wheel zoom and double click reveal the selected slide in the sidebar', async ({ page, app }) => {
  const fixture = await app.exportProject();
  fixture.slides = Array.from({ length: 50 }, (_, index) => ({ ...fixture.slides[0], id: `scroll_slide_${index}`, name: `스크롤 슬라이드 ${index + 1}` }));
  fixture.settings.currentLiveSlideId = fixture.slides[0].id;
  await app.seedProject(fixture);
  await openEditor(page);
  await page.keyboard.press('Control+g');
  const body = page.locator('#slide-sorter-body');
  await expect(body).toBeVisible();
  await body.hover();
  await page.mouse.wheel(0, 1000);
  await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await expect(page.locator('#input-sorter-zoom')).toHaveValue('250');
  await page.keyboard.up('Control');
  await page.locator('#btn-sorter-zoom-out').click();
  await expect(page.locator('#input-sorter-zoom')).toHaveValue('220');
  await page.locator('#btn-sorter-zoom-reset').click();
  await expect(page.locator('#input-sorter-zoom')).toHaveValue('220');
  await page.locator('#sorter-card-scroll_slide_49').dblclick();
  await expect(page.locator('#slide-sorter-overlay')).toBeHidden();
  await expect.poll(() => page.evaluate(() => activeSlideId)).toBe('scroll_slide_49');
  const sidebar = page.locator('#panel-slides .panel-body');
  await expect.poll(() => sidebar.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await expect.poll(() => page.locator('#slide-item-scroll_slide_49').evaluate(element => {
    const item = element.getBoundingClientRect();
    const parent = element.closest('.panel-body').getBoundingClientRect();
    return item.top >= parent.top && item.bottom <= parent.bottom;
  })).toBe(true);
  await sidebar.hover();
  const bottom = await sidebar.evaluate(element => element.scrollTop);
  await page.mouse.wheel(0, -1000);
  await expect.poll(() => sidebar.evaluate(element => element.scrollTop)).toBeLessThan(bottom);
});

test('SC-15-03 zoom and panel display do not change stored geometry', async ({ page, app }) => {
  await openEditor(page);
  const before = (await app.exportProject()).slides;
  for (const control of ['#btn-zoom-in', '#btn-zoom-out', '#btn-zoom-reset', '#btn-toggle-sidebar', '#btn-toggle-sidebar']) {
    await page.locator(control).click();
  }
  expect((await app.exportProject()).slides.map(slide => slide.elements)).toEqual(before.map(slide => slide.elements));
});

test('SC-06-04 template download and UI import preserve the design', async ({ page, app }) => {
  await openEditor(page);
  await page.locator('[data-target="panel-templates"]').click();
  page.once('dialog', dialog => dialog.accept('왕복 디자인'));
  await page.locator('#btn-save-template').click();
  await expect.poll(async () => (await app.exportProject()).templates.length).toBe(1);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#btn-template-export').click();
  const download = await downloadPromise;
  const templates = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
  expect(templates).toHaveLength(1);
  expect(templates[0].elements[0].content).toBe('첫 번째 테스트 자막');
  templates[0].id = 'tpl_roundtrip';
  templates[0].name = '가져온 디자인';
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#file-import-template').setInputFiles({ name: 'templates.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(templates)) });
  await expect.poll(async () => (await app.exportProject()).templates.some(template => template.name === '가져온 디자인')).toBe(true);
});

test('SC-06-05 malformed template import leaves existing data intact', async ({ page, app }) => {
  await openEditor(page);
  const before = (await app.exportProject()).templates;
  await page.locator('[data-target="panel-templates"]').click();
  const dialogPromise = page.waitForEvent('dialog');
  await page.locator('#file-import-template').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  const dialog = await dialogPromise;
  expect(dialog.message()).toContain('오류');
  await dialog.accept();
  expect((await app.exportProject()).templates).toEqual(before);
});

test('SC-12-08 editing the live slide updates viewers and survives restart', async ({ page, context, app }) => {
  await openEditor(page);
  const viewer = await context.newPage();
  await viewer.goto('/static/viewer.html?channel=broadcast');
  await expect.poll(() => viewer.evaluate(() => typeof canvas !== 'undefined' && Boolean(canvas))).toBe(true);
  await addText(page, '실시간 수정된 자막');
  await expect.poll(() => viewer.evaluate(() => canvas.getObjects().some(object => object.text === '실시간 수정된 자막'))).toBe(true);
  await expect.poll(async () => (await app.exportProject()).slides[0].elements.some(element => element.content === '실시간 수정된 자막')).toBe(true);
  await app.restart();
  await viewer.reload();
  await expect.poll(() => viewer.evaluate(() => typeof canvas !== 'undefined' && canvas?.getObjects().some(object => object.text === '실시간 수정된 자막'))).toBe(true);
});

test('infrastructure: user data and relative file paths stay in isolated storage', async ({ app }) => {
  const active = await fs.readFile(`${app.dataDir}/data/active_project_id.txt`, 'utf8');
  expect(active).toBe('proj_browser');
  const bible = await app.request.get('/api/bible/read?version=KRV&book_code=GEN&chapter=1&start_verse=1&end_verse=1');
  expect(bible.ok()).toBe(true);
  expect(JSON.stringify(await bible.json())).toContain('시험 구절');
  expect((await app.exportProject()).name).toBe('브라우저 테스트');
  const update = await app.request.post('/api/system/auto-update');
  expect(update.status()).toBe(403);
});
