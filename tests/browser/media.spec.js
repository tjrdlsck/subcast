const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { test, expect, openEditor } = require('./fixtures');

const projectId = 'proj_browser';
const songRow = (page, title) => page.locator('#praise-songs-list .bible-result-item').filter({ hasText: title });
const lyricsOf = slide => slide.elements.filter(element => element.type === 'text').map(element => element.content);
async function seedSong(app, title, lyrics, mood = '기본/일반') {
  const response = await app.request.post('/api/praise/save', { data: { title, lyrics, mood } });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).id;
}
async function praise(page, app) {
  await openEditor(page, app);
  await page.locator('[data-target="panel-praise"]').click();
}
async function songs(app) { return (await app.request.get('/api/praise/search')).json(); }
async function project(app) { return app.exportProject(projectId); }
async function insert(page, afterIndex) {
  await expect(page.locator('#bible-insert-modal')).toBeVisible();
  if (afterIndex !== undefined) await page.locator('.bible-modal-grid-item').nth(afterIndex).click();
  await page.locator('#btn-bible-modal-confirm').click();
  await expect(page.locator('#bible-insert-modal')).toBeHidden();
}
async function alertFrom(page, action, accept = true, text) {
  const pending = page.waitForEvent('dialog', { timeout: 10_000 });
  const operation = action();
  const dialog = await pending;
  const message = dialog.message();
  if (accept) await dialog.accept(text); else await dialog.dismiss();
  await operation;
  return message;
}
async function bible(page, app, end = '5') {
  await openEditor(page, app);
  await page.locator('[data-target="panel-bible"]').click();
  await page.locator('#input-bible-book-filter').fill('창세기');
  await page.locator('.bible-book-dropdown-item').filter({ hasText: '창세기' }).click();
  await page.locator('#input-bible-chapter').fill('1');
  await page.locator('#input-bible-start-verse').fill('1');
  await page.locator('#input-bible-end-verse').fill(end);
  await page.locator('#btn-bible-fetch').click();
  await expect(page.locator('#bible-results-list .bible-result-item')).toHaveCount(Number(end));
}

