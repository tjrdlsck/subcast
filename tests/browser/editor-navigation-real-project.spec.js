const { test, expect } = require('./fixtures');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');

test.use({ serverTiming: true });

const projectFile = process.env.SUBCAST_PERF_PROJECT_FILE || path.resolve(
  process.cwd(),
  'project_10월 9일 4시간 기도회8인도자_proj_db4ef050json (2)_프로그램호환.json',
);
test.skip(!fsSync.existsSync(projectFile), `Set SUBCAST_PERF_PROJECT_FILE to an available project JSON: ${projectFile}`);

async function visibleThumbnailsReady(page) {
  return page.evaluate(async () => {
    const list = document.getElementById('slide-list');
    if (!list) return false;
    const bounds = list.getBoundingClientRect();
    const cards = [...list.querySelectorAll('.slide-item')].filter(card => {
      const rect = card.getBoundingClientRect();
      return rect.bottom > Math.max(0, bounds.top) && rect.top < Math.min(innerHeight, bounds.bottom);
    });
    const images = cards.map(card => card.querySelector('img'));
    if (!images.length || images.some(image => !image?.complete || image.naturalWidth === 0)) return false;
    try {
      await Promise.all(images.map(image => image.decode()));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return true;
    } catch { return false; }
  });
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

test('실제 프로젝트 데이터에서 송출·편집 전환 단계별 시간을 측정한다', async ({ page, app }, testInfo) => {
  test.setTimeout(180_000);
  const project = JSON.parse(await fs.readFile(projectFile, 'utf8'));
  const slideCount = project.slides.length;
  const liveId = project.settings.currentLiveSlideId;
  const liveSlide = project.slides.find(slide => slide.id === liveId);
  expect(liveSlide, '프로젝트의 현재 LIVE 슬라이드 ID가 실제 슬라이드에 있어야 함').toBeTruthy();
  expect(slideCount).toBeGreaterThan(0);

  const importedId = await app.seedProject(project);
  const liveText = liveSlide.elements?.find(element => element.type === 'text')?.content || '';
  const receivedFrames = [];
  let transitionId = 0;
  await page.addInitScript(({ expectedThumbnailCount, liveId, liveText, liveElementCount }) => {
    window.__navigationStages = {
      documentStartMs: performance.now(),
      documentStartEpochMs: performance.timeOrigin,
      clickStartedAtEpochMs: Number(sessionStorage.getItem('__navigationClickEpoch') || 0),
      events: [],
    };
    const record = (name, detail = {}) => window.__navigationStages.events.push({
      name, atMs: performance.now(), ...detail,
    });
    document.addEventListener('DOMContentLoaded', () => record('domContentLoaded'), { once: true });
    addEventListener('load', () => record('load'), { once: true });
    let allThumbnailsObserved = false;
    const observeThumbnailDOM = list => {
      if (allThumbnailsObserved) return;
      const count = list.querySelectorAll('.slide-item img[src^="data:image/"]').length;
      if (count >= expectedThumbnailCount) {
        allThumbnailsObserved = true;
        record('allThumbnailImagesInDOM', { count });
      }
    };
    let slideList = null;
    const listObserver = new MutationObserver(() => observeThumbnailDOM(slideList));
    const rootObserver = new MutationObserver(() => {
      slideList = document.getElementById('slide-list');
      if (!slideList) return;
      rootObserver.disconnect();
      listObserver.observe(slideList, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['src'],
      });
      observeThumbnailDOM(slideList);
    });
    rootObserver.observe(document, { childList: true, subtree: true });
    let appUsableObserved = false;
    let usableCheckPending = false;
    let visibleImagesDecodePromise = null;
    const editorCoreReady = () => {
      if (typeof activeSlideId === 'undefined' || typeof myEditorId === 'undefined'
        || typeof lockedSlides === 'undefined' || typeof canvas === 'undefined') return false;
      const addTextButton = document.getElementById('btn-add-text-body');
      return activeSlideId === liveId && Boolean(myEditorId)
        && lockedSlides[liveId]?.ownerId === myEditorId && Boolean(addTextButton && !addTextButton.disabled)
        && (!liveText || canvas.getObjects().some(object => object.text === liveText));
    };
    const presenterCoreReady = () => document.getElementById('live-status-badge')?.classList.contains('on')
      && document.querySelector(`#slide-item-${CSS.escape(liveId)}.live`);
    const editorCanvasReady = () => typeof activeSlideId !== 'undefined' && activeSlideId === liveId
      && typeof canvas !== 'undefined' && canvas.getObjects().length === liveElementCount
      && (!liveText || canvas.getObjects().some(object => object.text === liveText));
    const observeUsability = () => {
      const role = location.pathname.endsWith('/editor.html') ? 'editor' : 'presenter';
      if (role === 'editor' && editorCanvasReady()
        && !window.__navigationStages.events.some(event => event.name === 'editorCanvasReady')) {
        record('editorCanvasReady', { objectCount: canvas.getObjects().length });
      }
      if (role === 'editor' && document.getElementById('btn-add-text-body')?.disabled === false
        && !window.__navigationStages.events.some(event => event.name === 'editorControlsEnabled')) {
        record('editorControlsEnabled', { ownsLock: lockedSlides[liveId]?.ownerId === myEditorId });
      }
      const coreReady = role === 'editor' ? editorCoreReady() : presenterCoreReady();
      if (coreReady && !window.__navigationStages.events.some(event => event.name === 'appCoreReady')) {
        record('appCoreReady', { role });
      }
      if (coreReady && !visibleImagesDecodePromise) {
        const list = document.getElementById('slide-list');
        if (list) {
          const bounds = list.getBoundingClientRect();
          const images = [...list.querySelectorAll('.slide-item')].filter(card => {
            const rect = card.getBoundingClientRect();
            return rect.bottom > Math.max(0, bounds.top) && rect.top < Math.min(innerHeight, bounds.bottom);
          }).map(card => card.querySelector('img'));
          if (images.length && images.every(image => image?.complete && image.naturalWidth > 0)) {
            visibleImagesDecodePromise = Promise.all(images.map(image => image.decode())).then(() =>
              new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          }
        }
      }
      if (!appUsableObserved && !usableCheckPending && coreReady && visibleImagesDecodePromise) {
        usableCheckPending = true;
        visibleImagesDecodePromise.then(() => {
          if (!appUsableObserved && (role === 'editor' ? editorCoreReady() : presenterCoreReady())) {
            appUsableObserved = true;
            record('appUsable', { role });
          }
        });
      }
      if (!appUsableObserved) requestAnimationFrame(observeUsability);
    };
    requestAnimationFrame(observeUsability);
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = new Proxy(NativeWebSocket, {
      construct(target, args) {
        const socket = Reflect.construct(target, args, target);
        record('websocketConstruct', { url: String(args[0]) });
        socket.addEventListener('open', () => record('websocketOpen'));
        socket.addEventListener('message', event => {
          if (typeof event.data !== 'string') return;
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'INITIAL_SYNC' || message.type === 'THUMBNAILS_SYNC') {
              record('websocketFrame', {
                type: message.type,
                bytes: new TextEncoder().encode(event.data).length,
                slideCount: message.data?.slides?.length,
                thumbnailCount: Object.keys(message.thumbnails || {}).length,
                batchIndex: message.batchIndex,
              });
            } else if (message.type === 'SLIDE_LOCKED' || message.type === 'LOCK_FAILED') {
              record('websocketLockResponse', { type: message.type, isLiveSlide: message.slideId === liveId });
            }
          } catch { }
        });
        let handlerDescriptor;
        for (let prototype = Object.getPrototypeOf(socket); prototype && !handlerDescriptor; prototype = Object.getPrototypeOf(prototype)) {
          handlerDescriptor = Object.getOwnPropertyDescriptor(prototype, 'onmessage');
        }
        let appMessageHandler;
        Object.defineProperty(socket, 'onmessage', {
          configurable: true,
          get: () => appMessageHandler,
          set: handler => {
            appMessageHandler = handler;
            if (typeof handler !== 'function') {
              handlerDescriptor?.set?.call(socket, handler);
              return;
            }
            const measuredHandler = function (event) {
              let messageType;
              try { messageType = JSON.parse(event.data).type; } catch { }
              const tracked = ['INITIAL_SYNC', 'THUMBNAILS_SYNC', 'SLIDE_LOCKED', 'LOCK_FAILED'].includes(messageType);
              const started = performance.now();
              try { return handler.call(this, event); }
              finally {
                if (tracked) record('appWebSocketHandler', {
                  type: messageType, durationMs: performance.now() - started,
                });
              }
            };
            if (handlerDescriptor?.set) handlerDescriptor.set.call(socket, measuredHandler);
            else socket.addEventListener('message', measuredHandler);
          },
        });
        const nativeSend = socket.send.bind(socket);
        socket.send = data => {
          if (typeof data === 'string') {
            try {
              const message = JSON.parse(data);
              if (message.type === 'LOCK_SLIDE' && message.slideId === liveId) {
                record('websocketLockRequest', { slideId: message.slideId });
              }
            } catch { }
          }
          return nativeSend(data);
        };
        return socket;
      },
    });
    if (window.PerformanceObserver && PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      window.__navigationLongTasks = [];
      new PerformanceObserver(entries => window.__navigationLongTasks.push(...entries.getEntries().map(entry => ({
        startMs: entry.startTime, durationMs: entry.duration,
        attribution: entry.attribution?.map(item => ({ containerType: item.containerType,
          containerName: item.containerName, containerId: item.containerId, containerSrc: item.containerSrc })),
      })))).observe({ type: 'longtask', buffered: true });
    }
  }, { expectedThumbnailCount: project.slides.filter(slide => Boolean(slide.thumbnail)).length, liveId, liveText,
    liveElementCount: liveSlide.elements?.length || 0 });
  page.on('websocket', socket => {
    const transition = transitionId;
    const role = new URL(socket.url()).searchParams.get('role');
    socket.on('framereceived', frame => {
      if (typeof frame.payload !== 'string') return;
      try {
        const message = JSON.parse(frame.payload);
        if (!['INITIAL_SYNC', 'THUMBNAILS_SYNC'].includes(message.type)) return;
        receivedFrames.push({
          transition, role, type: message.type, receivedAt: Date.now(),
          bytes: Buffer.byteLength(frame.payload), slideCount: message.data?.slides?.length,
          inlineThumbnailCount: message.data?.slides?.filter(slide => slide.thumbnail).length,
          thumbnailCount: Object.keys(message.thumbnails || {}).length,
          batchIndex: message.batchIndex,
        });
      } catch { }
    });
  });

  const waitUntilUsable = async role => {
    await expect(page.locator('#status-text')).toHaveText('연결됨');
    await expect(page.locator(`#slide-item-${liveId}.${role === 'editor' ? 'editing' : 'live'}`)).toBeVisible();
    if (role === 'editor') {
      await expect(page.locator('#btn-add-text-body')).toBeEnabled();
      await expect.poll(() => page.evaluate(({ liveId, liveText }) =>
        activeSlideId === liveId && Boolean(myEditorId) && lockedSlides[liveId]?.ownerId === myEditorId
        && (!liveText || canvas.getObjects().some(object => object.text === liveText)), { liveId, liveText }),
      { message: '실제 LIVE 슬라이드 선택, 편집 잠금과 캔버스 준비' }).toBe(true);
    } else {
      await expect(page.locator('#live-status-badge')).toHaveClass(/on/);
      await expect.poll(() => page.locator(`#slide-item-${liveId} img`).evaluate(image =>
        image.complete && image.naturalWidth > 0)).toBe(true);
    }
    await expect.poll(() => visibleThumbnailsReady(page), { message: '현재 보이는 실제 썸네일의 브라우저 디코딩' }).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__navigationStages.events.some(event => event.name === 'appUsable')),
      { message: '브라우저 내부 관찰자가 편집 가능 시점을 기록함' }).toBe(true);
  };
  const waitAllThumbnails = async () => {
    await expect(page.locator('#slide-list .slide-item')).toHaveCount(slideCount);
    const thumbnailCount = project.slides.filter(slide => Boolean(slide.thumbnail)).length;
    await expect.poll(() => page.locator('#slide-list .slide-item img').evaluateAll(images =>
      images.filter(image => image.getAttribute('src')?.startsWith('data:image/')).length),
    { message: '실제 프로젝트 썸네일이 모든 카드에 반영됨' }).toBe(thumbnailCount);
  };

  await page.goto('/static/presenter.html');
  await waitUntilUsable('presenter');
  await waitAllThumbnails();
  const samples = [];
  for (let repetition = 0; repetition < 5; repetition++) {
    for (const role of ['editor', 'presenter']) {
      transitionId++;
      const clickStartedAtEpochMs = await page.evaluate(() => {
        const epochMs = performance.timeOrigin + performance.now();
        sessionStorage.setItem('__navigationClickEpoch', String(epochMs));
        return epochMs;
      });
      const logOffset = app.getServerLog().length;
      await page.locator(`a[href="/static/${role}.html"]`).click();
      await waitUntilUsable(role);
      await waitAllThumbnails();
      const browserStages = await page.evaluate(() => ({
        documentStartMs: window.__navigationStages?.documentStartMs,
        documentStartEpochMs: window.__navigationStages?.documentStartEpochMs,
        events: window.__navigationStages?.events || [],
        longTasks: window.__navigationLongTasks || [],
        navigation: (() => {
          const nav = performance.getEntriesByType('navigation')[0];
          return nav ? {
            responseStartMs: Math.round(nav.responseStart),
            domInteractiveMs: Math.round(nav.domInteractive),
            domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
            loadEventMs: Math.round(nav.loadEventEnd),
          } : null;
        })(),
        apiResources: performance.getEntriesByType('resource').filter(entry => entry.name.includes('/api/'))
          .map(entry => ({ path: new URL(entry.name).pathname, startMs: Math.round(entry.startTime), durationMs: Math.round(entry.duration) })),
        scriptResources: performance.getEntriesByType('resource').filter(entry => entry.name.includes('/static/js/'))
          .map(entry => ({ path: new URL(entry.name).pathname, initiator: entry.initiatorType,
            startMs: Math.round(entry.startTime), durationMs: Math.round(entry.duration),
            responseBytes: entry.decodedBodySize })),
      }));
      const serverTiming = app.getServerLog().slice(logOffset).split(/\r?\n/)
        .filter(line => line.startsWith('SUBCAST_TEST_TIMING '))
        .map(line => { try { return JSON.parse(line.slice('SUBCAST_TEST_TIMING '.length)); } catch { return null; } })
        .filter(Boolean);
      const wsStart = serverTiming.find(event => event.event === 'ws.start' && event.role === role);
      const wsTiming = wsStart ? serverTiming.filter(event => event.id === wsStart.id) : [];
      const lockReceived = wsTiming.find(event => event.event === 'ws.message_received' && event.messageType === 'LOCK_SLIDE');
      const lockSent = wsTiming.find(event => event.event === 'ws.message_sent' && event.messageType === 'SLIDE_LOCKED');
      const frames = receivedFrames.filter(frame => frame.transition === transitionId && frame.role === role);
      const lastThumbnailFrameMs = browserStages.events.filter(event => event.name === 'websocketFrame'
        && event.type === 'THUMBNAILS_SYNC').at(-1)?.atMs;
      const allThumbnailImagesInDomMs = browserStages.events.find(event => event.name === 'allThumbnailImagesInDOM')?.atMs;
      const appCoreReadyMs = browserStages.events.find(event => event.name === 'appCoreReady')?.atMs;
      const appUsableObservedMs = browserStages.events.find(event => event.name === 'appUsable')?.atMs;
      const editorCanvasReadyMs = browserStages.events.find(event => event.name === 'editorCanvasReady')?.atMs;
      const editorControlsEnabledMs = browserStages.events.find(event => event.name === 'editorControlsEnabled')?.atMs;
      const lockRequestMs = browserStages.events.find(event => event.name === 'websocketLockRequest')?.atMs;
      const lockResponseMs = browserStages.events.find(event => event.name === 'websocketLockResponse' && event.isLiveSlide)?.atMs;
      samples.push({ role, repetition: repetition + 1,
        clickToAppCoreReadyMs: appCoreReadyMs == null ? null
          : browserStages.documentStartEpochMs + appCoreReadyMs - clickStartedAtEpochMs,
        clickToAppUsableMs: appUsableObservedMs == null ? null
          : browserStages.documentStartEpochMs + appUsableObservedMs - clickStartedAtEpochMs,
        clickToEditorCanvasReadyMs: editorCanvasReadyMs == null ? null
          : browserStages.documentStartEpochMs + editorCanvasReadyMs - clickStartedAtEpochMs,
        clickToEditorControlsEnabledMs: editorControlsEnabledMs == null ? null
          : browserStages.documentStartEpochMs + editorControlsEnabledMs - clickStartedAtEpochMs,
        editorControlsEnabledBeforeLock: editorControlsEnabledMs != null
          && lockResponseMs != null && editorControlsEnabledMs < lockResponseMs,
        editorCanvasReadyMs, editorControlsEnabledMs, lockResponseMs,
        appCoreReadyMs, appUsableObservedMs,
        browserLockRoundTripMs: lockRequestMs == null || lockResponseMs == null ? null : lockResponseMs - lockRequestMs,
        serverLockRoundTripMs: lockReceived && lockSent ? lockSent.atMs - lockReceived.atMs : null,
        browserToServerLockMs: lockReceived && lockRequestMs != null
          ? lockReceived.wallTimeEpochMs - (browserStages.documentStartEpochMs + lockRequestMs) : null,
        serverToBrowserLockMs: lockSent && lockResponseMs != null
          ? (browserStages.documentStartEpochMs + lockResponseMs) - lockSent.wallTimeEpochMs : null,
        afterLastThumbnailFrameMs: lastThumbnailFrameMs == null || allThumbnailImagesInDomMs == null
          ? null : allThumbnailImagesInDomMs - lastThumbnailFrameMs,
        allThumbnailImagesInDomMs,
        clickToAllThumbnailImagesInDomMs: allThumbnailImagesInDomMs == null ? null
          : browserStages.documentStartEpochMs + allThumbnailImagesInDomMs - clickStartedAtEpochMs,
        browserStages, serverWebSocket: wsTiming, frames });
    }
  }

  const summarize = role => {
    const selected = samples.filter(sample => sample.role === role);
    return {
      documentToAppUsableMs: { p50: percentile(selected.map(sample => sample.appUsableObservedMs), 0.5), p95: percentile(selected.map(sample => sample.appUsableObservedMs), 0.95) },
      clickToAppCoreReadyMs: { p50: percentile(selected.map(sample => sample.clickToAppCoreReadyMs), 0.5), p95: percentile(selected.map(sample => sample.clickToAppCoreReadyMs), 0.95) },
      clickToAppUsableMs: { p50: percentile(selected.map(sample => sample.clickToAppUsableMs), 0.5), p95: percentile(selected.map(sample => sample.clickToAppUsableMs), 0.95) },
      clickToEditorCanvasReadyMs: { p50: percentile(selected.map(sample => sample.clickToEditorCanvasReadyMs), 0.5), p95: percentile(selected.map(sample => sample.clickToEditorCanvasReadyMs), 0.95) },
      clickToEditorControlsEnabledMs: { p50: percentile(selected.map(sample => sample.clickToEditorControlsEnabledMs), 0.5), p95: percentile(selected.map(sample => sample.clickToEditorControlsEnabledMs), 0.95) },
      controlsEnabledBeforeLockCount: selected.filter(sample => sample.editorControlsEnabledBeforeLock).length,
      documentToAppCoreReadyMs: { p50: percentile(selected.map(sample => sample.appCoreReadyMs), 0.5), p95: percentile(selected.map(sample => sample.appCoreReadyMs), 0.95) },
      clickToAllThumbnailImagesInDomMs: { p50: percentile(selected.map(sample => sample.clickToAllThumbnailImagesInDomMs), 0.5), p95: percentile(selected.map(sample => sample.clickToAllThumbnailImagesInDomMs), 0.95) },
      afterLastThumbnailFrameMs: { p50: percentile(selected.map(sample => sample.afterLastThumbnailFrameMs), 0.5), p95: percentile(selected.map(sample => sample.afterLastThumbnailFrameMs), 0.95) },
      documentReadyMs: { p50: percentile(selected.map(sample => sample.browserStages.navigation.domContentLoadedMs), 0.5), p95: percentile(selected.map(sample => sample.browserStages.navigation.domContentLoadedMs), 0.95) },
      websocketOpenMs: { p50: percentile(selected.map(sample => sample.browserStages.events.find(event => event.name === 'websocketOpen')?.atMs), 0.5), p95: percentile(selected.map(sample => sample.browserStages.events.find(event => event.name === 'websocketOpen')?.atMs), 0.95) },
      initialSyncMs: { p50: percentile(selected.map(sample => sample.browserStages.events.find(event => event.name === 'websocketFrame' && event.type === 'INITIAL_SYNC')?.atMs), 0.5), p95: percentile(selected.map(sample => sample.browserStages.events.find(event => event.name === 'websocketFrame' && event.type === 'INITIAL_SYNC')?.atMs), 0.95) },
      firstThumbnailBatchMs: { p50: percentile(selected.map(sample => sample.browserStages.events.find(event => event.name === 'websocketFrame' && event.type === 'THUMBNAILS_SYNC' && event.batchIndex === 0)?.atMs), 0.5), p95: percentile(selected.map(sample => sample.browserStages.events.find(event => event.name === 'websocketFrame' && event.type === 'THUMBNAILS_SYNC' && event.batchIndex === 0)?.atMs), 0.95) },
      finalThumbnailBatchMs: { p50: percentile(selected.map(sample => sample.browserStages.events.filter(event => event.name === 'websocketFrame' && event.type === 'THUMBNAILS_SYNC').at(-1)?.atMs), 0.5), p95: percentile(selected.map(sample => sample.browserStages.events.filter(event => event.name === 'websocketFrame' && event.type === 'THUMBNAILS_SYNC').at(-1)?.atMs), 0.95) },
      lockRequestMs: { p50: percentile(selected.map(sample => sample.browserStages.events.find(event => event.name === 'websocketLockRequest')?.atMs), 0.5), p95: percentile(selected.map(sample => sample.browserStages.events.find(event => event.name === 'websocketLockRequest')?.atMs), 0.95) },
      lockResponseMs: { p50: percentile(selected.map(sample => sample.browserStages.events.find(event => event.name === 'websocketLockResponse' && event.isLiveSlide)?.atMs), 0.5), p95: percentile(selected.map(sample => sample.browserStages.events.find(event => event.name === 'websocketLockResponse' && event.isLiveSlide)?.atMs), 0.95) },
      browserLockRoundTripMs: { p50: percentile(selected.map(sample => sample.browserLockRoundTripMs), 0.5), p95: percentile(selected.map(sample => sample.browserLockRoundTripMs), 0.95) },
      serverLockRoundTripMs: { p50: percentile(selected.map(sample => sample.serverLockRoundTripMs), 0.5), p95: percentile(selected.map(sample => sample.serverLockRoundTripMs), 0.95) },
      browserToServerLockMs: { p50: percentile(selected.map(sample => sample.browserToServerLockMs), 0.5), p95: percentile(selected.map(sample => sample.browserToServerLockMs), 0.95) },
      serverToBrowserLockMs: { p50: percentile(selected.map(sample => sample.serverToBrowserLockMs), 0.5), p95: percentile(selected.map(sample => sample.serverToBrowserLockMs), 0.95) },
      initialSyncHandlerMs: { p50: percentile(selected.map(sample => sample.browserStages.events.find(event => event.name === 'appWebSocketHandler' && event.type === 'INITIAL_SYNC')?.durationMs), 0.5), p95: percentile(selected.map(sample => sample.browserStages.events.find(event => event.name === 'appWebSocketHandler' && event.type === 'INITIAL_SYNC')?.durationMs), 0.95) },
      longestObservedLongTaskMs: Math.max(0, ...selected.flatMap(sample => sample.browserStages.longTasks.map(task => task.durationMs))) || null,
    };
  };
  const metrics = {
    workload: { file: path.basename(projectFile), projectId: importedId, slides: slideCount,
      templates: project.templates?.length || 0,
      thumbnailCount: project.slides.filter(slide => Boolean(slide.thumbnail)).length,
      thumbnailBytes: project.slides.reduce((total, slide) => total + Buffer.byteLength(slide.thumbnail || ''), 0),
      elements: project.slides.reduce((total, slide) => total + (slide.elements?.length || 0), 0),
      warmBrowserContextRepetitions: 5 },
    definitions: { appUsable: 'browser-observed LIVE slide, editor ownership and controls, plus visible thumbnails decoded; click duration uses a shared epoch clock',
      allThumbnailImagesInDom: 'navigation click until every thumbnail data URL has reached its slide card; offscreen image decode excluded' },
    summaries: { editor: summarize('editor'), presenter: summarize('presenter') }, samples,
  };
  console.log(`Real project navigation metrics: ${JSON.stringify(metrics.summaries)} workload=${JSON.stringify(metrics.workload)}`);
  await testInfo.attach('real-project-navigation-metrics', {
    body: Buffer.from(JSON.stringify(metrics, null, 2)), contentType: 'application/json',
  });

  for (const sample of samples) {
    if (sample.role === 'editor') {
      expect(sample.browserLockRoundTripMs, '브라우저가 LIVE 슬라이드 잠금 승인을 받아야 함').toBeDefined();
      expect(sample.serverLockRoundTripMs, '테스트 백엔드가 잠금 요청 수신·응답을 기록해야 함').toBeDefined();
      expect(sample.editorCanvasReadyMs, '잠금 승인 전에도 선택한 LIVE 슬라이드 캔버스가 먼저 보여야 함').toBeDefined();
      expect(sample.lockResponseMs, '잠금 승인 시점을 기록해야 함').toBeDefined();
      expect(sample.editorCanvasReadyMs, '캔버스 미리보기는 잠금 응답을 기다리지 않아야 함').toBeLessThan(sample.lockResponseMs);
      expect(sample.editorControlsEnabledBeforeLock, '잠금 승인 전 편집 도구가 활성화되면 안 됨').toBe(false);
      expect(sample.editorControlsEnabledMs, '잠금 승인 후 편집 도구가 활성화되어야 함').toBeGreaterThanOrEqual(sample.lockResponseMs);
    }
    const initial = sample.frames.find(frame => frame.type === 'INITIAL_SYNC');
    expect(initial?.slideCount, `${sample.role} sync slide count`).toBe(slideCount);
    expect(initial?.inlineThumbnailCount, `${sample.role} initial sync excludes thumbnails`).toBe(0);
    const thumbnailFrames = sample.frames.filter(frame => frame.type === 'THUMBNAILS_SYNC');
    expect(thumbnailFrames.reduce((sum, frame) => sum + frame.thumbnailCount, 0), `${sample.role} all thumbnails sent`).toBe(metrics.workload.thumbnailCount);
  }
});
