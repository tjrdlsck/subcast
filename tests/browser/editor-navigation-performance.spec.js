const { test, expect } = require('./fixtures');

test('403개 슬라이드에서 편집기가 연결·잠금·캔버스 준비까지 1초 안에 도달한다', async ({ page, app }, testInfo) => {
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
  const lockAcks = [];
  let currentTransition = 0;
  await page.addInitScript(() => {
    window.__editorNavigationLongTasks = [];
    if (window.PerformanceObserver) {
      const observer = new PerformanceObserver(entries => {
        window.__editorNavigationLongTasks.push(...entries.getEntries().map(entry => entry.duration));
      });
      observer.observe({ type: 'longtask', buffered: true });
    }
  });
  page.on('websocket', socket => {
    socket.on('framereceived', frame => {
      if (typeof frame.payload !== 'string') return;
      try {
        const message = JSON.parse(frame.payload);
        if (message.type === 'SLIDE_LOCKED' && message.slideId === `perf_slide_${liveIndex}`) {
          lockAcks.push({ transition: currentTransition, url: page.url(), receivedAt: performance.now() });
        }
        if (message.type === 'INITIAL_SYNC' || message.type === 'THUMBNAILS_SYNC') {
          syncFrames.push({
            type: message.type,
            url: page.url(),
            transition: currentTransition,
            receivedAt: performance.now(),
            bytes: Buffer.byteLength(frame.payload),
            slideCount: message.data?.slides?.length,
            thumbnailCount: Object.keys(message.thumbnails || {}).length,
            batchIndex: message.batchIndex,
            batchCount: message.batchCount,
          });
        }
      } catch {}
    });
  });

  await page.goto('/static/presenter.html');
  await expect(page.locator('#slide-list .slide-item')).toHaveCount(403);
  await expect(page.locator('#slide-item-perf_slide_202')).toBeVisible();

  const transitionTimes = [];
  const thumbnailReadyTimes = [];
  for (let transition = 0; transition < 5; transition++) {
    currentTransition = transition + 1;
    const startedAt = performance.now();
    await page.locator('a[href="/static/editor.html"]').click();
    await expect(page.locator('#slide-item-perf_slide_202.editing')).toBeVisible();
    await expect(page.locator('#status-text')).toHaveText('연결됨');
    await expect(page.locator('#editor-canvas')).toBeVisible();
    await expect.poll(() => lockAcks.filter(ack => ack.transition === transition + 1).length, {
      message: 'LIVE 슬라이드 편집 잠금 확인',
    }).toBeGreaterThan(0);
    transitionTimes.push(Math.round(performance.now() - startedAt));
    await expect(page.locator('#slide-list .slide-item img')).toHaveCount(403);
    thumbnailReadyTimes.push(Math.round(performance.now() - startedAt));

    if (transition < 4) {
      await page.locator('a[href="/static/presenter.html"]').click();
      await expect(page.locator('#slide-list .slide-item')).toHaveCount(403);
    }
  }
  const sortedTimes = [...transitionTimes].sort((a, b) => a - b);
  const p50Ms = sortedTimes[Math.floor(sortedTimes.length * 0.5)];
  const p95Ms = sortedTimes[Math.ceil(sortedTimes.length * 0.95) - 1];
  const sortedThumbnailTimes = [...thumbnailReadyTimes].sort((a, b) => a - b);
  const thumbnailP95Ms = sortedThumbnailTimes[Math.ceil(sortedThumbnailTimes.length * 0.95) - 1];
  const editorSync = syncFrames.findLast(frame => frame.type === 'INITIAL_SYNC' && frame.transition === 5 && frame.url.endsWith('/static/editor.html'));
  expect(editorSync?.slideCount).toBe(403);
  expect(editorSync.bytes, '썸네일은 편집기 첫 동기화 페이로드에서 분리되어야 한다').toBeLessThan(500_000);

  const thumbnailFrames = syncFrames.filter(frame => frame.type === 'THUMBNAILS_SYNC' && frame.transition === 5 && frame.url.endsWith('/static/editor.html'));
  const thumbnailSync = {
    frameCount: thumbnailFrames.length,
    thumbnailCount: thumbnailFrames.reduce((sum, frame) => sum + frame.thumbnailCount, 0),
    bytes: thumbnailFrames.reduce((sum, frame) => sum + frame.bytes, 0),
    lastReceivedAt: thumbnailFrames.at(-1)?.receivedAt,
    largestBatch: Math.max(...thumbnailFrames.map(frame => frame.thumbnailCount)),
  };
  expect(thumbnailSync.frameCount).toBeGreaterThan(1);
  expect(thumbnailSync.thumbnailCount).toBe(403);
  expect(thumbnailSync.largestBatch).toBeLessThanOrEqual(64);
  expect(thumbnailSync.bytes).toBeGreaterThan(3_000_000);
  expect(thumbnailSync.lastReceivedAt).toBeGreaterThan(editorSync.receivedAt);
  const longTasks = await page.evaluate(() => window.__editorNavigationLongTasks || []);
  const longestTaskMs = Math.max(0, ...longTasks);
  console.log(`Editor transitions: ${JSON.stringify(transitionTimes)}ms (p50 ${p50Ms}ms, p95 ${p95Ms}ms); all thumbnails: ${JSON.stringify(thumbnailReadyTimes)}ms (p95 ${thumbnailP95Ms}ms); longest main-thread task: ${longestTaskMs}ms; initial sync: ${JSON.stringify(editorSync)}; thumbnails: ${JSON.stringify(thumbnailSync)}`);

  await testInfo.attach('editor-navigation-metrics', {
    body: Buffer.from(JSON.stringify({ transitionTimes, p50Ms, p95Ms, thumbnailReadyTimes, thumbnailP95Ms, longTasks, longestTaskMs, editorSync, thumbnailSync }, null, 2)),
    contentType: 'application/json',
  });
  expect(p95Ms, '송출에서 편집이 연결되고 LIVE 카드 잠금과 캔버스가 준비되기까지').toBeLessThanOrEqual(1000);
  expect(thumbnailP95Ms, '편집 화면 진입 후 전체 썸네일을 복원하기까지').toBeLessThanOrEqual(1500);
  expect(longestTaskMs, '브라우저 메인 스레드가 한 번에 100ms 넘게 막히지 않도록').toBeLessThanOrEqual(100);
});
