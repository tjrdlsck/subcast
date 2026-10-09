const { test, expect } = require('./fixtures');

test('SC-16-04 update check reports available version without changing project data', async ({ page, app }) => {
  const before = await app.exportProject('proj_browser');
  await page.route('**/api/system/check-update', route => route.fulfill({ json: {
    has_update: true, current_version: '1.0.0', latest_version: '2.0.0',
  } }));
  page.once('dialog', dialog => dialog.dismiss());
  await page.goto('/static/index.html');
  await page.locator('#btn-check-update').click();
  await expect(page.locator('#btn-check-update')).toBeEnabled();
  expect((await app.exportProject('proj_browser')).slides).toEqual(before.slides);
});

test('SC-16-04 update check failure gives an error and remains retryable', async ({ page }) => {
  await page.route('**/api/system/check-update', route => route.fulfill({ status: 502, json: { detail: 'offline' } }));
  const dialogPromise = page.waitForEvent('dialog');
  await page.goto('/static/index.html');
  await page.locator('#btn-check-update').click();
  const dialog = await dialogPromise;
  expect(dialog.message()).toContain('업데이트 오류');
  await dialog.accept();
  await expect(page.locator('#btn-check-update')).toBeEnabled();
});

test('SC-16-07 update request stays blocked in browser regression environment', async ({ page, app }) => {
  const before = await app.exportProject('proj_browser');
  await page.goto('/static/index.html');
  const response = await app.request.post('/api/system/auto-update');
  expect(response.status()).toBe(403);
  expect((await response.json()).detail).toContain('disabled');
  expect((await app.exportProject('proj_browser')).slides).toEqual(before.slides);
});
