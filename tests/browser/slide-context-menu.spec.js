const fs = require('node:fs/promises');
const { test, expect, openEditor } = require('./fixtures');

const slide = (page, id) => page.locator(`#slide-item-${id}`);
const menu = page => page.locator('#slide-context-menu');

async function openMenu(page, id) {
  await slide(page, id).click({ button: 'right' });
  await expect(menu(page)).toBeVisible();
}

async function uploadBackground(app, name) {
  const response = await app.request.post('/api/backgrounds/upload', {
    multipart: { file: { name, mimeType: 'video/mp4', buffer: await fs.readFile(app.videoPath) } },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test('슬라이드 우클릭 메뉴는 모든 버튼을 열고 화면 가장자리 안에 배치되며 바깥 클릭으로 닫힌다', async ({ page }) => {
  await openEditor(page);
  await openMenu(page, 'slide_a');
  for (const id of ['menu-slide-moods', 'menu-slide-background', 'menu-slide-copy', 'menu-slide-cut', 'menu-slide-paste', 'menu-slide-delete']) {
    await expect(page.locator(`#${id}`)).toBeVisible();
  }

  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  await slide(page, 'slide_a').dispatchEvent('contextmenu', {
    bubbles: true, cancelable: true, clientX: viewport.width - 1, clientY: viewport.height - 1,
  });
  const bounds = await menu(page).boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);

  await page.mouse.click(viewport.width / 2, 40);
  await expect(menu(page)).toBeHidden();
});

test('우클릭 복사와 붙여넣기는 단일 슬라이드 내용을 복제하고 고유 ID를 만든다', async ({ page, app }) => {
  await openEditor(page);
  await openMenu(page, 'slide_b');
  await page.locator('#menu-slide-copy').click();
  const clipboard = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  expect(clipboard.subcastType).toBe('slide');
  expect(clipboard.data.name).toBe('슬라이드 2 (사본)');
  expect(clipboard.data.id).toBeUndefined();

  await slide(page, 'slide_a').click();
  await openMenu(page, 'slide_a');
  await page.locator('#menu-slide-paste').click();
  await expect.poll(async () => (await app.exportProject()).slides.length).toBe(3);
  const slides = (await app.exportProject()).slides;
  expect(slides.map(item => item.id)).toEqual(['slide_a', expect.any(String), 'slide_b']);
  expect(slides[1].elements).toEqual(slides[2].elements);
});

test('선택된 여러 슬라이드를 우클릭 복사하면 선택 순서와 내용이 보존된다', async ({ page }) => {
  await openEditor(page);
  await slide(page, 'slide_a').click();
  await slide(page, 'slide_b').click({ modifiers: ['Control'] });
  await openMenu(page, 'slide_b');
  await page.locator('#menu-slide-copy').click();

  const clipboard = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  expect(clipboard.subcastType).toBe('slides');
  expect(clipboard.data.map(item => item.name)).toEqual(['슬라이드 1 (사본)', '슬라이드 2 (사본)']);
  expect(clipboard.data.every(item => !item.id)).toBe(true);
});

test('우클릭 잘라내기는 복사본을 클립보드에 남기고 선택 슬라이드를 제거한다', async ({ page, app }) => {
  await openEditor(page);
  await openMenu(page, 'slide_b');
  await page.locator('#menu-slide-cut').click();
  await expect.poll(async () => (await app.exportProject()).slides.map(item => item.id)).toEqual(['slide_a']);
  const clipboard = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  expect(clipboard.subcastType).toBe('slide');
  expect(clipboard.data.name).toBe('슬라이드 2 (사본)');
});

test('클립보드 쓰기가 실패하면 우클릭 잘라내기는 원본 슬라이드를 삭제하지 않는다', async ({ page, app }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new Error('Clipboard permission denied'); }, readText: async () => '' },
    });
  });
  await openEditor(page);
  await openMenu(page, 'slide_b');
  await page.locator('#menu-slide-cut').click();

  await expect.poll(async () => (await app.exportProject()).slides.map(item => item.id)).toEqual(['slide_a', 'slide_b']);
});