async function seedBackground(app, name) {
  const response = await app.request.post('/api/backgrounds/upload', {
    multipart: { file: { name, mimeType: 'video/mp4', buffer: await fs.readFile(app.videoPath) } },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function backgrounds(app) { return (await (await app.request.get('/api/backgrounds/list')).json()).files; }
async function stage(page, app) {
  await openEditor(page, app);
  await page.locator('[data-target="panel-stage-bg"]').click();
}
async function backgroundModal(page, slideId) {
  await page.locator('[data-target="panel-slides"]').click();
  await page.locator(`#slide-item-${slideId}`).click({ button: 'right' });
  await page.locator('#menu-slide-background').click();
  await expect(page.locator('#slide-bg-select-modal')).toBeVisible();
}
async function taggedBackgrounds(page, app, moods) {
  const files = [];
  for (let index = 0; index < moods.length; index++) {
    const uploaded = await seedBackground(app, `candidate-${index}.mp4`);
    files.push({ name: uploaded.filename, url: uploaded.videoUrl, moods: [moods[index]], mood: moods[index] });
  }
  await stage(page, app);
  for (let index = 0; index < moods.length; index++) {
    await page.locator('.stage-bg-card-main').filter({ hasText: `candidate-${index}.mp4` }).locator('input[type="checkbox"]').check();
    await page.locator('#btn-stage-bg-bulk-moods').click();
    await page.locator(`.stage-bg-mood-chip[data-mood="${moods[index]}"]`).click();
    await page.locator('#btn-stage-bg-mood-modal-save').click();
    await expect(page.locator('#stage-bg-mood-modal')).toBeHidden();
    await page.locator('#btn-stage-bg-bulk-clear').click();
  }
  return { files, id: projectId };
}
async function generateSong(page, title) {
  await page.locator('[data-target="panel-praise"]').click();
  await songRow(page, title).click();
  await page.locator('#btn-add-praise-slides').click();
  await insert(page);
}

test('SC-07-01 title and lyrics search restores the list when cleared', async ({ page, app }) => {
  await seedSong(app, '검색시험 제목', '별도 가사');
  await seedSong(app, '가사 일치', '검색시험 가사');
  await seedSong(app, '다른 곡', '관련 없음');
  await praise(page, app);
  await page.locator('#input-praise-search').fill('검색시험');
  await expect(page.locator('#praise-songs-list .bible-result-item')).toHaveCount(2);
  await expect(songRow(page, '다른 곡')).toHaveCount(0);
  await page.locator('#input-praise-search').fill('');
  await expect(page.locator('#praise-songs-list .bible-result-item')).toHaveCount(3);
});

test('SC-07-02 register multiline lyrics and preserve ID after restart', async ({ page, app }) => {
  await praise(page, app);
  await page.locator('#btn-praise-open-add-modal').click();
  await page.locator('#modal-praise-title').fill('새 시험곡');
  await page.locator('#modal-praise-lyrics').fill('첫째 줄\n둘째 줄\n\n셋째 줄');
  await page.locator('#modal-praise-mood-chips [data-mood="잔잔/묵상"]').click();
  await page.locator('#btn-praise-modal-save').click();
  await expect(page.locator('#praise-add-modal')).toBeHidden();
  const saved = (await songs(app))[0];
  expect(saved).toMatchObject({ title: '새 시험곡', lyrics: '첫째 줄\n둘째 줄\n\n셋째 줄', mood: '잔잔/묵상' });
  await app.restart();
  await praise(page, app);
  await expect(songRow(page, '새 시험곡')).toHaveCount(1);
  expect((await songs(app))[0]).toMatchObject({ id: saved.id, lyrics: saved.lyrics, mood: saved.mood });
});

test('SC-07-03 edit preserves ID and duplicate title is rejected', async ({ page, app }) => {
  const id = await seedSong(app, '시험 A', '원래 가사');
  await seedSong(app, '시험 B', '보호 가사');
  await praise(page, app);
  await songRow(page, '시험 A').click();
  await page.locator('#btn-praise-edit-selected').click();
  await page.locator('#modal-praise-lyrics').fill('수정 가사');
  await page.locator('#btn-praise-modal-save').click();
  await expect(page.locator('#praise-add-modal')).toBeHidden();
  expect((await songs(app)).find(song => song.id === id).lyrics).toBe('수정 가사');
  await page.locator('#btn-praise-edit-selected').click();
  await page.locator('#modal-praise-title').fill('시험 B');
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/praise/save'));
  expect(await alertFrom(page, () => page.locator('#btn-praise-modal-save').click())).toContain('오류');
  expect((await responsePromise).status()).toBe(409);
  expect(await songs(app)).toEqual(expect.arrayContaining([expect.objectContaining({ id, title: '시험 A', lyrics: '수정 가사' }), expect.objectContaining({ title: '시험 B', lyrics: '보호 가사' })]));
});

test('SC-07-04 required input refuses whitespace without creating a song', async ({ page, app }) => {
  await praise(page, app);
  await page.locator('#btn-praise-open-add-modal').click();
  await page.locator('#modal-praise-title').fill('  ');
  await page.locator('#modal-praise-lyrics').fill('가사');
  expect(await alertFrom(page, () => page.locator('#btn-praise-modal-save').click())).toContain('제목과 가사');
  await expect(page.locator('#praise-add-modal')).toBeVisible();
  expect(await songs(app)).toEqual([]);
});

test('SC-07-05 search combines with mood filter and clears hidden selection', async ({ page, app }) => {
  await seedSong(app, '시험 묵상', '공통 가사', '잔잔/묵상');
  await seedSong(app, '시험 찬양', '공통 가사', '경배/찬양');
  await praise(page, app);
  await songRow(page, '시험 찬양').click();
  await page.locator('#praise-mood-filter-chips [data-filter="잔잔/묵상"]').click();
  await page.locator('#input-praise-search').fill('공통');
  await expect(page.locator('#praise-songs-list .bible-result-item')).toHaveCount(1);
  await expect(songRow(page, '시험 묵상')).toBeVisible();
  await expect(page.locator('#praise-main-viewer-overlay')).toBeHidden();
});

test('SC-07-07 deletion cancellation and confirmation affect only the selected song', async ({ page, app }) => {
  await seedSong(app, '삭제 대상', '가사');
  await seedSong(app, '유지 대상', '가사');
  await praise(page, app);
  await songRow(page, '삭제 대상').click();
  await alertFrom(page, () => page.locator('#btn-praise-delete-selected').click(), false);
  expect(await songs(app)).toHaveLength(2);
  await alertFrom(page, () => page.locator('#btn-praise-delete-selected').click());
  await expect(songRow(page, '삭제 대상')).toHaveCount(0);
  await page.reload();
  await page.locator('[data-target="panel-praise"]').click();
  await expect(songRow(page, '유지 대상')).toHaveCount(1);
});

test('SC-07-08 selected song export contains only selected data and imports through file input', async ({ page, app }) => {
  await seedSong(app, '내보낼 곡', '줄1\n줄2', '잔잔/묵상');
  await seedSong(app, '제외할 곡', '보호');
  await praise(page, app);
  await songRow(page, '내보낼 곡').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#btn-praise-export').click();
  const data = JSON.parse(await fs.readFile(await (await downloadPromise).path(), 'utf8'));
  expect(data).toEqual([{ title: '내보낼 곡', lyrics: '줄1\n줄2', mood: '잔잔/묵상' }]);
  data[0].title = '왕복 시험곡';
  expect(await alertFrom(page, () => page.locator('#file-import-praise').setInputFiles({ name: 'songs.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) }))).toContain('1곡');
  await expect(songRow(page, '왕복 시험곡')).toHaveCount(1);
  expect((await songs(app)).find(song => song.title === '왕복 시험곡')).toMatchObject(data[0]);
});

test('SC-07-09 malformed and non-array JSON keep existing songs', async ({ page, app }) => {
  await seedSong(app, '보호 곡', '보호 가사');
  await praise(page, app);
  for (const source of ['{broken', '{"title":"객체"}']) {
    const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/praise/import'));
    expect(await alertFrom(page, () => page.locator('#file-import-praise').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(source) }))).toContain('오류');
    expect((await responsePromise).status()).toBe(400);
  }
  expect(await songs(app)).toHaveLength(1);
  await expect(songRow(page, '보호 곡')).toHaveCount(1);
});

test('SC-08-01/06 paragraph insertion can cancel then insert after the first slide', async ({ page, app }) => {
  await seedSong(app, '단락 시험', '첫째 줄\n둘째 줄\n\n셋째 줄');
  await praise(page, app);
  const before = await project(app);
  await songRow(page, '단락 시험').click();
  await expect(page.locator('#val-praise-expected-slides')).toHaveText('2');
  await page.locator('#btn-add-praise-slides').click();
  await page.locator('#btn-bible-modal-cancel').click();
  expect((await project(app)).slides).toEqual(before.slides);
  await page.locator('#btn-add-praise-slides').click();
  await insert(page, 0);
  await expect.poll(async () => (await project(app)).slides.length).toBe(4);
  const slides = (await project(app)).slides;
  expect(slides.map(slide => slide.id)).toEqual([before.slides[0].id, slides[1].id, slides[2].id, before.slides[1].id]);
  expect(lyricsOf(slides[1])).toContain('첫째 줄\n둘째 줄');
  expect(lyricsOf(slides[2])).toContain('셋째 줄');
});

test('SC-08-02 explicit blanks and whitespace make empty slides while ordinary blank lines separate paragraphs', async ({ page, app }) => {
  await seedSong(app, '빈화면 시험', '첫 가사\n\n둘째 가사\n[빈 화면]\n[빈슬라이드]\n셋째 가사\n   \n마지막 가사\n[공백]');
  await praise(page, app);
  await songRow(page, '빈화면 시험').click();
  await expect(page.locator('#val-praise-expected-slides')).toHaveText('7');
  await page.locator('#btn-add-praise-slides').click();
  await insert(page);
  await expect.poll(async () => (await project(app)).slides.length).toBe(9);
  const added = (await project(app)).slides.slice(2);
  expect(added.map(slide => lyricsOf(slide)[0])).toEqual(['첫 가사', '둘째 가사', '', '셋째 가사', '', '마지막 가사', '']);
});

test('SC-08-03 only checked paragraphs are generated and zero selection is refused', async ({ page, app }) => {
  await seedSong(app, '선택 시험', '첫 단락\n\n둘째 단락\n\n셋째 단락');
  await praise(page, app);
  await songRow(page, '선택 시험').click();
  await page.locator('#chk-select-all-praise').uncheck();
  expect(await alertFrom(page, () => page.locator('#btn-add-praise-slides').click())).toContain('선택');
  await expect(page.locator('#bible-insert-modal')).toBeHidden();
  await page.locator('.praise-preview-item-chk').nth(0).check();
  await page.locator('.praise-preview-item-chk').nth(2).check();
  await page.locator('#btn-add-praise-slides').click();
  await insert(page);
  await expect.poll(async () => (await project(app)).slides.length).toBe(4);
  expect((await project(app)).slides.slice(2).map(slide => lyricsOf(slide)[0])).toEqual(['첫 단락', '셋째 단락']);
});

test('SC-08-04 black preset generates a background without changing existing slides', async ({ page, app }) => {
  await seedSong(app, '디자인 시험', '디자인 가사');
  await praise(page, app);
  const before = (await project(app)).slides;
  await songRow(page, '디자인 시험').click();
  await page.locator('#select-praise-design-preset').selectOption('type-black');
  await page.locator('#btn-add-praise-slides').click();
  await insert(page);
  await expect.poll(async () => (await project(app)).slides.length).toBe(3);
  const slides = (await project(app)).slides;
  expect(slides.slice(0, 2)).toEqual(before);
  expect(slides[2].elements).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'rect', width: 100, height: 100, style: expect.objectContaining({ fillColor: '#000000' }) })]));
});

