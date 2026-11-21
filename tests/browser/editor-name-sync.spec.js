const { test, expect, openEditor } = require('./fixtures');

test('편집자 이름은 탭별로 유지되고 연결된 화면에 동기화된다', async ({ page, context }) => {
  await openEditor(page);
  const firstName = '이름 <b>안전</b>';
  await page.locator('#editor-name').fill(firstName);
  await page.locator('#editor-name').press('Tab');

  const second = await context.newPage();
  await second.goto('/static/editor.html');
  await expect(second.locator('#slide-item-slide_a .lock-owner-text')).toHaveText(`🔒 ${firstName}님이 편집 중`);
  await expect(second.locator('#slide-item-slide_a .lock-owner-text img, #slide-item-slide_a .lock-owner-text b')).toHaveCount(0);

  const secondName = '편집자 B';
  await second.locator('#editor-name').fill(secondName);
  await second.locator('#editor-name').press('Tab');
  await second.locator('#slide-item-slide_b').click();
  await expect.poll(() => second.evaluate(() => Boolean(
    myEditorId && lockedSlides.slide_b?.ownerId === myEditorId
  ))).toBe(true);
  await expect(page.locator('#slide-item-slide_b .lock-owner-text')).toHaveText(`🔒 ${secondName}님이 편집 중`);

  await second.reload();
  await expect(second.locator('#editor-name')).toHaveValue(secondName);
  await expect(second.locator('#slide-item-slide_a .lock-owner-text')).toHaveText(`🔒 ${firstName}님이 편집 중`);
  await second.locator('#slide-item-slide_b').click();
  await expect.poll(() => second.evaluate(() => Boolean(
    myEditorId && lockedSlides.slide_b?.ownerId === myEditorId
  ))).toBe(true);

  const third = await context.newPage();
  await third.goto('/static/editor.html');
  await expect(third.locator('#editor-name')).toHaveValue('편집자A');
  await expect(third.locator('#slide-item-slide_a .lock-owner-text')).toHaveText(`🔒 ${firstName}님이 편집 중`);
  await expect(third.locator('#slide-item-slide_b .lock-owner-text')).toHaveText(`🔒 ${secondName}님이 편집 중`);

  await page.close();
  await expect(third.locator('#slide-item-slide_a .lock-owner-text')).toHaveCount(0);
  await expect(third.locator('#slide-item-slide_b .lock-owner-text')).toHaveText(`🔒 ${secondName}님이 편집 중`);
});

test('빈 이름은 기본 이름으로 잠금에 표시되고 이름 길이를 제한한다', async ({ page, context }) => {
  await openEditor(page);
  const second = await context.newPage();
  await second.goto('/static/editor.html');
  const nameInput = page.locator('#editor-name');
  await nameInput.fill('');
  await nameInput.pressSequentially('김 민수');
  await expect(nameInput).toHaveValue('김 민수');
  await nameInput.press('Tab');
  await expect(nameInput).toHaveValue('김 민수');
  await expect(second.locator('#slide-item-slide_a .lock-owner-text')).toHaveText('🔒 김 민수님이 편집 중');

  await nameInput.fill('   ');
  await nameInput.press('Tab');
  await expect.poll(() => page.evaluate(() => document.querySelector('#editor-name').value)).toBe('편집자A');
  await expect(second.locator('#slide-item-slide_a .lock-owner-text')).toHaveText('🔒 편집자A님이 편집 중');

  await nameInput.fill('가'.repeat(80));
  await expect.poll(() => nameInput.inputValue()).toHaveLength(40);
});

test('송출 화면은 접속 전 잠금 이름과 이후 변경된 이름을 표시한다', async ({ page, context }) => {
  await openEditor(page);
  const name = page.locator('#editor-name');
  await name.fill('첫 이름');
  await name.press('Tab');
  const presenter = await context.newPage();
  await presenter.goto('/static/presenter.html');
  const label = presenter.locator('#slide-item-slide_a .slide-lock-indicator');
  await expect(label).toContainText('첫 이름');
  await name.fill('바뀐 이름');
  await name.press('Tab');
  await expect(label).toContainText('바뀐 이름');
});