test('우클릭 태그 지정은 단일 슬라이드와 다중 선택 전체에 적용하고 취소는 보존한다', async ({ page, app }) => {
  await openEditor(page);
  await openMenu(page, 'slide_b');
  await page.locator('#menu-slide-moods').click();
  await expect(page.locator('#slide-tag-assignment-count')).toHaveText('1개 슬라이드에 적용합니다.');
  const firstTag = page.locator('.slide-tag-option').first();
  const singleTag = await firstTag.getAttribute('data-value');
  await firstTag.click();
  await page.locator('#btn-slide-tag-modal-apply').click();
  await expect.poll(async () => (await app.exportProject()).slides.find(item => item.id === 'slide_b').stageBgMoodOverride).toBe(singleTag);

  await slide(page, 'slide_a').click();
  await slide(page, 'slide_b').click({ modifiers: ['Control'] });
  await openMenu(page, 'slide_b');
  await page.locator('#menu-slide-moods').click();
  await expect(page.locator('#slide-tag-assignment-count')).toHaveText('2개 슬라이드에 적용합니다.');
  const nextTag = page.locator('.slide-tag-option').nth(1);
  const multiTag = await nextTag.getAttribute('data-value');
  await nextTag.click();
  await page.locator('#btn-slide-tag-modal-apply').click();
  await expect.poll(async () => (await app.exportProject()).slides.map(item => item.stageBgMoodOverride)).toEqual([multiTag, multiTag]);

  await openMenu(page, 'slide_a');
  await page.locator('#menu-slide-moods').click();
  await page.locator('.slide-tag-option').nth(2).click();
  await page.locator('#btn-slide-tag-modal-cancel').click();
  await expect(page.locator('#slide-tag-assignment-modal')).toBeHidden();
  await expect.poll(async () => (await app.exportProject()).slides.map(item => item.stageBgMoodOverride)).toEqual([multiTag, multiTag]);
});

test('우클릭 배경 지정은 일반 슬라이드 한 장에만 저장하고 찬양 일괄 옵션은 비활성화한다', async ({ page, app }) => {
  const background = await uploadBackground(app, 'context-menu-bg.mp4');
  await openEditor(page);
  await page.locator('[data-target="panel-stage-bg"]').click();
  await expect(page.locator('.stage-bg-card-main').filter({ hasText: 'context-menu-bg.mp4' })).toBeVisible();

  await page.locator('[data-target="panel-slides"]').click();
  await openMenu(page, 'slide_b');
  await page.locator('#menu-slide-background').click();
  await expect(page.locator('#slide-bg-select-modal')).toBeVisible();
  await expect(page.locator('#chk-slide-bg-modal-apply-all-song')).toBeDisabled();
  await expect(page.locator('#chk-slide-bg-modal-apply-all-song')).not.toBeChecked();
  await page.locator('.slide-bg-modal-item-card').filter({ hasText: 'context-menu-bg.mp4' }).click();
  await expect.poll(async () => (await app.exportProject()).slides.find(item => item.id === 'slide_b').overrideBgId).toBe(background.filename);
  expect((await app.exportProject()).slides.find(item => item.id === 'slide_a').overrideBgId).toBeNull();
});

test('우클릭 배경 지정 모달은 헤더 닫기와 하단 닫기 버튼으로 닫히고 다시 열 수 있다', async ({ page }) => {
  await openEditor(page);
  await openMenu(page, 'slide_b');
  await page.locator('#menu-slide-background').click();
  const modal = page.locator('#slide-bg-select-modal');
  await expect(modal).toBeVisible();
  await page.locator('#btn-slide-bg-modal-close').click();
  await expect(modal).toBeHidden();

  await openMenu(page, 'slide_b');
  await page.locator('#menu-slide-background').click();
  await expect(modal).toBeVisible();
  await page.locator('#btn-slide-bg-modal-cancel').click();
  await expect(modal).toBeHidden();
});