test('SC-08-05 텍스트 상자 없는 찬양 템플릿은 안내하고 생성하지 않는다', async ({ page, app }) => {
  await seedSong(app, '템플릿 제한 시험', '가사가 들어갈 문구');
  const data = await app.exportProject();
  data.templates = [{ id: 'tpl_shape_only', name: '글상자 없는 템플릿', elements: [
    { id: 'shape_only', type: 'rect', content: '', x: 0, y: 0, width: 100, height: 100, style: { fillColor: '#123456' } },
  ] }];
  const id = await app.seedProject(data);
  const originalSlideIds = data.slides.map(slide => slide.id);
  const response = await app.request.post('/api/templates/import', { multipart: { file: {
    name: 'shape-only-template.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data.templates)),
  } } });
  expect(response.ok()).toBeTruthy();
  await praise(page, app);
  await songRow(page, '템플릿 제한 시험').click();
  expect(await alertFrom(page, () => page.locator('#select-praise-design-preset').selectOption('template'))).toContain('텍스트 상자');
  expect((await project(app)).slides.map(slide => slide.id)).toEqual(originalSlideIds);
  expect((await app.exportProject(id)).templates.some(template => template.id === 'tpl_shape_only')).toBe(true);
});

test('SC-08-07 repeated song insertion creates independent group IDs', async ({ page, app }) => {
  await seedSong(app, '반복 시험', '가사1\n\n가사2');
  await praise(page, app);
  for (let iteration = 0; iteration < 2; iteration++) {
    await songRow(page, '반복 시험').click();
    await page.locator('#btn-add-praise-slides').click();
    await insert(page);
    await expect.poll(async () => (await project(app)).slides.length).toBe(4 + iteration * 2);
  }
  const added = (await project(app)).slides.slice(2);
  expect(added[0].praiseGroupId).toBeTruthy();
  expect(added[0].praiseGroupId).toBe(added[1].praiseGroupId);
  expect(added[2].praiseGroupId).toBe(added[3].praiseGroupId);
  expect(added[0].praiseGroupId).not.toBe(added[2].praiseGroupId);
});

test('SC-09-01/02/04 coordinate retry shows fixture text and version change clears selection', async ({ page, app }) => {
  await bible(page, app, '3');
  await expect(page.locator('.bible-result-item-content')).toHaveText(['첫 번째 시험 구절', '두 번째 시험 구절', '세 번째 시험 구절']);
  await page.locator('#input-bible-start-verse').fill('3');
  await page.locator('#input-bible-end-verse').fill('1');
  expect(await alertFrom(page, () => page.locator('#btn-bible-fetch').click())).toContain('시작 절');
  await page.locator('#input-bible-start-verse').fill('1');
  await page.locator('#input-bible-end-verse').fill('3');
  await page.locator('#btn-bible-fetch').click();
  await expect(page.locator('#bible-results-list .bible-result-item')).toHaveCount(3);
  await page.locator('#chk-select-all-bible').check();
  await expect(page.locator('#val-selected-count')).toHaveText('3');
  await page.locator('#select-bible-version').selectOption('NIV');
  await expect(page.locator('#bible-results-list .bible-result-item')).toHaveCount(0);
  await expect(page.locator('#val-selected-count')).toHaveText('0');
  await expect(page.locator('#btn-add-bible-slides')).toBeDisabled();
});

test('SC-09-03 keyword length guard and Enter search use fixture text', async ({ page, app }) => {
  await bible(page, app, '1');
  await page.locator('#btn-mode-keyword').click();
  await page.locator('#input-bible-keyword').fill('시');
  expect(await alertFrom(page, () => page.locator('#btn-bible-search').click())).toContain('2글자');
  await page.locator('#input-bible-keyword').fill('시험');
  await page.locator('#input-bible-keyword').press('Enter');
  await expect(page.locator('#bible-results-list .bible-result-item')).toHaveCount(5);
});

test('SC-09-09 성경 조회 API 실패는 빈 결과와 구분되고 복구 후 다시 조회된다', async ({ page, app }) => {
  const before = (await project(app)).slides.map(slide => ({ id: slide.id, elements: slide.elements }));
  await openEditor(page, app);
  await page.locator('[data-target="panel-bible"]').click();
  await page.locator('#input-bible-book-filter').fill('창세기');
  await page.locator('.bible-book-dropdown-item').filter({ hasText: '창세기' }).click();
  await page.locator('#input-bible-chapter').fill('1');
  await page.locator('#input-bible-start-verse').fill('1');
  await page.locator('#input-bible-end-verse').fill('1');
  await page.route('**/api/bible/read**', route => route.fulfill({ status: 503, body: 'fixture failure' }));
  expect(await alertFrom(page, () => page.locator('#btn-bible-fetch').click())).toContain('실패');
  await expect(page.locator('#bible-results-list .bible-result-item')).toHaveCount(0);
  expect((await project(app)).slides.map(slide => ({ id: slide.id, elements: slide.elements }))).toEqual(before);

  await page.unroute('**/api/bible/read**');
  await page.locator('#btn-bible-fetch').click();
  await expect(page.locator('#bible-results-list .bible-result-item')).toHaveCount(1);
  expect((await project(app)).slides.map(slide => ({ id: slide.id, elements: slide.elements }))).toEqual(before);

  await page.locator('#chk-select-all-bible').check();
  await page.locator('#btn-add-bible-slides').click();
  await expect(page.locator('#bible-insert-modal')).toBeVisible();
  const beforeInsert = (await project(app)).slides.map(slide => ({ id: slide.id, elements: slide.elements }));
  await page.evaluate(() => ws.close());
  await expect.poll(() => page.evaluate(() => ws.readyState)).toBe(3);
  expect(await alertFrom(page, () => page.locator('#btn-bible-modal-confirm').click())).toContain('실시간 연결');
  await expect(page.locator('#bible-insert-modal')).toBeVisible();
  expect((await project(app)).slides.map(slide => ({ id: slide.id, elements: slide.elements }))).toEqual(beforeInsert);

  await page.reload();
  await openEditor(page, app);
  await bible(page, app, '1');
  await page.locator('#chk-select-all-bible').check();
  await page.locator('#btn-add-bible-slides').click();
  await insert(page);
  await expect.poll(async () => (await project(app)).slides.length).toBe(before.length + 2);
});

test('SC-09-05 click, Shift range and select-all keep counts consistent', async ({ page, app }) => {
  await bible(page, app);
  const rows = page.locator('#bible-results-list .bible-result-item');
  await rows.nth(0).click();
  await rows.nth(2).click({ modifiers: ['Shift'] });
  await expect(page.locator('#val-selected-count')).toHaveText('3');
  await rows.nth(1).click({ modifiers: ['Control'] });
  await expect(page.locator('#val-selected-count')).toHaveText('2');
  await page.locator('#chk-select-all-bible').check();
  await expect(page.locator('#val-selected-count')).toHaveText('5');
  await page.locator('#chk-select-all-bible').uncheck();
  await expect(page.locator('#btn-add-bible-slides')).toBeDisabled();
});

