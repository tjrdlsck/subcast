const { test, expect } = require('./fixtures');

const thumbnail = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

test('송출 제어에서 편집으로 이동하면 서버 응답 전에는 읽기 전용 미리보기를 보여주고 동기화 후 교체한다', async ({ page, app }, testInfo) => {
  const project = await app.exportProject();
  project.settings.currentLiveSlideId = 'slide_b';
  project.slides.forEach(slide => { slide.thumbnail = thumbnail; });
  await app.seedProject(project);

  let releaseSync;
  await page.routeWebSocket('**/ws?role=editor', socket => {
    const server = socket.connectToServer();
    const pending = [];
    let released = false;
    socket.onMessage(message => server.send(message));
    server.onMessage(message => {
      if (released) socket.send(message);
      else pending.push(message);
    });
    releaseSync = () => {
      released = true;
      for (const message of pending) socket.send(message);
    };
  });

  await page.goto('/static/presenter.html');
  await expect(page.locator('#slide-item-slide_b.live img')).toBeVisible();
  await page.locator('a[href="/static/editor.html"]').click();
  await expect(page.locator('#editor-handoff-preview')).toBeVisible();
  await expect.poll(() => page.locator('#editor-handoff-preview').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(page.locator('.editor-handoff-card')).toHaveCount(2);
  await expect(page.locator('#editor-handoff-status')).toHaveText('서버 확인 중');
  await expect(page.locator('#status-text')).toHaveText('슬라이드 불러오는 중');
  await expect(page.locator('#btn-add-text-body')).toBeDisabled();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('subcast-editor-handoff-v1') || 'null'))).toBeNull();
  expect(await page.evaluate(() => document.getElementById('editor-handoff-preview').getAttribute('src'))).toBe(thumbnail);
  await testInfo.attach('editor-handoff-preview', { body: await page.screenshot(), contentType: 'image/png' });

  expect(releaseSync).toBeDefined();
  releaseSync();
  await expect(page.locator('#slide-item-slide_b.editing')).toBeVisible();
  await expect(page.locator('#editor-handoff-preview')).toBeHidden();
  await expect(page.locator('.editor-handoff-card')).toHaveCount(0);
  await expect(page.locator('#btn-add-text-body')).toBeEnabled();
  await expect(page.locator('#status-text')).toHaveText('연결됨');
  await expect.poll(() => page.evaluate(() => activeSlideId === 'slide_b'
    && lockedSlides.slide_b?.ownerId === myEditorId
    && canvas.getObjects().some(object => object.text === '두 번째 테스트 자막'))).toBe(true);
});

test('오래된 전환 미리보기는 직접 연 편집 화면에 표시하지 않는다', async ({ page }) => {
  await page.goto('/static/presenter.html');
  await page.evaluate(image => sessionStorage.setItem('subcast-editor-handoff-v1', JSON.stringify({
    projectId: 'old-project', activeSlideId: 'slide_a', createdAt: Date.now() - 10_000,
    slides: [{ id: 'slide_a', index: 0, thumbnail: image }],
  })), thumbnail);
  await page.goto('/static/editor.html');
  await expect(page.locator('#editor-handoff-preview')).toBeHidden();
  await expect(page.locator('.editor-handoff-card')).toHaveCount(0);
  await expect(page.locator('#btn-add-text-body')).toBeEnabled();
});

test('손상되거나 허용되지 않은 미리보기 데이터는 DOM에 표시하지 않고 서버 데이터로 편집한다', async ({ page }) => {
  await page.goto('/static/presenter.html');
  await page.evaluate(() => sessionStorage.setItem('subcast-editor-handoff-v1', JSON.stringify({
    projectId: 'proj_browser', activeSlideId: 'slide_a', createdAt: Date.now(),
    slides: [{ id: 'slide_a', index: 0, thumbnail: 'javascript:alert(1)' }],
  })));
  await page.goto('/static/editor.html');
  await expect(page.locator('#editor-handoff-preview')).toBeHidden();
  await expect(page.locator('.editor-handoff-card')).toHaveCount(0);
  await expect(page.locator('#slide-item-slide_a.editing')).toBeVisible();
  await expect(page.locator('#btn-add-text-body')).toBeEnabled();
  await expect.poll(() => page.evaluate(() => projectData.id === 'proj_browser'
    && canvas.getObjects().some(object => object.text === '첫 번째 테스트 자막'))).toBe(true);
});