test('배경 지정 모달의 X 화면 좌표를 마우스로 누르면 닫기 입력으로 처리된다', async ({ page }) => {
  await openEditor(page);
  await openMenu(page, 'slide_b');
  await page.locator('#menu-slide-background').click();
  const modal = page.locator('#slide-bg-select-modal');
  const close = page.locator('#btn-slide-bg-modal-close');
  await expect(modal).toBeVisible();

  const box = await close.boundingBox();
  const hit = await page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y);
    return { id: target?.id, text: target?.textContent?.trim() };
  }, { x: box.x + box.width - 4, y: box.y + 4 });
  expect(box.width).toBeGreaterThanOrEqual(36);
  expect(box.height).toBeGreaterThanOrEqual(36);
  expect(hit.id).toBe('btn-slide-bg-modal-close');
  await page.mouse.click(box.x + box.width - 4, box.y + 4);
  await expect(modal).toBeHidden();
});

test('우클릭 태그 지정 모달은 헤더 닫기 버튼으로 닫고 다시 열 수 있다', async ({ page }) => {
  await openEditor(page);
  await openMenu(page, 'slide_b');
  await page.locator('#menu-slide-moods').click();
  const modal = page.locator('#slide-tag-assignment-modal');
  await expect(modal).toBeVisible();
  await page.locator('#btn-slide-tag-modal-close').click();
  await expect(modal).toBeHidden();

  await openMenu(page, 'slide_b');
  await page.locator('#menu-slide-moods').click();
  await expect(modal).toBeVisible();
  await page.locator('#btn-slide-tag-modal-cancel').click();
  await expect(modal).toBeHidden();
});

test('우클릭 삭제는 취소를 보존하고 전체 선택 삭제 뒤에도 빈 슬라이드 하나를 유지한다', async ({ page, app }) => {
  await openEditor(page);
  await openMenu(page, 'slide_b');
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#menu-slide-delete').click();
  await expect.poll(async () => (await app.exportProject()).slides.map(item => item.id)).toEqual(['slide_a', 'slide_b']);

  await slide(page, 'slide_a').click();
  await slide(page, 'slide_b').click({ modifiers: ['Control'] });
  await openMenu(page, 'slide_b');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#menu-slide-delete').click();
  await expect.poll(async () => (await app.exportProject()).slides.length).toBe(1);
  const remaining = (await app.exportProject()).slides[0];
  expect(['slide_a', 'slide_b']).not.toContain(remaining.id);
  expect(remaining.elements).toEqual([]);
});

test('우클릭으로 선택된 여러 슬라이드를 삭제해도 다른 편집자가 잠근 슬라이드는 남긴다', async ({ page, context, app }) => {
  await openEditor(page);
  await slide(page, 'slide_a').click();
  await slide(page, 'slide_b').click({ modifiers: ['Control'] });
  expect(await page.evaluate(() => selectedSlideIds)).toEqual(['slide_a', 'slide_b']);

  const other = await context.newPage();
  await openEditor(other);
  await expect.poll(() => page.evaluate(() => lockedSlides.slide_a?.ownerId !== myEditorId)).toBe(true);
  await expect.poll(() => page.locator('#slide-item-slide_a').evaluate(item => item.classList.contains('locked'))).toBe(true);

  await openMenu(page, 'slide_b');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#menu-slide-delete').click();
  await expect.poll(async () => (await app.exportProject()).slides.map(item => item.id)).toEqual(['slide_a']);

  await page.evaluate(() => ws.send(JSON.stringify({ type: 'DELETE_SLIDES', slideIds: ['slide_a'] })));
  await expect.poll(async () => (await app.exportProject()).slides.map(item => item.id)).toEqual(['slide_a']);
});
