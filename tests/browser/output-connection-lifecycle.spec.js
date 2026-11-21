const { test, expect } = require('./fixtures');

for (const role of ['presenter', 'viewer']) {
  test(`${role} stops reconnecting while hidden and reconnects on restore`, async ({ page }) => {
    const sockets = [];
    page.on('websocket', socket => sockets.push(socket));
    await page.goto(`/static/${role}.html`);
    await expect.poll(() => page.evaluate(() => ws?.readyState)).toBe(1);

    await page.evaluate(() => {
      ws.close();
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    });
    await page.waitForTimeout(3500);
    expect(sockets).toHaveLength(1);

    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await expect.poll(() => page.evaluate(() => ws?.readyState)).toBe(1);
    expect(sockets).toHaveLength(2);
  });
}
