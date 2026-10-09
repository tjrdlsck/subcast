const { test, expect, openEditor } = require('./fixtures');

test('편집 페이지 진입 시 LIVE 슬라이드를 먼저 열고 편집 선택은 송출 상태를 바꾸지 않는다', async ({ page, app }) => {
  await page.goto('/static/presenter.html');
  await expect.poll(() => page.evaluate(() => projectData?.slides?.length)).toBe(2);

  await page.locator('#slide-item-slide_b').click();
  await expect.poll(async () => (await app.exportProject()).settings.currentLiveSlideId).toBe('slide_b');

  await page.locator('a[href="/static/editor.html"]').click();
  await expect(page.locator('#btn-add-slide')).toBeEnabled();
  await expect.poll(() => page.evaluate(() => window.activeSlideId)).toBe('slide_b');

  await page.locator('#slide-item-slide_a').click();
  await expect.poll(() => page.evaluate(() => window.activeSlideId)).toBe('slide_a');
  await expect.poll(async () => (await app.exportProject()).settings.currentLiveSlideId).toBe('slide_b');
});

for (const liveSlideId of [null, 'deleted_slide']) {
  test(`LIVE 슬라이드가 ${liveSlideId ?? '없으면'} 첫 슬라이드로 대체한다`, async ({ page, app }) => {
    const project = await app.exportProject();
    project.name = `LIVE fallback ${liveSlideId ?? 'off'}`;
    project.settings.currentLiveSlideId = liveSlideId;
    const projectId = await app.seedProject(project);

    await page.goto('/static/editor.html');
    await expect(page.locator('#btn-add-slide')).toBeEnabled();
    await expect.poll(() => page.evaluate(() => window.projectData?.id)).toBe(projectId);
    await expect.poll(() => page.evaluate(() => window.activeSlideId)).toBe(project.slides[0].id);
  });
}

test('편집 탭이 닫히면 잠금이 해제되고 초기 동기화는 소유자 ID를 편집자 이름처럼 표시하지 않는다', async ({ page, context }) => {
  await openEditor(page);
  const editingSlideId = await page.evaluate(() => activeSlideId);
  const ownerId = await page.evaluate(() => lockedSlides[activeSlideId]?.ownerId);
  expect(ownerId).toBeTruthy();

  const presenter = await context.newPage();
  await presenter.goto('/static/presenter.html');
  const lockIndicator = presenter.locator(`#slide-item-${editingSlideId} .slide-lock-indicator`);
  await expect(lockIndicator).toContainText('편집 중');
  await expect(lockIndicator).not.toContainText(ownerId);

  await page.close();
  await expect(lockIndicator).toHaveCount(0);
});

test('편집 페이지를 송출 페이지로 이동하면 이전 편집 잠금이 해제된다', async ({ page }) => {
  await openEditor(page);
  const editingSlideId = await page.evaluate(() => activeSlideId);

  await page.locator('a[href="/static/presenter.html"]').click();
  await expect(page).toHaveURL(/presenter\.html/);
  await expect(page.locator(`#slide-item-${editingSlideId} .slide-lock-indicator`)).toHaveCount(0);
});

test('BFCache로 편집 페이지가 숨겨질 때 잠금을 반환하고 복원되면 다시 잠근다', async ({ page, context }) => {
  await openEditor(page);
  const editingSlideId = await page.evaluate(() => activeSlideId);

  const presenter = await context.newPage();
  await presenter.goto('/static/presenter.html');
  const lockIndicator = presenter.locator(`#slide-item-${editingSlideId} .slide-lock-indicator`);
  await expect(lockIndicator).toBeVisible();

  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await expect(lockIndicator).toHaveCount(0);

  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(lockIndicator).toBeVisible();
});
