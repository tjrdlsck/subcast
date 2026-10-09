const { test, expect, openEditor } = require('./fixtures');

const projectId = 'proj_browser';
const projectIds = new WeakMap();
const slides = [
  { id: 'praise_a', name: '찬양 A', slideType: 'praise', isPraise: true, elements: [{ id: 'a', type: 'text', content: '이전 버전 찬양 가사', x: 10, y: 20, width: 80, height: 25, style: { fontSize: '4vw', fontColor: '#ffffff', fontFamily: 'Arial' } }] },
  { id: 'blank', name: '빈 화면', slideType: 'blank', elements: [] },
  { id: 'bible', name: '성경', elements: [{ id: 'verse', type: 'text', content: '이전 버전 성경 본문', x: 10, y: 20, width: 80, height: 25, style: { fontSize: '4vw', fontColor: '#ffffff', fontFamily: 'Arial' } }] },
  { id: 'praise_b', name: '찬양 B', slideType: 'praise', isPraise: true, elements: [{ id: 'b', type: 'text', content: '다음 찬양 가사', x: 10, y: 20, width: 80, height: 25, style: { fontSize: '4vw', fontColor: '#ffffff', fontFamily: 'Arial' } }] },
];

async function seed(app) {
  const id = await app.seedProject({
    id: projectId, name: '릴리스 업데이트 후 예배',
    settings: { targetWidth: 1920, targetHeight: 1080, currentLiveSlideId: 'praise_a' },
    slides, templates: [], customFonts: [],
  });
  projectIds.set(app, id);
  return id;
}

async function savedProject(app) {
  return app.exportProject(projectIds.get(app));
}

async function presenter(page, app) {
  await page.goto(`${app.url}/static/presenter.html`);
  await expect(page.locator('#status-text')).toHaveText('연결됨');
}

async function output(context, app, channel) {
  const page = await context.newPage();
  await page.goto(`${app.url}/static/viewer.html?channel=${channel}`);
  await expect(page.locator('body')).not.toHaveClass(/system-disconnected/);
  return page;
}

async function texts(page) {
  return page.evaluate(() => canvas.getObjects().filter(object => object.text).map(object => object.text));
}

test('SC-17-05 migrated service data remains editable and usable after restart', async ({ page, context, app }) => {
  await seed(app);
  const before = await savedProject(app);
  await app.restart();

  await presenter(page, app);
  const viewer = await output(context, app, 'obs');
  await expect.poll(() => texts(viewer)).toEqual(['이전 버전 찬양 가사']);
  await page.locator('#slide-item-blank').click();
  await expect.poll(() => texts(viewer)).toEqual([]);
  await page.locator('#slide-item-bible').click();
  await expect.poll(() => texts(viewer)).toEqual(['이전 버전 성경 본문']);
  await page.locator('#slide-item-praise_b').click();
  await expect.poll(() => texts(viewer)).toEqual(['다음 찬양 가사']);

  await openEditor(page);
  await page.locator('#slide-item-praise_a').click();
  await page.locator('[data-target="panel-layers"]').click();
  await page.locator('.layer-item').first().click();
  await page.locator('#text-editor').fill('업데이트 후 수정한 가사');
  await page.locator('#text-editor').press('Tab');
  await expect.poll(async () => (await savedProject(app)).slides[0].elements[0].content)
    .toBe('업데이트 후 수정한 가사');

  await app.restart();
  const after = await savedProject(app);
  expect(after.slides.map(slide => slide.id)).toEqual(before.slides.map(slide => slide.id));
  expect(after.slides[0].elements[0].content).toBe('업데이트 후 수정한 가사');
  expect(after.slides[2].elements[0].content).toBe('이전 버전 성경 본문');
  await viewer.close();
});