for (const [mode, count] of [['1', 5], ['2', 3], ['all', 1], ['auto', 5]]) {
  test(`SC-09-06/${mode} generates ${count} slides and preserves verse order`, async ({ page, app }) => {
    await bible(page, app);
    await page.locator('#chk-select-all-bible').check();
    await page.locator('#chk-bible-trailing-blank').uncheck();
    await page.locator('#select-bible-split-mode').selectOption(mode);
    await expect(page.locator('#val-expected-slides')).toHaveText(String(count));
    await page.locator('#btn-add-bible-slides').click();
    await insert(page);
    await expect.poll(async () => (await project(app)).slides.length).toBe(count + 2);
    const contents = (await project(app)).slides.slice(2).flatMap(lyricsOf).join('\n');
    for (const word of ['첫', '두', '세', '네', '다섯']) expect(contents).toContain(`${word} 번째 시험 구절`);
    expect(contents.indexOf('첫 번째')).toBeLessThan(contents.indexOf('다섯 번째'));
  });
}

test('SC-09-07/08 trailing blank and insert cancellation preserve existing slides', async ({ page, app }) => {
  await bible(page, app, '1');
  const before = (await project(app)).slides;
  await page.locator('#chk-select-all-bible').check();
  await expect(page.locator('#val-expected-slides')).toHaveText('2');
  await page.locator('#btn-add-bible-slides').click();
  await page.locator('#btn-bible-modal-cancel').click();
  expect((await project(app)).slides).toEqual(before);
  await page.locator('#btn-add-bible-slides').click();
  await insert(page, 0);
  await expect.poll(async () => (await project(app)).slides.length).toBe(4);
  const slides = (await project(app)).slides;
  expect(slides[2].slideType).toBe('bibleBlank');
  expect(lyricsOf(slides[2]).filter(Boolean)).toEqual([]);
  expect(slides[3].id).toBe(before[1].id);
});

test('SC-10-03 extension rejects while current corrupt MP4 acceptance reports unplayable media', async ({ page, app }) => {
  await openEditor(page, app);
  await page.locator('[data-target="panel-stage-bg"]').click();
  await page.locator('#file-upload-bg-input').setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('not a video') });
  await expect(page.locator('#stage-bg-upload-status')).toContainText('❌');
  await expect(page.locator('.stage-bg-card-main')).toHaveCount(0);
  await page.locator('#file-upload-bg-input').setInputFiles({ name: 'corrupt.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not a video') });
  await expect(page.locator('#stage-bg-upload-status')).toContainText('완료', { timeout: 30_000 });
  await expect(page.locator('.stage-bg-card-main')).toHaveCount(1);
  await expect.poll(() => page.locator('#pip-bg-video').evaluate(video => video.error?.code)).toBe(4);
  expect(await page.locator('#pip-bg-video').evaluate(video => video.readyState)).toBe(0);
});

test('SC-10-01 valid video upload survives backend restart and plays in preview', async ({ page, app }) => {
  await openEditor(page, app);
  await page.locator('[data-target="panel-stage-bg"]').click();
  await page.locator('#file-upload-bg-input').setInputFiles(app.videoPath);
  await expect(page.locator('#stage-bg-upload-status')).toContainText('완료', { timeout: 30_000 });
  await expect(page.locator('.stage-bg-card-main')).toHaveCount(1);
  await app.restart();
  await openEditor(page, app);
  await page.locator('[data-target="panel-stage-bg"]').click();
  await expect(page.locator('.stage-bg-card-main')).toHaveCount(1);
  await page.locator('.stage-bg-card-main').click();
  await expect.poll(() => page.locator('#pip-stage-preview-container video').evaluate(video => video.readyState)).toBeGreaterThanOrEqual(2);
});

test('SC-11-01/02 create normalized tag then rename updates filter and song alias', async ({ page, app }) => {
  await praise(page, app);
  await page.locator('#praise-mood-filter-chips .btn-open-tag-manager').click();
  await page.locator('#input-new-mood-tag').fill('  시험태그  ');
  await page.locator('#btn-add-mood-tag').click();
  const row = page.locator('.mood-tag-row').filter({ has: page.locator('.mood-tag-name', { hasText: '#시험태그' }) });
  await expect(row).toHaveCount(1);
  await page.locator('#input-new-mood-tag').fill('시험태그');
  const duplicateResponse = page.waitForResponse(response => response.url().endsWith('/api/tags') && response.request().method() === 'POST');
  expect(await alertFrom(page, () => page.locator('#btn-add-mood-tag').click())).toContain('이미');
  expect((await duplicateResponse).status()).toBe(400);
  await expect(row).toHaveCount(1);
  await seedSong(app, '태그 시험곡', '태그 가사', '시험태그');
  await alertFrom(page, () => row.getByRole('button', { name: '이름 변경' }).click(), true, '변경태그');
  await expect(page.locator('.mood-tag-name', { hasText: '#변경태그' })).toHaveCount(1);
  await page.locator('#btn-close-tag-manager').click();
  await page.locator('#praise-mood-filter-chips [data-filter="변경태그"]').click();
  await expect(songRow(page, '태그 시험곡')).toHaveCount(1);
  expect((await songs(app))[0].mood).toBe('변경태그');
});

test('SC-11-03 tag delete cancellation preserves references and confirmed deletion resets song tag', async ({ page, app }) => {
  const tagResponse = await app.request.post('/api/tags', { data: { name: '삭제태그' } });
  expect(tagResponse.ok()).toBeTruthy();
  await seedSong(app, '태그 보호곡', '가사', '삭제태그');
  await praise(page, app);
  await page.locator('#praise-mood-filter-chips .btn-open-tag-manager').click();
  const row = page.locator('.mood-tag-row').filter({ hasText: '#삭제태그' });
  await alertFrom(page, () => row.getByRole('button', { name: '삭제', exact: true }).click(), false);
  await expect(row).toHaveCount(1);
  expect((await songs(app))[0].mood).toBe('삭제태그');
  await alertFrom(page, () => row.getByRole('button', { name: '삭제', exact: true }).click());
  await expect(row).toHaveCount(0);
  expect((await songs(app))[0].mood).toBe('기본/일반');
  const defaultRow = page.locator('.mood-tag-row').filter({ hasText: '#기본/일반' });
  await expect(defaultRow).toContainText('기본 태그');
  await expect(defaultRow.getByRole('button')).toHaveCount(0);
});

test('SC-07-06 clipboard copies lyrics and mood then rejects a repeated duplicate', async ({ page, app }) => {
  await seedSong(app, '복사 시험곡', '복사 가사\n둘째 줄', '잔잔/묵상');
  await praise(page, app);
  await songRow(page, '복사 시험곡').click({ button: 'right' });
  await page.locator('#menu-praise-copy').click();
  await songRow(page, '복사 시험곡').click({ button: 'right' });
  await page.locator('#menu-praise-paste').click();
  await expect(songRow(page, '복사 시험곡 (복사본)')).toHaveCount(1);
  const copy = (await songs(app)).find(song => song.title.endsWith('(복사본)'));
  await songRow(page, '복사 시험곡 (복사본)').click({ button: 'right' });
  expect(await alertFrom(page, () => page.locator('#menu-praise-paste').click())).toContain('1곡');
  expect(await songs(app)).toHaveLength(2);
  expect(copy).toMatchObject({ lyrics: '복사 가사\n둘째 줄', mood: '잔잔/묵상' });
});

