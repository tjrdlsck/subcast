const { test, expect, openEditor } = require('./fixtures');

test('새로고침 뒤 다른 편집자 잠금 표시가 내 잠금 승인 후에도 유지된다', async ({ page, context }) => {
  await openEditor(page);

  const second = await context.newPage();
  await second.goto('/static/editor.html');
  await expect(second.locator('#lock-banner')).toContainText('편집 중');
  await second.locator('#slide-item-slide_b').click();
  await expect.poll(() => second.evaluate(() => Boolean(
    myEditorId && lockedSlides.slide_b?.ownerId === myEditorId
  ))).toBe(true);
  await expect(second.locator('#slide-item-slide_a')).toHaveClass(/locked/);

  await second.reload();
  await expect.poll(() => second.evaluate(() => activeSlideId)).toBe('slide_a');
  await expect(second.locator('#lock-banner')).toContainText('편집 중');
  await expect(second.locator('#slide-item-slide_a')).toHaveClass(/locked/);
  await second.locator('#slide-item-slide_b').click();
  await expect.poll(() => second.evaluate(() => Boolean(
    myEditorId && lockedSlides.slide_b?.ownerId === myEditorId
  ))).toBe(true);

  await expect(second.locator('#slide-item-slide_a')).toHaveClass(/locked/);
  await expect(second.locator('#slide-item-slide_b')).not.toHaveClass(/locked/);
  const lockedSlide = await second.locator('#slide-item-slide_a').boundingBox();
  await second.mouse.click(lockedSlide.x + lockedSlide.width / 2, lockedSlide.y + lockedSlide.height / 2);
  await expect.poll(() => second.evaluate(() => activeSlideId)).toBe('slide_b');

  await second.locator('#btn-toggle-sorter').click();
  await expect(second.locator('#sorter-card-slide_a')).toHaveClass(/locked/);
  const lockedCard = await second.locator('#sorter-card-slide_a').boundingBox();
  await second.mouse.click(lockedCard.x + lockedCard.width / 2, lockedCard.y + lockedCard.height / 2);
  await expect.poll(() => second.evaluate(() => activeSlideId)).toBe('slide_b');

  await page.close();
  await expect(second.locator('#slide-item-slide_a')).not.toHaveClass(/locked/);
  await expect(second.locator('#sorter-card-slide_a')).not.toHaveClass(/locked/);
});