test('초기 동기화가 5초 넘게 지연되면 임시 미리보기만 지우고 잠금 전 편집은 막는다', async ({ page, app }) => {
  const project = await app.exportProject();
  project.slides.forEach(slide => { slide.thumbnail = thumbnail; });
  await app.seedProject(project);

  let releaseSync;
  await page.routeWebSocket('**/ws?role=editor', socket => {
    const server = socket.connectToServer();
    const pending = [];
    socket.onMessage(message => server.send(message));
    server.onMessage(message => pending.push(message));
    releaseSync = () => {
      server.onMessage(message => socket.send(message));
      for (const message of pending) socket.send(message);
    };
  });
  await page.goto('/static/presenter.html');
  await page.locator('a[href="/static/editor.html"]').click();
  await expect(page.locator('#editor-handoff-preview')).toBeVisible();
  await expect(page.locator('#btn-add-text-body')).toBeDisabled();
  await expect(page.locator('#editor-handoff-preview')).toBeHidden({ timeout: 7000 });
  await expect(page.locator('.editor-handoff-card')).toHaveCount(0);
  await expect(page.locator('#btn-add-text-body')).toBeDisabled();

  expect(releaseSync).toBeDefined();
  releaseSync();
  await expect(page.locator('#slide-item-slide_a.editing')).toBeVisible();
  await expect(page.locator('#btn-add-text-body')).toBeEnabled();
});

test('LIVE 슬라이드 썸네일이 없어도 편집 페이지 전환과 서버 편집은 정상 동작한다', async ({ page }) => {
  await page.goto('/static/presenter.html');
  await page.locator('a[href="/static/editor.html"]').click();
  await expect(page.locator('#editor-handoff-preview')).toBeHidden();
  await expect(page.locator('.editor-handoff-card')).toHaveCount(0);
  await expect(page.locator('#slide-item-slide_a.editing')).toBeVisible();
  await expect(page.locator('#btn-add-text-body')).toBeEnabled();
  await expect.poll(() => page.evaluate(() => activeSlideId === 'slide_a'
    && lockedSlides.slide_a?.ownerId === myEditorId)).toBe(true);
});

test('미리보기 프로젝트가 서버 프로젝트와 달라도 서버 데이터와 편집 잠금이 최종 상태를 결정한다', async ({ page }) => {
  let releaseSync;
  await page.routeWebSocket('**/ws?role=editor', socket => {
    const server = socket.connectToServer();
    const pending = [];
    socket.onMessage(message => server.send(message));
    server.onMessage(message => pending.push(message));
    releaseSync = () => {
      server.onMessage(message => socket.send(message));
      for (const message of pending) socket.send(message);
    };
  });
  await page.goto('/static/presenter.html');
  await page.evaluate(image => sessionStorage.setItem('subcast-editor-handoff-v1', JSON.stringify({
    projectId: 'different-project', activeSlideId: 'other-slide', createdAt: Date.now(),
    slides: [{ id: 'other-slide', index: 0, thumbnail: image }],
  })), thumbnail);
  await page.goto('/static/editor.html');
  await expect(page.locator('#editor-handoff-preview')).toBeVisible();
  await expect(page.locator('#btn-add-text-body')).toBeDisabled();
  expect(releaseSync).toBeDefined();
  releaseSync();
  await expect(page.locator('#editor-handoff-preview')).toBeHidden();
  await expect(page.locator('#slide-item-slide_a.editing')).toBeVisible();
  await expect(page.locator('#btn-add-text-body')).toBeEnabled();
  await expect.poll(() => page.evaluate(() => projectData.id === 'proj_browser'
    && activeSlideId === 'slide_a' && lockedSlides.slide_a?.ownerId === myEditorId)).toBe(true);
});