test('SC-07-06 cut removes only its source and paste restores its content', async ({ page, app }) => {
  await seedSong(app, '잘라내기 원본', '보존 가사');
  await seedSong(app, '남길 곡', '남길 가사');
  await praise(page, app);
  await songRow(page, '잘라내기 원본').click({ button: 'right' });
  await page.locator('#menu-praise-cut').click();
  await expect(songRow(page, '잘라내기 원본')).toHaveCount(0);
  await songRow(page, '남길 곡').click({ button: 'right' });
  await page.locator('#menu-praise-paste').click();
  await expect(songRow(page, '잘라내기 원본 (복사본)')).toHaveCount(1);
  expect(await songs(app)).toEqual(expect.arrayContaining([expect.objectContaining({ title: '남길 곡', lyrics: '남길 가사' }), expect.objectContaining({ title: '잘라내기 원본 (복사본)', lyrics: '보존 가사' })]));
});

test('SC-07-08 multiple selection and all-song downloads preserve exact titles', async ({ page, app }) => {
  for (const title of ['자료 A', '자료 B', '자료 C']) await seedSong(app, title, `${title} 가사`);
  await praise(page, app);
  await songRow(page, '자료 A').click();
  await songRow(page, '자료 C').click({ modifiers: ['Control'] });
  let downloadPromise = page.waitForEvent('download');
  await page.locator('#btn-praise-export').click();
  let contents = JSON.parse(await fs.readFile(await (await downloadPromise).path(), 'utf8'));
  expect(contents.map(song => song.title).sort()).toEqual(['자료 A', '자료 C']);
  await page.locator('#btn-close-praise-viewer').click();
  downloadPromise = page.waitForEvent('download');
  await page.locator('#btn-praise-export').click();
  contents = JSON.parse(await fs.readFile(await (await downloadPromise).path(), 'utf8'));
  expect(contents.map(song => song.title).sort()).toEqual(['자료 A', '자료 B', '자료 C']);
});

test('SC-07-08 찬양 목록 Shift 범위 선택과 뷰어 닫기 선택 해제', async ({ page, app }) => {
  for (const title of ['범위 곡 A', '범위 곡 B', '범위 곡 C', '범위 곡 D']) await seedSong(app, title, `${title} 가사`);
  await praise(page, app);
  const rows = page.locator('#praise-songs-list .bible-result-item');
  await songRow(page, '범위 곡 A').click();
  await songRow(page, '범위 곡 C').click({ modifiers: ['Shift'] });
  await expect(page.locator('#praise-songs-list .bible-result-item.selected')).toHaveCount(3);
  await expect(page.locator('#praise-main-viewer-overlay')).toBeVisible();
  await page.locator('#btn-close-praise-viewer').click();
  await expect(page.locator('#praise-main-viewer-overlay')).toBeHidden();
  await expect(page.locator('#praise-songs-list .bible-result-item.selected')).toHaveCount(0);
});

test('SC-07-01 찬양 목록에서 실제 휠 스크롤로 아래 곡에 접근한다', async ({ page, app }) => {
  for (let index = 0; index < 24; index++) await seedSong(app, `스크롤 곡 ${String(index).padStart(2, '0')}`, `가사 ${index}`);
  await praise(page, app);
  const list = page.locator('#praise-songs-list');
  await expect(songRow(page, '스크롤 곡 23')).toHaveCount(1);
  await list.hover();
  await page.mouse.wheel(0, 1200);
  await expect.poll(() => list.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await expect(songRow(page, '스크롤 곡 23')).toBeInViewport();
});

test('SC-08-08 editing song data affects new slides while generated slides remain unchanged', async ({ page, app }) => {
  await seedSong(app, '수정관계 시험', '원본 가사');
  await praise(page, app);
  await generateSong(page, '수정관계 시험');
  await expect.poll(async () => (await project(app)).slides.length).toBe(3);
  const oldSlide = (await project(app)).slides[2];
  await songRow(page, '수정관계 시험').click();
  await page.locator('#btn-praise-edit-selected').click();
  await page.locator('#modal-praise-lyrics').fill('새로운 가사');
  await page.locator('#btn-praise-modal-save').click();
  await expect(page.locator('#praise-add-modal')).toBeHidden();
  await page.locator('#btn-add-praise-slides').click();
  await insert(page);
  await expect.poll(async () => (await project(app)).slides.length).toBe(4);
  const slides = (await project(app)).slides;
  expect(slides[2]).toEqual(oldSlide);
  expect(lyricsOf(slides[3])).toContain('새로운 가사');
});

test('SC-10-02 multi-file upload stores both separate media files', async ({ page, app }) => {
  await stage(page, app);
  const buffer = await fs.readFile(app.videoPath);
  await page.locator('#file-upload-bg-input').setInputFiles(['alpha', 'beta'].map(name => ({ name: `${name}.mp4`, mimeType: 'video/mp4', buffer })));
  await expect(page.locator('#stage-bg-upload-status')).toContainText('[2/2]', { timeout: 30_000 });
  await expect(page.locator('#stage-bg-upload-status')).toContainText('완료', { timeout: 30_000 });
  await expect(page.locator('.stage-bg-card-main')).toHaveCount(2);
  expect((await backgrounds(app)).map(file => file.title).sort()).toEqual(['alpha.mp4', 'beta.mp4']);
});

test('SC-10-05 현장 배경 라이브러리 휠 스크롤과 Ctrl+휠 그리드 확대', async ({ page, app }) => {
  for (let index = 0; index < 24; index++) await seedBackground(app, `스크롤 배경 ${index}.mp4`);
  await page.setViewportSize({ width: 1920, height: 700 });
  await stage(page, app);
  const body = page.locator('#stage-bg-main-grid-body');
  const grid = page.locator('#stage-bg-main-grid');
  await expect(page.locator('.stage-bg-card-main')).toHaveCount(24);
  await body.hover();
  await page.mouse.wheel(0, 900);
  await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  const before = await grid.evaluate(element => element.style.gridTemplateColumns);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -240);
  await page.keyboard.up('Control');
  await expect.poll(() => grid.evaluate(element => element.style.gridTemplateColumns)).not.toBe(before);
});

