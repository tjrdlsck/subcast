const { test, expect } = require('./fixtures');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');

const projectFile = process.env.SUBCAST_PERF_PROJECT_FILE || path.resolve(
  process.cwd(),
  'project_10월 9일 4시간 기도회8인도자_proj_db4ef050json (2)_프로그램호환.json',
);
test.skip(!fsSync.existsSync(projectFile), `Set SUBCAST_PERF_PROJECT_FILE to an available project JSON: ${projectFile}`);

async function waitPresenterReady(page, liveId) {
  await expect(page.locator('#status-text')).toHaveText('연결됨');
  await expect(page.locator('#live-status-badge')).toHaveClass(/on/);
  await expect(page.locator(`#slide-item-${liveId}.live`)).toBeVisible();
}

async function waitEditorReady(page, liveId, liveText) {
  await expect(page.locator('#status-text')).toHaveText('연결됨');
  await expect(page.locator(`#slide-item-${liveId}.editing`)).toBeVisible();
  await expect(page.locator('#btn-add-text-body')).toBeEnabled();
  await expect.poll(() => page.evaluate(({ liveId, liveText }) =>
    activeSlideId === liveId && Boolean(myEditorId) && lockedSlides[liveId]?.ownerId === myEditorId
      && (!liveText || canvas.getObjects().some(object => object.text === liveText)), { liveId, liveText }),
  { message: '편집 페이지가 실제 LIVE 슬라이드와 잠금을 준비해야 함' }).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const list = document.getElementById('slide-list');
    if (!list) return false;
    const bounds = list.getBoundingClientRect();
    const images = [...list.querySelectorAll('.slide-item')].filter(card => {
      const rect = card.getBoundingClientRect();
      return rect.bottom > Math.max(0, bounds.top) && rect.top < Math.min(innerHeight, bounds.bottom);
    }).map(card => card.querySelector('img'));
    return images.length > 0 && images.every(image => image?.complete && image.naturalWidth > 0);
  }), { message: '보이는 썸네일까지 렌더되어야 함' }).toBe(true);
}

test('실제 프로젝트에서 편집 스크립트 사전 로드가 전환 시간을 줄이는지 비교한다', async ({ page, app }, testInfo) => {
  test.setTimeout(240_000);
  const project = JSON.parse(await fs.readFile(projectFile, 'utf8'));
  const liveId = project.settings.currentLiveSlideId;
  const liveSlide = project.slides.find(slide => slide.id === liveId);
  expect(liveSlide).toBeTruthy();
  const liveText = liveSlide.elements?.find(element => element.type === 'text')?.content || '';
  const slideCount = project.slides.length;
  await app.seedProject(project);

  const samples = [];
  for (let repetition = 0; repetition < 3; repetition++) {
    const treatments = repetition % 2 === 0 ? ['cold', 'prefetched'] : ['prefetched', 'cold'];
    for (const treatment of treatments) {
      const context = await page.context().browser().newContext({ baseURL: app.url });
      const fabric = await fs.readFile(path.join(process.cwd(), 'test_results/browser/cache/fabric.min.js'));
      await context.route('https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.0/fabric.min.js', route =>
        route.fulfill({ body: fabric, contentType: 'application/javascript' }));
      await context.route('https://fonts.googleapis.com/**', route =>
        route.fulfill({ body: '', contentType: 'text/css' }));
      await context.route('**/api/system/check-update', async route => {
        const response = await app.request.get('/api/system/version');
        const { version } = await response.json();
        await route.fulfill({ json: { has_update: false, current_version: version, latest_version: version } });
      });
      await context.route('**/api/system/auto-update', route =>
        route.fulfill({ status: 403, json: { detail: 'Browser test disables installer execution.' } }));
      const runPage = await context.newPage();
      const browserErrors = [];
      const websocketRoles = [];
      runPage.on('pageerror', error => browserErrors.push(error.message));
      runPage.on('websocket', socket => websocketRoles.push(new URL(socket.url()).searchParams.get('role')));

      await runPage.goto('/static/presenter.html');
      await waitPresenterReady(runPage, liveId);
      let prefetchedScripts = 0;
      if (treatment === 'prefetched') {
        prefetchedScripts = await runPage.evaluate(async () => {
          const response = await fetch('/static/editor.html');
          if (!response.ok) throw new Error(`editor.html prefetch list request failed: ${response.status}`);
          const markup = new DOMParser().parseFromString(await response.text(), 'text/html');
          const urls = [...markup.querySelectorAll('script[src]')]
            .map(script => new URL(script.getAttribute('src'), location.href).href)
            .filter(url => new URL(url).origin === location.origin);
          await Promise.all(urls.map(url => new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = 'script';
            link.href = url;
            link.onload = resolve;
            link.onerror = () => reject(new Error(`Failed to preload ${url}`));
            document.head.append(link);
          })));
          return urls.length;
        });
        expect(prefetchedScripts).toBeGreaterThan(0);
      }
      await expect.poll(() => websocketRoles).toContain('presenter');
      expect(websocketRoles).not.toContain('editor');
      const clickStart = Date.now();
      await runPage.locator('a[href="/static/editor.html"]').click();
      await waitEditorReady(runPage, liveId, liveText);
      const clickToUsableMs = Date.now() - clickStart;
      await expect(runPage.locator('#slide-list .slide-item')).toHaveCount(slideCount);
      const resources = await runPage.evaluate(() => performance.getEntriesByType('resource')
        .filter(entry => entry.name.includes('/static/js/'))
        .map(entry => ({ path: new URL(entry.name).pathname, transferBytes: entry.transferSize,
          decodedBytes: entry.decodedBodySize, durationMs: Math.round(entry.duration) })));
      samples.push({ treatment, repetition: repetition + 1, clickToUsableMs, prefetchedScripts,
        cachedScriptCount: resources.filter(resource => resource.transferBytes === 0).length,
        scriptCount: resources.length, browserErrors });
      await context.close();
    }
  }

  const summary = Object.fromEntries(['cold', 'prefetched'].map(treatment => {
    const values = samples.filter(sample => sample.treatment === treatment).map(sample => sample.clickToUsableMs).sort((a, b) => a - b);
    return [treatment, { clickToUsableMs: values, medianMs: values[1],
      cachedScriptCountMedian: samples.filter(sample => sample.treatment === treatment)
        .map(sample => sample.cachedScriptCount).sort((a, b) => a - b)[1] }];
  }));
  const metrics = { project: path.basename(projectFile), slides: slideCount, repetitionsPerTreatment: 3, summary, samples,
    note: 'Separate browser contexts; condition order alternates. Playwright routes disable the HTTP cache, so this measures preload reuse within navigation, not persistent disk-cache behavior.' };
  console.log(`Editor prefetch experiment: ${JSON.stringify(metrics)}`);
  await testInfo.attach('editor-prefetch-experiment', { body: Buffer.from(JSON.stringify(metrics, null, 2)), contentType: 'application/json' });
  expect(samples.flatMap(sample => sample.browserErrors)).toEqual([]);
});
