const { test, expect } = require('./fixtures');
test.use({ serverTiming: true });

async function visibleThumbnailsReady(page) {
  return page.evaluate(async () => {
    const list = document.getElementById('slide-list');
    if (!list) return false;
    const bounds = list.getBoundingClientRect();
    const cards = [...list.querySelectorAll('.slide-item')].filter(card => {
      const rect = card.getBoundingClientRect();
      return rect.bottom > Math.max(0, bounds.top) && rect.top < Math.min(innerHeight, bounds.bottom);
    });
    if (!cards.length) return false;
    const images = cards.map(card => card.querySelector('img'));
    if (images.some(image => !image?.complete || image.naturalWidth === 0)) return false;
    try {
      await Promise.all(images.map(image => image.decode()));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return true;
    } catch { return false; }
  });
}

function percentiles(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { p50Ms: sorted[Math.floor(sorted.length * 0.5)], p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] };
}

test('403개 슬라이드에서 송출·편집 양방향 전환의 사용 가능 시점과 전체 썸네일 데이터 준비를 측정한다', async ({ page, app }, testInfo) => {
  test.setTimeout(90_000);
  const project = await app.exportProject();
  const templateSlide = project.slides[0];
  const slideCount = 403;
  const liveIndex = 202;
  const liveId = `perf_slide_${liveIndex}`;
  const liveText = '성능 측정 LIVE 슬라이드';
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
  // Payload pressure only; this tiny PNG does not model real image decoding cost.
  const thumbnail = `data:image/png;base64,${Buffer.concat([png, Buffer.alloc(7_500)]).toString('base64')}`;
  project.name = 'Bidirectional navigation performance';
  project.slides = Array.from({ length: slideCount }, (_, index) => ({
    ...templateSlide,
    id: `perf_slide_${index}`,
    name: `성능 측정 슬라이드 ${index + 1}`,
    thumbnail,
    elements: templateSlide.elements.map((element, elementIndex) => ({
      ...element,
      id: `perf_element_${index}_${elementIndex}`,
      content: index === liveIndex ? liveText : element.content,
    })),
  }));
  project.settings.currentLiveSlideId = liveId;
  await app.seedProject(project);

  const syncFrames = [];
  let currentTransition = 0;
  await page.addInitScript(() => {
    window.__navigationLongTasks = [];
    window.__navigationStartupCalls = [];
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (...args) => {
      const input = args[0];
      window.__navigationStartupCalls.push({ kind: 'fetch', url: String(input), atMs: performance.now() });
      return nativeFetch(...args);
    };
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = new Proxy(NativeWebSocket, {
      construct(target, args) {
        window.__navigationStartupCalls.push({ kind: 'websocket', url: String(args[0]), atMs: performance.now() });
        return Reflect.construct(target, args, target);
      },
    });
    if (window.PerformanceObserver && PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      new PerformanceObserver(entries => {
        window.__navigationLongTasks.push(...entries.getEntries().map(entry => ({ startMs: entry.startTime, durationMs: entry.duration })));
      }).observe({ type: 'longtask', buffered: true });
    }
  });
  page.on('websocket', socket => {
    const transition = currentTransition;
    const role = new URL(socket.url()).searchParams.get('role');
    socket.on('framereceived', frame => {
      if (typeof frame.payload !== 'string') return;
      let message;
      try { message = JSON.parse(frame.payload); } catch { return; }
      if (message.type !== 'INITIAL_SYNC' && message.type !== 'THUMBNAILS_SYNC') return;
      syncFrames.push({
        type: message.type, role, transition, receivedAt: performance.now(),
        bytes: Buffer.byteLength(frame.payload), slideCount: message.data?.slides?.length,
        inlineThumbnailCount: message.data?.slides?.filter(slide => slide.thumbnail).length,
        templateCount: message.data?.templates?.length,
        thumbnailCount: Object.keys(message.thumbnails || {}).length,
        thumbnailIds: Object.keys(message.thumbnails || {}),
        batchIndex: message.batchIndex, batchCount: message.batchCount,
      });
    });
  });

  const waitUsable = async role => {
    await expect(page.locator('#status-text')).toHaveText('연결됨');
    await expect(page.locator(`#slide-item-${liveId}.${role === 'editor' ? 'editing' : 'live'}`)).toBeVisible();
    if (role === 'editor') {
      await expect(page.locator('#btn-add-text-body')).toBeEnabled();
      await expect.poll(() => page.evaluate(({ liveId, liveText }) =>
        activeSlideId === liveId && Boolean(myEditorId) && lockedSlides[liveId]?.ownerId === myEditorId
        && canvas.getObjects().some(object => object.text === liveText), { liveId, liveText }),
      { message: 'LIVE 슬라이드의 잠금 소유권과 실제 편집 요소 준비' }).toBe(true);
    } else {
      await expect(page.locator('#live-status-badge')).toHaveClass(/on/);
      await expect.poll(() => page.locator(`#slide-item-${liveId} img`).evaluate(image =>
        image.complete && image.naturalWidth > 0), { message: 'LIVE 카드 썸네일이 브라우저에서 디코딩됨' }).toBe(true);
    }
    await expect.poll(() => visibleThumbnailsReady(page), { message: '목록의 현재 보이는 썸네일 디코딩 완료' }).toBe(true);
  };
  const waitFullData = async () => {
    await expect(page.locator('#slide-list .slide-item')).toHaveCount(slideCount);
    await expect.poll(() => page.locator('#slide-list .slide-item img').evaluateAll(
      (images, expected) => images.filter(image => image.getAttribute('src') === expected).length, thumbnail),
    { message: '전체 썸네일 데이터가 카드에 반영됨, 화면 밖 이미지는 지연 로딩 가능' }).toBe(slideCount);
  };

  await page.goto('/static/presenter.html');
  await waitUsable('presenter');
  await waitFullData();
  const samples = [];
  for (let repetition = 0; repetition < 5; repetition++) {
    for (const role of ['editor', 'presenter']) {
      currentTransition++;
      const startedAt = performance.now();
      const serverLogStart = app.getServerLog().length;
      await page.locator(`a[href="/static/${role}.html"]`).click();
      await waitUsable(role);
      const usableMs = Math.round(performance.now() - startedAt);
      await waitFullData();
      const fullThumbnailDataMs = Math.round(performance.now() - startedAt);
      const longTasks = await page.evaluate(() => window.__navigationLongTasks || []);
      const startupCalls = await page.evaluate(() => window.__navigationStartupCalls || []);
      const startupResources = await page.evaluate(() => performance.getEntriesByType('resource')
        .filter(entry => entry.initiatorType === 'fetch' && entry.name.includes('/api/'))
        .map(entry => ({ path: entry.name.replace(location.origin, '').split('?')[0],
          startMs: Math.round(entry.startTime), durationMs: Math.round(entry.duration),
          transferBytes: entry.transferSize })));
      const frames = syncFrames.filter(frame => frame.transition === currentTransition && frame.role === role);
      const serverTrace = app.getServerLog().slice(serverLogStart)
        .split(/\r?\n/)
        .filter(line => line.startsWith('SUBCAST_TEST_TIMING '))
        .map(line => { try { return JSON.parse(line.slice('SUBCAST_TEST_TIMING '.length)); } catch { return null; } })
        .filter(Boolean);
      const wsStart = serverTrace.find(event => event.event === 'ws.start' && event.role === role);
      const wsEvents = wsStart ? serverTrace.filter(event => event.id === wsStart.id) : [];
      const apiEvents = serverTrace.filter(event => event.path.startsWith('/api/'));
      const wsStartedAt = wsStart?.atMs;
      const apiBeforeWebSocket = apiEvents.filter(event => event.event === 'http.start' && event.atMs < wsStartedAt).length;
      samples.push({ role, repetition: repetition + 1, usableMs, fullThumbnailDataMs,
        longTasks, longestTaskMs: Math.max(0, ...longTasks.map(task => task.durationMs)), frames,
        startupCalls, startupResources,
        serverTrace: { websocket: wsEvents, apiRequests: apiEvents, apiBeforeWebSocket } });
    }
  }

  const summaries = Object.fromEntries(['editor', 'presenter'].map(role => {
    const directionSamples = samples.filter(sample => sample.role === role);
    return [role, { usable: percentiles(directionSamples.map(sample => sample.usableMs)),
      fullThumbnailData: percentiles(directionSamples.map(sample => sample.fullThumbnailDataMs)),
      initialPayloadBytes: percentiles(directionSamples.map(sample => sample.frames.find(frame => frame.type === 'INITIAL_SYNC')?.bytes || 0)),
      thumbnailPayloadBytes: percentiles(directionSamples.map(sample => sample.frames
        .filter(frame => frame.type === 'THUMBNAILS_SYNC').reduce((sum, frame) => sum + frame.bytes, 0))),
      priorityThumbnailMs: percentiles(directionSamples.map(sample => {
        const initial = sample.frames.find(frame => frame.type === 'INITIAL_SYNC');
        const priority = sample.frames.find(frame => frame.type === 'THUMBNAILS_SYNC' && frame.batchIndex === 0);
        return Math.round((priority?.receivedAt || initial?.receivedAt) - (initial?.receivedAt || 0));
      })),
      longestTaskMs: Math.max(...directionSamples.map(sample => sample.longestTaskMs)) }];
  }));
  const metrics = {
    workload: '403 synthetic slides, padded 1x1 PNG, warm same browser context; not production timings',
    readiness: 'LIVE content, editor lock ownership and enabled controls, decoded visible thumbnails; full data excludes offscreen decode',
    samples, summaries,
  };
  console.log(`Bidirectional synthetic navigation: ${JSON.stringify(summaries)}`);
  await testInfo.attach('bidirectional-navigation-metrics', {
    body: Buffer.from(JSON.stringify(metrics, null, 2)), contentType: 'application/json',
  });

  for (const sample of samples) {
    if (sample.role === 'editor') {
      expect(sample.serverTrace.apiBeforeWebSocket,
        '편집기 진입 전에 API 요청이 WebSocket 연결을 앞서지 않도록').toBe(0);
    }
    const initial = sample.frames.find(frame => frame.type === 'INITIAL_SYNC');
    expect(initial?.slideCount).toBe(slideCount);
    expect(initial?.inlineThumbnailCount).toBe(0);
    if (sample.role === 'presenter') expect(initial?.templateCount).toBe(0);
    expect(initial.bytes, `${sample.role}: 첫 동기화에서 썸네일 분리`).toBeLessThan(500_000);
    const thumbnailFrames = sample.frames.filter(frame => frame.type === 'THUMBNAILS_SYNC');
    expect(thumbnailFrames.reduce((sum, frame) => sum + frame.thumbnailCount, 0)).toBe(slideCount);
    expect(Math.max(...thumbnailFrames.map(frame => frame.thumbnailCount))).toBeLessThanOrEqual(64);
    expect(thumbnailFrames.find(frame => frame.batchIndex === 0)?.thumbnailIds).toContain(liveId);
  }
  for (const [role, summary] of Object.entries(summaries)) {
    expect(summary.usable.p95Ms, `${role}: LIVE와 보이는 썸네일이 준비되고 사용 가능해지기까지`).toBeLessThanOrEqual(1000);
    expect(summary.fullThumbnailData.p95Ms, `${role}: 전체 썸네일 데이터 수신과 반영`).toBeLessThanOrEqual(1500);
    expect(summary.longestTaskMs, `${role}: 단일 메인 스레드 작업`).toBeLessThanOrEqual(100);
  }

  const serverEventsSince = offset => app.getServerLog().slice(offset)
    .split(/\r?\n/)
    .filter(line => line.startsWith('SUBCAST_TEST_TIMING '))
    .map(line => { try { return JSON.parse(line.slice('SUBCAST_TEST_TIMING '.length)); } catch { return null; } })
    .filter(Boolean);
  const waitForApi = async (path, offset) => expect.poll(() => serverEventsSince(offset)
    .some(event => event.event === 'http.start' && event.path === path),
  { message: `${path} API가 해당 기능을 열 때 요청됨` }).toBe(true);

  let offset = app.getServerLog().length;
  await page.locator('a[href="/static/editor.html"]').click();
  await waitUsable('editor');
  await waitForApi('/api/tags', offset);
  await expect.poll(() => serverEventsSince(offset).some(event => event.event === 'http.complete' && event.path === '/api/tags'))
    .toBe(true);
  expect(serverEventsSince(offset).some(event => ['/api/backgrounds/list', '/api/v1/monitor/settings',
    '/api/bible/books', '/api/praise/search'].includes(event.path))).toBe(false);

  for (const [tab, endpoint] of [
    ['panel-bible', '/api/bible/books'],
    ['panel-praise', '/api/praise/search'],
    ['panel-stage-bg', '/api/backgrounds/list'],
    ['panel-monitor', '/api/v1/monitor/settings'],
  ]) {
    offset = app.getServerLog().length;
    await page.locator(`button[data-target="${tab}"]`).click();
    await waitForApi(endpoint, offset);
  }
});