test('SC-10-04 청크 병합 해시·누락 거부·전송 재시도 확인', async ({ page, app }) => {
  const source = await fs.readFile(app.videoPath);
  const splitAt = Math.max(1, Math.floor(source.length / 2));
  const uploadId = 'sc1004_success';
  for (const [index, chunk] of [source.subarray(0, splitAt), source.subarray(splitAt)].entries()) {
    const response = await app.request.post('/api/backgrounds/upload-chunk', { multipart: {
      upload_id: uploadId, chunk_index: String(index), total_chunks: '2',
      file: { name: 'chunk.bin', mimeType: 'application/octet-stream', buffer: chunk },
    } });
    expect(response.ok()).toBeTruthy();
  }
  const complete = await app.request.post('/api/backgrounds/upload-complete', { data: {
    upload_id: uploadId, filename: 'sc1004-hash.mp4', total_chunks: 2,
  } });
  expect(complete.ok()).toBeTruthy();
  const uploaded = await complete.json();
  const downloaded = await (await app.request.get(uploaded.videoUrl)).body();
  expect(createHash('sha256').update(downloaded).digest('hex')).toBe(createHash('sha256').update(source).digest('hex'));

  const beforeMissing = await backgrounds(app);
  const missingId = 'sc1004_missing';
  await app.request.post('/api/backgrounds/upload-chunk', { multipart: {
    upload_id: missingId, chunk_index: '0', total_chunks: '2',
    file: { name: 'chunk.bin', mimeType: 'application/octet-stream', buffer: source },
  } });
  const missing = await app.request.post('/api/backgrounds/upload-complete', { data: {
    upload_id: missingId, filename: 'sc1004-incomplete.mp4', total_chunks: 2,
  } });
  expect(missing.status()).toBe(400);
  expect((await backgrounds(app)).map(file => file.name).sort()).toEqual(beforeMissing.map(file => file.name).sort());

  await stage(page, app);
  let attempts = 0;
  await page.route('**/api/backgrounds/upload-chunk', async route => {
    attempts++;
    if (attempts < 3) await route.fulfill({ status: 503, body: 'temporary failure' });
    else await route.continue();
  });
  await page.locator('#file-upload-bg-input').setInputFiles({ name: 'retry-sc1004.mp4', mimeType: 'video/mp4', buffer: source });
  await expect(page.locator('#stage-bg-upload-status')).toContainText('완료', { timeout: 30_000 });
  expect(attempts).toBe(3);
  expect((await backgrounds(app)).some(file => file.title === 'retry-sc1004.mp4')).toBe(true);
});

test('SC-10-05 썸네일 유무와 관계없이 영상 목록과 원본 영상은 사용할 수 있다', async ({ app }) => {
  const uploaded = await seedBackground(app, 'thumbnail-environment.mp4');
  const files = await backgrounds(app);
  const item = files.find(file => file.name === uploaded.filename);
  expect(item).toBeTruthy();
  expect((await app.request.get(item.url)).ok()).toBe(true);
  if (item.thumbnailUrl) {
    const thumbnail = await app.request.get(item.thumbnailUrl);
    expect(thumbnail.ok()).toBe(true);
    expect(thumbnail.headers()['content-type']).toContain('image/');
    expect((await thumbnail.body()).length).toBeGreaterThan(0);
  }
});

test('SC-11-09 편집기 두 창의 태그 갱신과 새 자료 생성', async ({ page, context, app }) => {
  const existingBg = await seedBackground(app, 'existing-background.mp4');
  const data = await app.exportProject();
  data.slides[0].praiseGroupId = 'existing-group';
  const id = await app.seedProject(data);
  const second = await context.newPage();
  await openEditor(page, app);
  await backgroundModal(page, 'slide_a');
  await page.locator('.slide-bg-modal-item-card').filter({ hasText: existingBg.filename }).click();
  await expect.poll(async () => (await app.exportProject(id)).slides[0].overrideBgId).toBe(existingBg.filename);
  const existingAssignment = (await app.exportProject(id)).slides[0].overrideBgId;
  await page.locator('#slide-item-slide_b').click();
  await expect(page.locator('#slide-item-slide_b')).toHaveClass(/editing/);
  await openEditor(second, app);

  await page.locator('[data-target="panel-praise"]').click();
  await page.locator('#praise-mood-filter-chips .btn-open-tag-manager').click();
  await page.locator('#input-new-mood-tag').fill('SC11 이전 태그');
  await page.locator('#btn-add-mood-tag').click();
  const oldTag = page.locator('.mood-tag-row').filter({ hasText: 'SC11 이전 태그' });
  await expect(oldTag).toBeVisible();
  page.once('dialog', dialog => dialog.accept('SC11 새 태그'));
  await oldTag.getByRole('button', { name: '이름 변경' }).click();
  await expect(page.locator('.mood-tag-row').filter({ hasText: 'SC11 새 태그' })).toBeVisible();
  await expect.poll(() => second.evaluate(() => window.moodTags.some(tag => tag.name === 'SC11 새 태그'))).toBe(true);
  await second.locator('[data-target="panel-praise"]').click();
  await expect(second.locator('#praise-mood-filter-chips [data-filter="SC11 새 태그"]')).toBeVisible();

  await second.locator('#btn-praise-open-add-modal').click();
  await second.locator('#modal-praise-title').fill('새 태그 곡');
  await second.locator('#modal-praise-lyrics').fill('새 태그의 가사');
  await second.locator('#modal-praise-mood-chips [data-mood="SC11 새 태그"]').click();
  await second.locator('#btn-praise-modal-save').click();
  await expect(second.locator('#praise-add-modal')).toBeHidden();
  expect((await songs(app)).find(song => song.title === '새 태그 곡').mood).toBe('SC11 새 태그');
  const saved = await app.exportProject(id);
  expect(saved.slides[0]).toMatchObject({ praiseGroupId: 'existing-group', overrideBgId: existingAssignment });
});

test('SC-10-07 rename Escape cancels and collision rejects without removing either file', async ({ page, app }) => {
  const first = await seedBackground(app, 'rename-one.mp4');
  const second = await seedBackground(app, 'rename-two.mp4');
  await stage(page, app);
  const title = page.locator(`.stage-bg-title[data-filename="${first.filename}"]`);
  await title.dblclick();
  await page.locator('.stage-bg-name-input').fill('cancelled');
  await page.locator('.stage-bg-name-input').press('Escape');
  expect((await backgrounds(app)).map(file => file.name)).toContain(first.filename);
  await title.dblclick();
  await page.locator('.stage-bg-name-input').fill(second.filename);
  expect(await alertFrom(page, () => page.locator('.stage-bg-name-input').press('Enter'))).toContain('동일한 이름');
  expect((await backgrounds(app)).map(file => file.name).sort()).toEqual([first.filename, second.filename].sort());
  await title.dblclick();
  await page.locator('.stage-bg-name-input').fill('renamed-final');
  await page.locator('.stage-bg-name-input').press('Enter');
  await expect(page.locator('.stage-bg-title[data-filename="renamed-final.mp4"]')).toHaveCount(1);
  expect((await backgrounds(app)).map(file => file.name)).toContain('renamed-final.mp4');
});

test('SC-10-08 repeated background copy and paste creates distinct playable files', async ({ page, app }) => {
  const original = await seedBackground(app, 'duplicate-source.mp4');
  await stage(page, app);
  await page.locator('.stage-bg-card-main').click({ button: 'right' });
  await page.locator('#menu-stage-bg-copy').click();
  for (let count = 2; count <= 3; count++) {
    await page.locator('.stage-bg-card-main').first().click({ button: 'right' });
    await page.locator('#menu-stage-bg-paste').click();
    await expect(page.locator('.stage-bg-card-main')).toHaveCount(count);
  }
  const files = await backgrounds(app);
  expect(new Set(files.map(file => file.name)).size).toBe(3);
  expect(files.map(file => file.name)).toContain(original.filename);
  for (const file of files) expect((await app.request.get(file.url)).ok()).toBeTruthy();
});

