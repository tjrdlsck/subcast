const { test, expect } = require('./fixtures');

test('403개 슬라이드 프로젝트에서 송출→편집 진입이 2.5초 안에 LIVE 슬라이드를 선택한다', async ({ page, app }, testInfo) => {
  test.setTimeout(60_000);
  const project = await app.exportProject();
  const templateSlide = project.slides[0];
  const liveIndex = 202;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
  const thumbnail = `data:image/png;base64,${Buffer.concat([png, Buffer.alloc(7_500)]).toString('base64')}`;
  project.name = 'Editor navigation performance';
  project.slides = Array.from({ length: 403 }, (_, index) => ({
    ...templateSlide,
    id: `perf_slide_${index}`,
    name: `성능 측정 슬라이드 ${index + 1}`,
    thumbnail,
    elements: templateSlide.elements.map((element, elementIndex) => ({
      ...element,
      id: `perf_element_${index}_${elementIndex}`,
    })),
  }));
  project.settings.currentLiveSlideId = `perf_slide_${liveIndex}`;
  await app.seedProject(project);

  const syncFrames = [];
  page.on('websocket', socket => {
    socket.on('framereceived', frame => {
      if (typeof frame.payload !== 'string') return;
      try {
        const message = JSON.parse(frame.payload);
        if (message.type === 'INITIAL_SYNC' || message.type === 'THUMBNAILS_SYNC') {
          syncFrames.push({
            type: message.type,
            url: page.url(),
            receivedAt: performance.now(),
            bytes: Buffer.byteLength(frame.payload),
            slideCount: message.data?.slides?.length,
            thumbnailCount: Object.keys(message.thumbnails || {}).length,
          });
        }
      } catch {}
    });
  });

  await page.goto('/static/presenter.html');
  await expect(page.locator('#slide-list .slide-item')).toHaveCount(403);
  await expect(page.locator('#slide-item-perf_slide_202')).toBeVisible();

  const startedAt = performance.now();
  await page.locator('a[href="/static/editor.html"]').click();
  await expect(page.locator('#slide-item-perf_slide_202.editing')).toBeVisible();
  const durationMs = Math.round(performance.now() - startedAt);
  const editorSync = syncFrames.findLast(frame => frame.type === 'INITIAL_SYNC' && frame.url.endsWith('/static/editor.html'));
  expect(editorSync?.slideCount).toBe(403);
  expect(editorSync.bytes, '썸네일은 편집기 첫 동기화 페이로드에서 분리되어야 한다').toBeLessThan(500_000);

  await expect(page.locator('#slide-list .slide-item img')).toHaveCount(403);
  const thumbnailSync = syncFrames.findLast(frame => frame.type === 'THUMBNAILS_SYNC' && frame.url.endsWith('/static/editor.html'));
  expect(thumbnailSync?.thumbnailCount).toBe(403);
  expect(thumbnailSync.bytes).toBeGreaterThan(3_000_000);
  expect(thumbnailSync.receivedAt).toBeGreaterThan(editorSync.receivedAt);
  console.log(`Editor transition: ${durationMs}ms; initial sync: ${JSON.stringify(editorSync)}; thumbnails: ${JSON.stringify(thumbnailSync)}`);

  await testInfo.attach('editor-navigation-metrics', {
    body: Buffer.from(JSON.stringify({ durationMs, editorSync }, null, 2)),
    contentType: 'application/json',
  });
  expect(durationMs, '송출에서 편집으로 이동한 뒤 LIVE 슬라이드를 선택하기까지').toBeLessThan(2500);
});