test('SC-10-09 deleting current video can cancel then chooses remaining video and finally ambient', async ({ page, app }) => {
  await seedBackground(app, 'delete-one.mp4');
  await seedBackground(app, 'delete-two.mp4');
  await stage(page, app);
  await page.locator('.stage-bg-card-main').first().click();
  await alertFrom(page, () => page.locator('#btn-stage-bg-bulk-delete').click(), false);
  await expect(page.locator('.stage-bg-card-main')).toHaveCount(2);
  await alertFrom(page, () => page.locator('#btn-stage-bg-bulk-delete').click());
  await expect(page.locator('.stage-bg-card-main')).toHaveCount(1);
  await expect.poll(async () => (await backgrounds(app)).length).toBe(1);
  await expect.poll(() => page.locator('#pip-bg-video').evaluate(video => video.readyState)).toBeGreaterThanOrEqual(2);
  await alertFrom(page, () => page.locator('#btn-stage-bg-bulk-delete').click());
  await expect(page.locator('.stage-bg-card-main')).toHaveCount(0);
  await expect(page.locator('#pip-bg-video')).toBeHidden();
  await expect(page.locator('#pip-bg-ambient-canvas')).toBeVisible();
});

test('SC-10-10 opacity blur PiP minimize and closing persist source settings', async ({ page, app }) => {
  await seedBackground(app, 'effects.mp4');
  await stage(page, app);
  await page.locator('.stage-bg-card-main').click();
  await page.locator('#range-stage-bg-opacity').fill('45');
  await page.locator('#range-stage-bg-blur').fill('7');
  await expect(page.locator('#pip-bg-video')).toHaveCSS('opacity', '0.45');
  await expect(page.locator('#pip-bg-video')).toHaveCSS('filter', 'blur(7px)');
  await page.locator('#btn-pip-toggle-min').click();
  await expect(page.locator('#pip-body')).toBeHidden();
  await page.locator('#btn-pip-toggle-min').click();
  await expect(page.locator('#pip-body')).toBeVisible();
  await page.locator('#btn-pip-close').click();
  await expect(page.locator('#pip-stage-preview-container')).toBeHidden();
  await expect.poll(async () => (await project(app)).settings.stageBackground?.opacity).toBe(0.45);
  await page.reload();
  await page.locator('[data-target="panel-stage-bg"]').click();
  await expect(page.locator('#range-stage-bg-opacity')).toHaveValue('45');
  await expect(page.locator('#range-stage-bg-blur')).toHaveValue('7');
});

test('SC-11-04/SC-10-06 bulk mood tags persist and filter combines with filename search', async ({ page, app }) => {
  await seedBackground(app, 'tag-alpha.mp4');
  await seedBackground(app, 'tag-beta.mp4');
  await stage(page, app);
  await page.locator('.stage-bg-card-main').nth(0).locator('input[type="checkbox"]').check();
  await page.locator('.stage-bg-card-main').nth(1).locator('input[type="checkbox"]').check();
  await page.locator('#btn-stage-bg-bulk-moods').click();
  await page.locator('.stage-bg-mood-chip[data-mood="잔잔/묵상"]').click();
  await page.locator('#btn-stage-bg-mood-modal-save').click();
  await expect(page.locator('#stage-bg-mood-modal')).toBeHidden();
  expect((await backgrounds(app)).every(file => file.moods.includes('잔잔/묵상'))).toBeTruthy();
  await page.locator('#select-stage-bg-filter').selectOption('video');
  await page.locator('#input-stage-bg-search').fill('alpha');
  await expect(page.locator('.stage-bg-card-main')).toHaveCount(1);
  await page.reload();
  await page.locator('[data-target="panel-stage-bg"]').click();
  await expect(page.locator('.stage-bg-card-main').filter({ hasText: '#잔잔/묵상' })).toHaveCount(2);
});

test('SC-11-05 matching uses an unused tagged candidate for the second song', async ({ page, app }) => {
  const { files, id } = await taggedBackgrounds(page, app, ['잔잔/묵상', '잔잔/묵상']);
  await seedSong(app, '매칭 A', 'A 가사', '잔잔/묵상');
  await seedSong(app, '매칭 B', 'B 가사', '잔잔/묵상');
  await praise(page, app);
  await generateSong(page, '매칭 A');
  await expect.poll(async () => (await app.exportProject(id)).slides.length).toBe(3);
  await generateSong(page, '매칭 B');
  await expect.poll(async () => (await app.exportProject(id)).slides.length).toBe(4);
  const added = (await app.exportProject(id)).slides.slice(2);
  expect(files.map(file => file.name)).toContain(added[0].overrideBgId);
  expect(files.map(file => file.name)).toContain(added[1].overrideBgId);
  expect(added[0].overrideBgId).not.toBe(added[1].overrideBgId);
});

test('SC-11-06 default background is matched when song mood has no candidates', async ({ page, app }) => {
  const file = await seedBackground(app, 'default.mp4');
  await seedSong(app, '기본 매칭', '가사', '잔잔/묵상');
  await stage(page, app);
  await page.locator('.stage-bg-card-main input[type="checkbox"]').check();
  await alertFrom(page, () => page.locator('#btn-stage-bg-bulk-default').click());
  await expect(page.locator('.stage-bg-card-main')).toContainText('기본');
  await generateSong(page, '기본 매칭');
  await expect.poll(async () => (await project(app)).slides.length).toBe(3);
  expect((await project(app)).slides[2].overrideBgId).toBe(file.filename);
});

test('SC-11-07/08 direct single-slide assignment and reset leave other slides untouched', async ({ page, app }) => {
  const file = await seedBackground(app, 'direct.mp4');
  await openEditor(page, app);
  await backgroundModal(page, 'slide_a');
  await expect(page.locator('#chk-slide-bg-modal-apply-all-song')).toBeDisabled();
  await page.locator('.slide-bg-modal-item-card').click();
  await expect.poll(async () => (await project(app)).slides[0].overrideBgId).toBe(file.filename);
  expect((await project(app)).slides[1].overrideBgId ?? null).toBeNull();
  await backgroundModal(page, 'slide_a');
  await alertFrom(page, () => page.locator('#btn-slide-bg-modal-clear-override').click());
  await expect.poll(async () => (await project(app)).slides[0].overrideBgId).toBeNull();
});

test('SC-08-07/SC-11-07 group background assignment isolates repeated same-title groups', async ({ page, app }) => {
  const { files, id } = await taggedBackgrounds(page, app, ['기본/일반', '기본/일반']);
  await seedSong(app, '독립 그룹', '첫 가사\n\n다음 가사');
  await praise(page, app);
  for (let count = 4; count <= 6; count += 2) {
    await generateSong(page, '독립 그룹');
    await expect.poll(async () => (await app.exportProject(id)).slides.length).toBe(count);
  }
  const before = (await app.exportProject(id)).slides;
  const replacement = files.find(file => file.name !== before[2].overrideBgId);
  await backgroundModal(page, before[2].id);
  await expect(page.locator('#chk-slide-bg-modal-apply-all-song')).toBeChecked();
  await page.locator(`.slide-bg-modal-item-card[data-id="${replacement.name}"]`).click();
  await expect.poll(async () => (await app.exportProject(id)).slides[2].overrideBgId).toBe(replacement.name);
  const after = (await app.exportProject(id)).slides;
  expect(after[3].overrideBgId).toBe(replacement.name);
  expect(after.slice(4).map(slide => slide.overrideBgId)).toEqual(before.slice(4).map(slide => slide.overrideBgId));
});

test('SC-09-07 long fixture verse divides at 80 characters without dropping text', async ({ page, app }) => {
  const text = '가'.repeat(185);
  const python = process.env.SUBCAST_TEST_PYTHON || path.resolve(__dirname, '../../venv/Scripts/python.exe');
  const result = spawnSync(python, ['-c', 'import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute("UPDATE bible SET content=? WHERE version_code=\'KRV\' AND verse=1", (sys.argv[2],)); c.commit()', path.join(app.dataDir, 'bible.db'), text], { windowsHide: true, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  await bible(page, app, '1');
  await page.locator('#chk-select-all-bible').check();
  await page.locator('#chk-bible-trailing-blank').uncheck();
  await page.locator('#select-bible-split-mode').selectOption('auto');
  await expect(page.locator('#val-expected-slides')).toHaveText('3');
  await page.locator('#btn-add-bible-slides').click();
  await insert(page);
  await expect.poll(async () => (await project(app)).slides.length).toBe(5);
  const body = (await project(app)).slides.slice(2).map(slide => slide.elements.find(element => element.id.startsWith('elem_bible_c_')).content);
  expect(body.map(content => content.length)).toEqual([80, 80, 25]);
  expect(body.join('')).toBe(text);
});

test('SC-09-01 성경 권 자동완성 Enter 선택과 바깥 클릭 닫기', async ({ page, app }) => {
  await openEditor(page, app);
  await page.locator('[data-target="panel-bible"]').click();
  const filter = page.locator('#input-bible-book-filter');
  const popup = page.locator('#bible-book-dropdown-popup');
  await filter.fill('GEN');
  await expect(popup.locator('.bible-book-dropdown-item')).toHaveText(['창세기']);
  await filter.press('Enter');
  await expect(filter).toHaveValue('창세기');
  await expect(page.locator('#select-bible-book')).toHaveValue('GEN');
  await expect(popup).toBeHidden();
  await expect(page.locator('#input-bible-chapter')).toBeFocused();
  await filter.fill('없는성경권');
  await expect(popup).toContainText('검색 결과 없음');
  await page.locator('#input-bible-chapter').click();
  await expect(popup).toBeHidden();
  await expect(page.locator('#select-bible-book')).toHaveValue('GEN');
  await page.locator('#input-bible-start-verse').fill('3');
  await page.locator('#input-bible-end-verse').fill('4');
  await page.locator('#input-bible-chapter').press('Enter');
  await expect(page.locator('#input-bible-start-verse')).toHaveValue('1');
  await expect(page.locator('#input-bible-end-verse')).toHaveValue('');
  await expect(page.locator('#bible-results-list .bible-result-item')).toHaveCount(5);
});

test('SC-09-05 성경 표 선택 동기화와 Ctrl 휠 글자 조절 및 닫기', async ({ page, app }) => {
  await bible(page, app, '5');
  const overlay = page.locator('#bible-main-viewer-overlay');
  const rows = page.locator('#tbody-bible-main-viewer tr');
  const label = page.locator('#bible-viewer-fontsize-label');
  await expect(overlay).toBeVisible();
  await rows.nth(0).click();
  await rows.nth(2).click({ modifiers: ['Shift'] });
  await expect(page.locator('#bible-viewer-selected-count')).toHaveText('3');
  await expect(page.locator('#val-selected-count')).toHaveText('3');
  await expect(page.locator('#bible-results-list .bible-item-checkbox:checked')).toHaveCount(3);
  await rows.nth(1).click({ modifiers: ['Control'] });
  await expect(page.locator('#bible-viewer-selected-count')).toHaveText('2');
  await page.locator('#btn-bible-font-increase').click();
  await expect(label).toHaveText('17px');
  await page.locator('#btn-bible-font-decrease').click();
  await expect(label).toHaveText('16px');
  await rows.nth(0).hover();
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -120);
  await page.keyboard.up('Control');
  await expect(label).toHaveText('17px');
  await expect(page.locator('#table-bible-main-viewer')).toHaveCSS('font-size', '17px');
  await page.locator('#btn-bible-font-reset').click();
  await expect(label).toHaveText('16px');
  await page.keyboard.press('Delete');
  expect((await project(app)).slides).toHaveLength(2);
  await expect(rows).toHaveCount(5);
  await page.locator('#btn-close-bible-viewer').click();
  await expect(overlay).toBeHidden();
  await expect(page.locator('#val-selected-count')).toHaveText('2');
});

test('SC-07-07 찬양 Ctrl 선택 토글과 Delete 취소 및 선택 곡만 삭제', async ({ page, app }) => {
  for (const title of ['선택 곡 A', '선택 곡 B', '보존 곡 C']) await seedSong(app, title, `${title} 가사`);
  await praise(page, app);
  await songRow(page, '선택 곡 A').click();
  await songRow(page, '선택 곡 B').click({ modifiers: ['Control'] });
  await expect(page.locator('#praise-songs-list .selected')).toHaveCount(2);
  await songRow(page, '선택 곡 B').click({ modifiers: ['Control'] });
  await expect(page.locator('#praise-songs-list .selected')).toHaveCount(1);
  await expect(songRow(page, '선택 곡 A')).toHaveClass(/selected/);
  await songRow(page, '선택 곡 B').click({ modifiers: ['Control'] });
  await alertFrom(page, () => page.keyboard.press('Delete'), false);
  await expect(page.locator('#praise-songs-list .selected')).toHaveCount(2);
  expect((await songs(app))).toHaveLength(3);
  await alertFrom(page, () => page.keyboard.press('Delete'));
  await expect(page.locator('#praise-songs-list .bible-result-item')).toHaveCount(1);
  await expect(songRow(page, '보존 곡 C')).toBeVisible();
  await expect.poll(async () => (await songs(app)).map(song => song.title)).toEqual(['보존 곡 C']);
});

test('SC-10-09 현장 배경 Ctrl 토글과 Shift 범위 선택', async ({ page, app }) => {
  for (const name of ['선택-A.mp4', '선택-B.mp4', '선택-C.mp4', '보존-D.mp4']) await seedBackground(app, name);
  await stage(page, app);
  const cards = page.locator('.stage-bg-card-main');
  await expect(cards).toHaveCount(4);
  await cards.nth(0).click();
  await cards.nth(2).click({ modifiers: ['Shift'] });
  await expect(page.locator('.stage-bg-card-main.selected')).toHaveCount(3);
  await expect(page.locator('#stage-bg-bulk-count')).toContainText('3개');
  await cards.nth(1).click({ modifiers: ['Control'] });
  await expect(page.locator('.stage-bg-card-main.selected')).toHaveCount(2);
  await cards.nth(1).click({ modifiers: ['Control'] });
  await expect(page.locator('.stage-bg-card-main.selected')).toHaveCount(3);
});
