const { test, expect, openEditor } = require('./fixtures');
const fs = require('node:fs/promises');
const path = require('node:path');

const slide = (page, id) => page.locator(`#slide-item-${id}`);
const tab = (page, name) => page.locator(`[data-target="panel-${name}"]`);

test('SC-15-03 열 개 편집 탭은 자신의 패널만 표시하고 출력 미리보기를 정리한다', async ({ page, app }) => {
    await openEditor(page);
    const id = await projectId(page);
    const before = (await app.exportProject(id)).slides.map(item => ({ id: item.id, elements: item.elements }));
    const names = ['slides', 'templates', 'text', 'shapes', 'layers', 'bible', 'praise', 'stage-bg', 'monitor', 'broadcast', 'slides'];
    const overlays = ['stage-bg', 'monitor', 'broadcast'];
    for (const name of names) {
        await tab(page, name).click();
        await expect(tab(page, name)).toHaveClass(/active/);
        await expect(page.locator('.nav-tab-btn.active')).toHaveCount(1);
        await expect(page.locator('.sidebar-panel.active')).toHaveAttribute('id', `panel-${name}`);
        await expect(page.locator(`#panel-${name}`)).toBeVisible();
        for (const other of new Set(names.filter(item => item !== name))) {
            await expect(page.locator(`#panel-${other}`)).toBeHidden();
        }
        for (const overlay of overlays) {
            const viewer = page.locator(`#${overlay}-main-viewer-overlay`);
            if (overlay === name) await expect(viewer).toBeVisible();
            else await expect(viewer).toBeHidden();
        }
        await expect(page.locator('#bible-main-viewer-overlay')).toBeHidden();
        await expect(page.locator('#praise-main-viewer-overlay')).toBeHidden();
    }
    expect((await app.exportProject(id)).slides.map(item => ({ id: item.id, elements: item.elements }))).toEqual(before);
    await expect(slide(page, 'slide_a')).toHaveClass(/editing/);
});

test('SC-15-03 접힌 패널에서 탭을 누르면 펼쳐지고 모아보기는 다른 탭에서 닫힌다', async ({ page }) => {
    await openEditor(page);
    await page.locator('#btn-toggle-sidebar').click();
    await expect(page.locator('.left-sub-panel')).toHaveClass(/collapsed/);
    await tab(page, 'text').click();
    await expect(page.locator('.left-sub-panel')).not.toHaveClass(/collapsed/);
    await expect(page.locator('#btn-add-text-body')).toBeVisible();
    await expect(page.locator('#btn-add-text-body')).toBeEnabled();
    await tab(page, 'slides').click();
    await page.locator('#btn-toggle-sorter').click();
    await expect(page.locator('.sorter-card').first()).toBeVisible();
    await tab(page, 'shapes').click();
    await expect(page.locator('.sorter-card').first()).toBeHidden();
    await expect(page.locator('#btn-add-rect')).toBeEnabled();
    await tab(page, 'slides').click();
    await expect(slide(page, 'slide_a')).toHaveClass(/editing/);
});
async function projectId(page) { return page.evaluate(() => projectData.id); }
async function savedSlide(app, id, slideId = 'slide_a') {
    return (await app.exportProject(id)).slides.find(item => item.id === slideId);
}
async function addText(page, kind = 'body', content = '저장할 테스트 문구') {
    await tab(page, 'text').click();
    await page.locator(`#btn-add-text-${kind}`).click();
    await page.locator('#text-editor').fill(content);
    await page.locator('#text-editor').press('Tab');
}

async function returnToSlideAndSelectTopLayer(page, otherSlideFont) {
    await tab(page, 'slides').click();
    await slide(page, 'slide_b').click();
    await tab(page, 'layers').click();
    await page.locator('.layer-item').first().click();
    if (otherSlideFont) await page.locator('#fontfamily-editor').selectOption(otherSlideFont);
    await tab(page, 'slides').click();
    await slide(page, 'slide_a').click();
    await tab(page, 'layers').click();
    await page.locator('.layer-item').first().click();
}

async function setRange(page, id, value) {
    const control = page.locator(`#${id}`);
    const bounds = await control.evaluate(el => ({ min: Number(el.min), max: Number(el.max), step: Number(el.step) || 1 }));
    const steps = Math.round((value - bounds.min) / bounds.step);
    if (value < bounds.min || value > bounds.max || Math.abs(bounds.min + steps * bounds.step - value) > 0.001) {
        throw new Error(`${id} value ${value} is outside its supported range`);
    }
    await control.focus();
    await control.press('Home');
    for (let index = 0; index < steps; index++) await control.press('ArrowRight');
}

test('SC-03-01 새 슬라이드는 선택 뒤에 추가되고 재시작 후 유지된다', async ({ page, app }) => {
    await openEditor(page);
    const id = await projectId(page);
    await page.locator('#btn-add-slide').click();
    await expect(page.locator('.slide-item')).toHaveCount(3);
    await expect.poll(async () => (await app.exportProject(id)).slides.length).toBe(3);
    const data = await app.exportProject(id);
    expect(data.slides[0].id).toBe('slide_a');
    expect(data.slides[2].id).toBe('slide_b');
    await app.restart();
    await openEditor(page);
    await expect(page.locator('.slide-item')).toHaveCount(3);
    expect((await app.exportProject(id)).slides.map(item => item.id)).toEqual(data.slides.map(item => item.id));
});

for (const modifier of ['Control', 'Shift']) {
    test(`SC-03-02 ${modifier} 클릭은 두 슬라이드를 선택한다`, async ({ page }) => {
        await openEditor(page);
        await slide(page, 'slide_a').click();
        await slide(page, 'slide_b').click({ modifiers: [modifier] });
        await expect(page.locator('.slide-item.selected-multi')).toHaveCount(2);
        expect(await page.evaluate(() => [...selectedSlideIds].sort())).toEqual(['slide_a', 'slide_b']);
    });
}

test('SC-03-03 슬라이드를 앞으로 드래그하면 저장 순서가 바뀐다', async ({ page, app }) => {
    await openEditor(page);
    const id = await projectId(page);
    const target = await slide(page, 'slide_a').boundingBox();
    await slide(page, 'slide_b').dragTo(slide(page, 'slide_a'), { targetPosition: { x: target.width / 2, y: 5 } });
    await expect.poll(async () => (await app.exportProject(id)).slides.map(item => item.id)).toEqual(['slide_b', 'slide_a']);
    await page.reload();
    await expect(page.locator('.slide-item').first()).toHaveAttribute('id', 'slide-item-slide_b');
});

test('SC-03-04 전체 보기 선택과 확대는 내용과 순서를 보존한다', async ({ page, app }) => {
    await openEditor(page);
    const id = await projectId(page);
    const before = (await app.exportProject(id)).slides;
    await page.locator('#btn-toggle-sorter').click();
    await expect(page.locator('.sorter-card')).toHaveCount(2);
    await page.locator('#btn-sorter-zoom-in').click();
    await expect(page.locator('#input-sorter-zoom')).toHaveValue('250');
    await page.locator('#sorter-card-slide_b').click();
    await page.locator('#btn-close-slide-sorter').click();
    await expect(slide(page, 'slide_b')).toHaveClass(/editing/);
    expect((await app.exportProject(id)).slides.map(item => ({ id: item.id, elements: item.elements })))
        .toEqual(before.map(item => ({ id: item.id, elements: item.elements })));
});

for (const accept of [false, true]) {
    test(`SC-03-05 슬라이드 삭제 ${accept ? '확정' : '취소'}`, async ({ page, app }) => {
        await openEditor(page);
        const id = await projectId(page);
        await page.locator('#btn-toggle-sorter').click();
        await page.locator('#sorter-card-slide_b').click();
        page.once('dialog', dialog => accept ? dialog.accept() : dialog.dismiss());
        await page.keyboard.press('Delete');
        await expect(page.locator('.sorter-card')).toHaveCount(accept ? 1 : 2);
        await expect.poll(async () => (await app.exportProject(id)).slides.map(item => item.id))
            .toEqual(accept ? ['slide_a'] : ['slide_a', 'slide_b']);
    });
}

test('SC-04-01 서체 변경은 다른 슬라이드에 갔다 돌아와도 유지된다', async ({ page, app }) => {
    await openEditor(page);
    const id = await projectId(page);
    await tab(page, 'layers').click();
    await page.locator('.layer-item').first().click();
    await page.locator('#fontfamily-editor').selectOption('Georgia');
    await returnToSlideAndSelectTopLayer(page, 'Outfit');
    expect((await savedSlide(app, id)).elements[0].style.fontFamily).toBe('Georgia');
    expect(await page.evaluate(() => canvas.getActiveObject().fontFamily)).toBe('Georgia');
    await expect(page.locator('#fontfamily-editor')).toHaveValue('Georgia');
});

test('SC-04-01 글자 크기는 다른 슬라이드에 갔다 돌아와도 유지된다', async ({ page }) => {
    await openEditor(page);
    await tab(page, 'layers').click();
    await page.locator('.layer-item').first().click();
    await page.locator('#fontsize-editor').fill('42');
    await page.locator('#fontsize-editor').press('Tab');
    await returnToSlideAndSelectTopLayer(page);
    expect(await page.evaluate(() => canvas.getActiveObject().fontSize)).toBeCloseTo(42, 2);
    await expect(page.locator('#fontsize-editor')).toHaveValue('42');
});

test('SC-04-01 줄 간격은 다른 슬라이드에 갔다 돌아와도 유지된다', async ({ page }) => {
    await openEditor(page);
    await tab(page, 'layers').click();
    await page.locator('.layer-item').first().click();
    await page.locator('#text-lineheight').fill('2.10');
    await page.locator('#text-lineheight').press('Tab');
    await returnToSlideAndSelectTopLayer(page);
    expect(await page.evaluate(() => canvas.getActiveObject().lineHeight)).toBe(2.1);
    await expect(page.locator('#text-lineheight')).toHaveValue('2.10');
});

test('SC-04-01 글자 색상·투명도·굵기·기울임·정렬은 슬라이드 전환 후 유지된다', async ({ page, app }) => {
    await openEditor(page);
    const id = await projectId(page);
    await tab(page, 'layers').click();
    await page.locator('.layer-item').first().click();
    await page.locator('#fontcolor-hex').fill('#AA33CC');
    await page.locator('#fontcolor-hex').press('Tab');
    await setRange(page, 'fontcolor-opacity', 60);
    await page.locator('#btn-bold').click();
    await page.locator('#btn-italic').click();
    await page.locator('#btn-align-right').click();
    await returnToSlideAndSelectTopLayer(page);
    await expect(page.locator('#fontcolor-hex')).toHaveValue('#AA33CC');
    await expect(page.locator('#fontcolor-opacity')).toHaveValue('60');
    await expect(page.locator('#btn-bold')).toHaveClass(/active/);
    await expect(page.locator('#btn-italic')).toHaveClass(/active/);
    await expect(page.locator('#btn-align-right')).toHaveClass(/active/);
    const style = (await savedSlide(app, id)).elements[0].style;
    expect(style.fontColor).toContain('170, 51, 204');
    expect(style.fontWeight).toBe('bold');
    expect(style.fontStyle).toBe('italic');
    expect(style.textAlign).toBe('right');
});

test('SC-04-01 글자 테두리 색상·투명도·두께는 슬라이드 전환 후 유지된다', async ({ page, app }) => {
    await openEditor(page);
    const id = await projectId(page);
    await tab(page, 'layers').click();
    await page.locator('.layer-item').first().click();
    await page.locator('#text-strokecolor-hex').fill('#00AAFF');
    await page.locator('#text-strokecolor-hex').press('Tab');
    await setRange(page, 'text-strokecolor-opacity', 50);
    await page.locator('#text-strokewidth').fill('4');
    await page.locator('#text-strokewidth').press('Tab');
    await returnToSlideAndSelectTopLayer(page);
    await expect(page.locator('#text-strokecolor-hex')).toHaveValue('#00AAFF');
    await expect(page.locator('#text-strokecolor-opacity')).toHaveValue('50');
    await expect(page.locator('#text-strokewidth')).toHaveValue('4');
    const style = (await savedSlide(app, id)).elements[0].style;
    expect(style.strokeColor).toContain('0, 170, 255');
    expect(style.strokeWidth).toBe(4);
});

test('SC-04-01 그림자 켜기·색상·투명도·블러·오프셋은 슬라이드 전환 후 유지된다', async ({ page, app }) => {
    await openEditor(page);
    const id = await projectId(page);
    await tab(page, 'layers').click();
    await page.locator('.layer-item').first().click();
    await page.locator('#text-shadow-enabled').check();
    await page.locator('#text-shadow-color-hex').fill('#336699');
    await page.locator('#text-shadow-color-hex').press('Tab');
    await setRange(page, 'text-shadow-color-opacity', 40);
    for (const [control, value] of [['text-shadow-blur', '8'], ['text-shadow-offsetx', '6'], ['text-shadow-offsety', '9']]) {
        await page.locator(`#${control}`).fill(value);
        await page.locator(`#${control}`).press('Tab');
    }
    await returnToSlideAndSelectTopLayer(page);
    await expect(page.locator('#text-shadow-enabled')).toBeChecked();
    await expect(page.locator('#text-shadow-color-hex')).toHaveValue('#336699');
    await expect(page.locator('#text-shadow-color-opacity')).toHaveValue('40');
    await expect(page.locator('#text-shadow-blur')).toHaveValue('8');
    await expect(page.locator('#text-shadow-offsetx')).toHaveValue('6');
    await expect(page.locator('#text-shadow-offsety')).toHaveValue('9');
    expect((await savedSlide(app, id)).elements[0].style.shadow).toMatchObject({ blur: 8, offsetX: 6, offsetY: 9 });
});

test('SC-04-06 긴 한글·여러 줄·특수문자 외곽선 본문 저장과 송출', async ({ page, context, app }) => {
    const content = `${'긴 한글 문구와 기호 !? 123 '.repeat(14)}\n둘째 줄은 저장 뒤에도 유지됩니다.`;
    await openEditor(page);
    const id = await projectId(page);
    await addText(page, 'body', content);
    await page.locator('#text-strokecolor-hex').fill('#00AAFF');
    await page.locator('#text-strokecolor-hex').press('Tab');
    await page.locator('#text-strokewidth').fill('3');
    await page.locator('#text-strokewidth').press('Tab');
    await expect.poll(async () => (await savedSlide(app, id)).elements.some(item => item.content === content)).toBe(true);
    const longText = (await savedSlide(app, id)).elements.find(item => item.content === content);
    expect(longText.style).toMatchObject({ strokeColor: expect.stringContaining('0, 170, 255'), strokeWidth: 3 });
    const bounds = await page.evaluate(() => {
        const obj = canvas.getObjects().find(item => item.text?.includes('둘째 줄은 저장'));
        return obj && { width: obj.width, height: obj.height };
    });
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);

    const viewer = await context.newPage();
    await viewer.goto('/static/viewer.html?channel=broadcast');
    await expect.poll(() => viewer.evaluate(text => canvas.getObjects().some(obj => obj.text === text), content)).toBe(true);
});

test('SC-15-04 사용자 글꼴 등록·편집 적용·송출 로드와 실패 보존', async ({ page, context, app }) => {
    const systemFont = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'arial.ttf');
    await fs.copyFile(systemFont, path.join(app.dataDir, 'frontend/fonts/sc15-fixture.ttf'));
    await openEditor(page);
    const id = await projectId(page);
    await addText(page, 'body', '사용자 글꼴 시험 문구');
    const css = `@font-face { font-family: 'SC15Fixture'; src: url('${app.url}/static/fonts/sc15-fixture.ttf') format('truetype'); }`;
    await page.locator('#custom-font-input').fill(css);
    await page.locator('#btn-add-custom-font').click();
    await expect.poll(async () => (await app.exportProject(id)).customFonts?.some(font => font.family === 'SC15Fixture')).toBe(true);
    await page.locator('#fontfamily-editor').selectOption('SC15Fixture');
    await expect.poll(async () => (await savedSlide(app, id)).elements.some(element => element.style.fontFamily === 'SC15Fixture')).toBe(true);

    const viewer = await context.newPage();
    await viewer.goto('/static/viewer.html?channel=broadcast');
    await expect.poll(() => viewer.evaluate(() => document.fonts.check('16px SC15Fixture'))).toBe(true);
    await expect.poll(() => viewer.evaluate(() => Array.from(document.fonts).some(font => font.family.replaceAll('"', '') === 'SC15Fixture'))).toBe(true);
    const presenter = await context.newPage();
    await presenter.goto('/static/presenter.html');
    await expect(presenter.locator('#status-text')).toHaveText('연결됨');
    await expect.poll(() => presenter.evaluate(() => Array.from(document.fonts).some(font => font.family.replaceAll('"', '') === 'SC15Fixture'))).toBe(true);

    const registered = (await app.exportProject(id)).customFonts;
    await page.locator('#custom-font-input').fill(`@font-face { font-family: 'SC15Missing'; src: url('${app.url}/static/fonts/missing-sc15.woff'); }`);
    await page.locator('#btn-add-custom-font').click();
    await page.waitForTimeout(700);
    expect((await app.exportProject(id)).customFonts).toEqual(registered);
});

test('SC-04-02/04 도형 채우기·테두리·모서리·좌표·크기·불투명도는 슬라이드 전환 후 유지된다', async ({ page, app }) => {
    await openEditor(page);
    const id = await projectId(page);
    await tab(page, 'shapes').click();
    await page.locator('#btn-add-rect').click();
    await page.locator('#shape-fillcolor-hex').fill('#12AB34');
    await page.locator('#shape-fillcolor-hex').press('Tab');
    await setRange(page, 'shape-fillcolor-opacity', 70);
    await page.locator('#shape-strokecolor-hex').fill('#234567');
    await page.locator('#shape-strokecolor-hex').press('Tab');
    await setRange(page, 'shape-strokecolor-opacity', 80);
    await page.locator('#shape-strokewidth').fill('5');
    await page.locator('#shape-strokewidth').press('Tab');
    await page.locator('#shape-corners').fill('14');
    await page.locator('#shape-corners').press('Tab');
    for (const [control, value] of [['element-left', '120'], ['element-top', '80'], ['element-width', '240'], ['element-height', '100']]) {
        await page.locator(`#${control}`).fill(value);
        await page.locator(`#${control}`).press('Tab');
    }
    await setRange(page, 'element-opacity', 0.65);
    await returnToSlideAndSelectTopLayer(page);
    for (const [control, value] of [
        ['shape-fillcolor-hex', '#12AB34'], ['shape-fillcolor-opacity', '70'],
        ['shape-strokecolor-hex', '#234567'], ['shape-strokecolor-opacity', '80'],
        ['shape-strokewidth', '5'], ['shape-corners', '14'],
        ['element-left', '120'], ['element-top', '80'], ['element-width', '240'], ['element-height', '100'],
        ['element-opacity', '0.65'],
    ]) await expect(page.locator(`#${control}`)).toHaveValue(value);
    const rect = (await savedSlide(app, id)).elements.find(item => item.type === 'rect');
    expect(rect.style.fillColor).toContain('18, 171, 52');
    expect(rect.style.strokeColor).toContain('35, 69, 103');
    expect(rect.style.strokeWidth).toBe(5);
    expect(rect.style.cornerRadius).toBe(14);
    expect(rect.style.opacity).toBe(0.65);
});

for (const kind of ['title', 'subtitle', 'body']) {
    test(`SC-04-01 ${kind} 텍스트 내용과 굵기·정렬 저장`, async ({ page, app }) => {
        await openEditor(page);
        const id = await projectId(page);
        const content = `${kind} 한글\n두 번째 줄 !?`;
        await addText(page, kind, content);
        await page.locator('#btn-bold').click();
        await page.locator('#btn-align-center').click();
        await expect.poll(async () => (await savedSlide(app, id)).elements.find(item => item.content === content)?.style.textAlign).toBe('center');
        const element = (await savedSlide(app, id)).elements.find(item => item.content === content);
        expect(element.style.fontWeight).toBe(kind === 'body' ? 'bold' : 'normal');
        await page.reload();
        await expect.poll(() => page.evaluate(text => canvas.getObjects().some(item => item.text === text), content)).toBe(true);
    });
}

for (const kind of ['rect', 'circle', 'triangle', 'line']) {
    test(`SC-04-02 ${kind} 도형 추가와 좌표 저장`, async ({ page, app }) => {
        await openEditor(page);
        const id = await projectId(page);
        await tab(page, 'shapes').click();
        await page.locator(`#btn-add-${kind}`).click();
        await page.locator('#element-left').fill('220');
        await page.locator('#element-left').press('Tab');
        await expect.poll(async () => (await savedSlide(app, id)).elements.find(item => item.type === kind)?.x).toBeCloseTo(220 / 768 * 100, 1);
        expect((await savedSlide(app, id)).elements).toHaveLength(2);
        await page.reload();
        await expect.poll(() => page.evaluate(type => canvas.getObjects().some(item => item.type === type), kind)).toBe(true);
    });
}

test('SC-05-01 자동 저장 내용은 서버 재시작 후 유지된다', async ({ page, app }) => {
    await openEditor(page);
    const id = await projectId(page);
    await addText(page, 'body', '재시작 후 살아있는 마지막 글자');
    await expect.poll(async () => (await savedSlide(app, id)).elements.some(item => item.content === '재시작 후 살아있는 마지막 글자')).toBe(true);
    await app.restart();
    await openEditor(page);
    await expect.poll(() => page.evaluate(() => canvas.getObjects().some(item => item.text === '재시작 후 살아있는 마지막 글자'))).toBe(true);
});

test('SC-05-02 입력 직후 다른 슬라이드로 이동해도 마지막 내용이 보존된다', async ({ page, app }) => {
    await openEditor(page);
    const id = await projectId(page);
    await addText(page, 'body', '이동 직전 수정');
    await tab(page, 'slides').click();
    await slide(page, 'slide_b').click();
    await slide(page, 'slide_a').click();
    await expect.poll(async () => (await savedSlide(app, id)).elements.some(item => item.content === '이동 직전 수정')).toBe(true);
    expect((await savedSlide(app, id, 'slide_b')).elements.map(item => item.content)).toEqual(['두 번째 테스트 자막']);
});

test('SC-05-03 요소 추가 실행 취소와 다시 실행', async ({ page, app }) => {
    await openEditor(page);
    const id = await projectId(page);
    await tab(page, 'shapes').click();
    await page.locator('#btn-add-rect').click();
    await page.keyboard.press('Control+z');
    await expect.poll(() => page.evaluate(() => canvas.getObjects().length)).toBe(1);
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(() => page.evaluate(() => canvas.getObjects().length)).toBe(2);
    await expect.poll(async () => (await savedSlide(app, id)).elements.length).toBe(2);
});

test.describe('시스템 클립보드', () => {
test('SC-05-04 전체 보기 슬라이드 복사와 붙여넣기는 새 ID를 만든다', async ({ page, app }) => {
    await openEditor(page);
    const id = await projectId(page);
    await page.locator('#btn-toggle-sorter').click();
    await page.locator('#sorter-card-slide_a').click();
    await page.keyboard.press('Control+c');
    await expect.poll(() => page.evaluate(async () => JSON.parse(await navigator.clipboard.readText()).subcastType)).toBe('slide');
    await page.keyboard.press('Control+v');
    await expect(page.locator('.sorter-card')).toHaveCount(3);
    await expect.poll(async () => (await app.exportProject(id)).slides.length).toBe(3);
    const slides = (await app.exportProject(id)).slides;
    expect(new Set(slides.map(item => item.id)).size).toBe(3);
    expect(slides.filter(item => item.elements.some(element => element.content === '첫 번째 테스트 자막'))).toHaveLength(2);
});

test('SC-05-05 요소 복사와 붙여넣기는 원본을 보존한다', async ({ page, app }) => {
    await openEditor(page);
    const id = await projectId(page);
    await tab(page, 'shapes').click();
    await page.locator('#btn-add-rect').click();
    await page.keyboard.press('Control+c');
    await expect.poll(() => page.evaluate(async () => JSON.parse(await navigator.clipboard.readText()).subcastType)).toBe('element');
    await page.keyboard.press('Control+v');
    await expect.poll(async () => (await savedSlide(app, id)).elements.filter(item => item.type === 'rect').length).toBe(2);
    const rectangles = (await savedSlide(app, id)).elements.filter(item => item.type === 'rect');
    expect(rectangles[0].id).not.toBe(rectangles[1].id);
    expect(rectangles[0].style).toEqual(rectangles[1].style);
});
});

test('SC-06-01 현재 디자인을 템플릿으로 저장한다', async ({ page, app }) => {
    await openEditor(page);
    const id = await projectId(page);
    await tab(page, 'templates').click();
    page.once('dialog', dialog => dialog.accept('독립 테스트 디자인'));
    await page.locator('#btn-save-template').click();
    await expect(page.locator('.template-grid-item')).toContainText('독립 테스트 디자인');
    await expect.poll(async () => (await app.exportProject(id)).templates.length).toBe(1);
    expect((await app.exportProject(id)).templates[0].elements[0].content).toBe('첫 번째 테스트 자막');
});

test('SC-15-02 글자 입력 중 Delete는 요소를 삭제하지 않는다', async ({ page, app }) => {
    await openEditor(page);
    const id = await projectId(page);
    await addText(page, 'body', '입력 보호');
    await page.locator('#text-editor').click();
    await page.locator('#text-editor').press('Control+a');
    await page.locator('#text-editor').press('Delete');
    await page.locator('#text-editor').fill('입력 유지');
    await page.locator('#text-editor').press('Tab');
    await expect.poll(async () => (await savedSlide(app, id)).elements.some(item => item.content === '입력 유지')).toBe(true);
    expect((await savedSlide(app, id)).elements).toHaveLength(2);
});

test('SC-04-03 이미지 파일 드롭과 크기 저장', async ({ page, app }, testInfo) => {
    await openEditor(page);
    const id = await projectId(page);
    const path = testInfo.outputPath('image.png');
    await fs.writeFile(path, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=', 'base64'));
    const box = await page.locator('.upper-canvas').boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const data = { items: [], files: [path], dragOperationsMask: 1 };
    for (const type of ['dragEnter', 'dragOver', 'drop']) {
        await cdp.send('Input.dispatchDragEvent', { type, x: box.x + 100, y: box.y + 100, data });
    }
    await cdp.detach();
    await expect(page.locator('#element-width')).toBeEnabled();
    await page.locator('#element-width').fill('180');
    await page.locator('#element-width').press('Tab');
    await expect.poll(async () => (await savedSlide(app, id)).elements.find(item => item.type === 'image')?.width).toBeCloseTo(180 / 768 * 100, 1);
    const image = (await savedSlide(app, id)).elements.find(item => item.type === 'image');
    expect(image.style, '이미지 원본 주소가 저장되어야 한다').toMatchObject({ src: expect.stringContaining('data:image/png;base64,') });
    await page.reload();
    await expect.poll(() => page.evaluate(() => canvas.getObjects().filter(item => item.type === 'image').length)).toBe(1);
});

for (const [button, axis, value] of [
    ['element-left', 'x', 0], ['center-h', 'x', (768 - 151) / 2 / 768 * 100], ['element-right', 'x', (768 - 151) / 768 * 100],
    ['top', 'y', 0], ['center-v', 'y', (432 - 101) / 2 / 432 * 100], ['bottom', 'y', (432 - 101) / 432 * 100],
]) {
    test(`SC-04-04 요소 정렬 ${button}`, async ({ page, app }) => {
        await openEditor(page);
        const id = await projectId(page);
        await tab(page, 'shapes').click();
        await page.locator('#btn-add-rect').click();
        await page.locator(`#btn-align-${button}`).click();
        await returnToSlideAndSelectTopLayer(page);
        await expect.poll(async () => (await savedSlide(app, id)).elements.find(item => item.type === 'rect')?.[axis]).toBeCloseTo(value, 1);
        expect((await savedSlide(app, id)).elements[0].content).toBe('첫 번째 테스트 자막');
    });
}

for (const direction of ['up', 'down', 'front', 'back']) {
    test(`SC-04-04 레이어 순서 ${direction}`, async ({ page, app }) => {
        await openEditor(page);
        const id = await projectId(page);
        await tab(page, 'shapes').click();
        await page.locator('#btn-add-rect').click();
        await page.locator('#btn-add-circle').click();
        await page.locator('#btn-layer-back').click();
        await expect.poll(async () => (await savedSlide(app, id)).elements.map(item => item.type)).toEqual(['circle', 'text', 'rect']);
        if (direction === 'down' || direction === 'back') {
            await page.locator('#btn-layer-front').click();
            await expect.poll(async () => (await savedSlide(app, id)).elements.map(item => item.type)).toEqual(['text', 'rect', 'circle']);
        }
        await page.locator(`#btn-layer-${direction}`).click();
        const order = { up: ['text', 'circle', 'rect'], down: ['text', 'circle', 'rect'], front: ['text', 'rect', 'circle'], back: ['circle', 'text', 'rect'] };
        await returnToSlideAndSelectTopLayer(page);
        await expect.poll(async () => (await savedSlide(app, id)).elements.map(item => item.type)).toEqual(order[direction]);
    });
}

test('SC-04-04 레이어 목록 선택은 속성 패널과 일치하고 소환·삭제는 해당 개체만 변경한다', async ({ page, app }) => {
    await openEditor(page);
    const id = await projectId(page);
    await tab(page, 'shapes').click();
    await page.locator('#btn-add-rect').click();
    await page.locator('#btn-add-circle').click();
    await tab(page, 'layers').click();
    const circle = page.locator('.layer-item').filter({ hasText: '원형' });
    const rectangle = page.locator('.layer-item').filter({ hasText: '사각형' });
    await rectangle.click();
    await expect(rectangle).toHaveClass(/active/);
    await expect(page.locator('.layer-item.active')).toHaveCount(1);
    await expect(page.locator('#shape-corners')).toBeVisible();
    await expect(page.locator('#shape-corners')).toBeEnabled();
    await page.locator('#element-left').fill('60');
    await page.locator('#element-left').press('Tab');
    await expect.poll(async () => (await savedSlide(app, id)).elements.find(item => item.type === 'rect')?.x).toBeCloseTo(60 / 768 * 100, 1);
    await circle.click();
    await expect(circle).toHaveClass(/active/);
    await expect(page.locator('#shape-corners')).toBeDisabled();
    await page.keyboard.press('ArrowRight');
    const offCenter = await page.evaluate(() => {
        const object = canvas.getActiveObject();
        return { left: object.left, top: object.top };
    });
    await circle.locator('.btn-summon').click();
    await expect.poll(() => page.evaluate(() => {
        const object = canvas.getActiveObject();
        return { left: object.left, top: object.top };
    })).not.toEqual(offCenter);
    await rectangle.locator('.btn-delete').click();
    await expect(page.locator('.layer-item')).toHaveCount(2);
    await expect(rectangle).toHaveCount(0);
    await expect.poll(async () => (await savedSlide(app, id)).elements.map(item => item.type)).toEqual(['text', 'circle']);
    await page.reload();
    await tab(page, 'layers').click();
    await expect(page.locator('.layer-item')).toHaveCount(2);
    await expect(page.locator('.layer-item').filter({ hasText: '첫 번째 테스트' })).toHaveCount(1);
});

test('SC-04-04 긴 레이어 목록은 휠로 스크롤한 뒤 아래 텍스트를 선택해 편집할 수 있다', async ({ page, app }) => {
    const data = await app.exportProject();
    data.slides[0].elements = Array.from({ length: 30 }, (_, index) => ({
        ...data.slides[0].elements[0], id: `layer_scroll_${index}`, content: `레이어 ${index + 1}`,
    }));
    const id = await app.seedProject(data);
    await openEditor(page);
    await tab(page, 'layers').click();
    const body = page.locator('#panel-layers .panel-body');
    await expect.poll(() => body.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    await body.hover();
    await page.mouse.wheel(0, 10000);
    await expect.poll(() => body.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    const bottom = page.locator('.layer-item').last();
    await expect(bottom).toBeInViewport();
    await bottom.click();
    await expect(bottom).toHaveClass(/active/);
    await expect(page.locator('#text-editor')).toHaveValue('레이어 1');
    await page.locator('#text-editor').fill('스크롤 후 수정');
    await page.locator('#text-editor').press('Tab');
    await expect.poll(async () => (await savedSlide(app, id)).elements.find(item => item.id === 'layer_scroll_0')?.content).toBe('스크롤 후 수정');
    expect((await savedSlide(app, id)).elements).toHaveLength(30);
});

test('SC-04-05 그룹 저장과 해제는 두 요소를 보존한다', async ({ page, app }) => {
    const fixture = await app.exportProject();
    fixture.slides[0].elements = [];
    const id = await app.seedProject(fixture);
    await openEditor(page);
    await tab(page, 'shapes').click();
    await page.locator('#btn-add-rect').click();
    await page.locator('#btn-add-circle').click();
    await page.locator('#element-left').fill('400');
    await page.locator('#element-left').press('Tab');
    const box = await page.locator('.upper-canvas').boundingBox();
    const zoom = await page.evaluate(() => canvasZoom);
    await page.mouse.click(box.x + 220 * zoom, box.y + 200 * zoom);
    await page.keyboard.down('Shift');
    await page.mouse.click(box.x + 460 * zoom, box.y + 210 * zoom);
    await page.keyboard.up('Shift');
    await page.locator('#btn-group').click();
    await expect.poll(async () => (await savedSlide(app, id)).elements[0]?.type).toBe('group');
    expect((await savedSlide(app, id)).elements[0].children.map(item => item.type).sort()).toEqual(['circle', 'rect']);
    await returnToSlideAndSelectTopLayer(page);
    await expect.poll(async () => (await savedSlide(app, id)).elements[0]?.type).toBe('group');
    await page.locator('#btn-ungroup').click();
    await expect.poll(async () => (await savedSlide(app, id)).elements.map(item => item.type).sort()).toEqual(['circle', 'rect']);
});

async function templateFixture(app) {
    const data = await app.exportProject();
    data.templates = [{ id: 'tpl_fixed', name: '적용할 디자인', elements: [
        { ...data.slides[0].elements[0], id: 'tpl_text', x: 20, style: { fontSize: '6vw', fontColor: '#ff0000', fontFamily: 'Arial' } },
        { id: 'tpl_rect', type: 'rect', content: '', x: 0, y: 0, width: 20, height: 20, style: { fillColor: '#123456' } },
    ] }];
    const id = await app.seedProject(data);
    const response = await app.request.post('/api/templates/import', { multipart: { file: {
        name: 'fixture-templates.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data.templates)),
    } } });
    expect(response.ok()).toBe(true);
    return id;
}

async function seedTemplateList(app, count = 12) {
    const data = await app.exportProject();
    const templates = Array.from({ length: count }, (_, index) => ({
        id: `tpl_list_${index}`, name: `목록 디자인 ${index + 1}`,
        elements: [{ ...data.slides[0].elements[0], id: `tpl_list_text_${index}` }],
    }));
    const response = await app.request.post('/api/templates/import', { multipart: { file: {
        name: 'template-list.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(templates)),
    } } });
    expect(response.ok(), await response.text()).toBeTruthy();
    return templates;
}

test('SC-06-04 템플릿 Ctrl 토글·Shift 범위 선택은 적용/삭제 버튼과 선택 내보내기에 반영된다', async ({ page, app }) => {
    const templates = await seedTemplateList(app, 4);
    await openEditor(page);
    await tab(page, 'templates').click();
    const items = page.locator('.template-grid-item');
    await expect(items).toHaveCount(4);
    await expect(page.locator('#btn-apply-template-bulk')).toBeDisabled();
    await expect(page.locator('#btn-delete-template')).toBeDisabled();
    await items.nth(0).click();
    await expect(page.locator('#btn-apply-template-bulk')).toBeEnabled();
    await items.nth(2).click({ modifiers: ['Shift'] });
    await expect.poll(() => page.evaluate(() => [...selectedTemplateIds])).toEqual(templates.slice(0, 3).map(item => item.id));
    await expect(page.locator('#btn-apply-template-bulk')).toBeDisabled();
    await expect(page.locator('#btn-delete-template')).toBeEnabled();
    await items.nth(1).click({ modifiers: ['Control'] });
    await expect.poll(() => page.evaluate(() => [...selectedTemplateIds])).toEqual([templates[0].id, templates[2].id]);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#btn-template-export').click();
    const download = await downloadPromise;
    expect(await download.failure()).toBeNull();
    const exported = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
    expect(exported.map(item => item.id).sort()).toEqual([templates[0].id, templates[2].id].sort());
    await items.nth(2).click({ modifiers: ['Control'] });
    await expect(page.locator('#btn-apply-template-bulk')).toBeEnabled();
    await items.nth(0).click();
    await expect.poll(() => page.evaluate(() => selectedTemplateIds.length)).toBe(0);
    await expect(page.locator('#btn-delete-template')).toBeDisabled();
    const allDownloadPromise = page.waitForEvent('download');
    await page.locator('#btn-template-export').click();
    const allDownload = await allDownloadPromise;
    expect(JSON.parse(await fs.readFile(await allDownload.path(), 'utf8')).map(item => item.id).sort()).toEqual(templates.map(item => item.id).sort());
});

test('SC-06-04 템플릿 목록은 휠로 스크롤하고 아래 항목을 선택한 뒤 탭 전환해도 유지된다', async ({ page, app }) => {
    const templates = await seedTemplateList(app);
    await openEditor(page);
    await tab(page, 'templates').click();
    const list = page.locator('#templates-grid-list');
    await expect.poll(() => list.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    await list.hover();
    await page.mouse.wheel(0, 10000);
    await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    const last = page.locator(`.template-grid-item[data-id="${templates.at(-1).id}"]`);
    await expect(last).toBeInViewport();
    await last.click();
    await tab(page, 'text').click();
    await tab(page, 'templates').click();
    await expect.poll(() => page.evaluate(() => [...selectedTemplateIds])).toEqual([templates.at(-1).id]);
    await expect(last).toBeInViewport();
    await expect(page.locator('#btn-apply-template-bulk')).toBeEnabled();
});

for (const close of ['btn-modal-cancel', 'btn-modal-close']) {
    test(`SC-06-02 템플릿 적용 ${close}는 선택 내용을 저장하지 않고 다시 열 때 초기화한다`, async ({ page, app }) => {
        const id = await templateFixture(app);
        const before = (await app.exportProject(id)).slides.map(item => ({ id: item.id, elements: item.elements }));
        await openEditor(page);
        await tab(page, 'templates').click();
        await page.locator('.template-grid-item').click();
        await page.locator('#btn-apply-template-bulk').click();
        await expect(page.locator('.modal-slide-item.selected')).toHaveCount(1);
        await page.locator('.modal-slide-item').nth(1).click({ modifiers: ['Control'] });
        await expect(page.locator('.modal-slide-item.selected')).toHaveCount(2);
        await page.locator(`#${close}`).click();
        await expect(page.locator('#template-apply-modal')).toBeHidden();
        expect((await app.exportProject(id)).slides.map(item => ({ id: item.id, elements: item.elements }))).toEqual(before);
        await page.locator('#btn-apply-template-bulk').click();
        await expect(page.locator('.modal-slide-item.selected')).toHaveCount(1);
        await page.locator('.modal-slide-item').first().click({ modifiers: ['Control'] });
        await expect(page.locator('.modal-slide-item.selected')).toHaveCount(0);
        await page.locator('#btn-modal-confirm').click();
        await expect(page.locator('#template-apply-modal')).toBeVisible();
        expect((await app.exportProject(id)).slides.map(item => ({ id: item.id, elements: item.elements }))).toEqual(before);
        await page.locator('#btn-modal-cancel').click();
    });
}

for (const undo of [false, true]) {
    test(`SC-06-${undo ? '03' : '02'} 템플릿 일괄 적용${undo ? ' 되돌리기' : ' 본문 유지'}`, async ({ page, app }) => {
        const id = await templateFixture(app);
        const before = (await app.exportProject(id)).slides;
        await openEditor(page);
        await tab(page, 'templates').click();
        await page.locator('.template-grid-item').click();
        await page.locator('#btn-apply-template-bulk').click();
        await page.locator('.modal-slide-item').nth(1).click({ modifiers: ['Control'] });
        await page.locator('#btn-modal-confirm').click();
        await expect.poll(async () => (await app.exportProject(id)).slides.map(item => item.elements.length)).toEqual([2, 2]);
        const slides = (await app.exportProject(id)).slides;
        expect(slides.map(item => item.elements[0].content)).toEqual(['첫 번째 테스트 자막', '두 번째 테스트 자막']);
        expect(slides.every(item => item.elements[0].style.fontColor === '#ff0000')).toBe(true);
        if (undo) {
            await page.locator('#btn-undo-template').click();
            const content = slides => slides.map(({ thumbnail, ...slide }) => slide);
            await expect.poll(async () => content((await app.exportProject(id)).slides)).toEqual(content(before));
        }
    });
}

test('SC-08-05 템플릿의 지정한 두 번째 글상자에 기존 문구 연결', async ({ page, app }) => {
    const data = await app.exportProject();
    data.templates = [{ id: 'tpl_two_text', name: '두 글상자 템플릿', elements: [
        { id: 'tpl_title', type: 'text', content: '제목 자리', x: 10, y: 10, width: 80, height: 15, style: { fontSize: '3vw', fontColor: '#ff0000' } },
        { id: 'tpl_lyrics', type: 'text', content: '가사 자리', x: 10, y: 40, width: 80, height: 30, style: { fontSize: '5vw', fontColor: '#00ff00' } },
        { id: 'tpl_shape', type: 'rect', content: '', x: 0, y: 0, width: 100, height: 100, style: { fillColor: '#123456' } },
    ] }];
    const id = await app.seedProject(data);
    const response = await app.request.post('/api/templates/import', { multipart: { file: {
        name: 'two-text-template.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data.templates)),
    } } });
    expect(response.ok()).toBeTruthy();

    await openEditor(page);
    await tab(page, 'templates').click();
    await page.locator('.template-grid-item').filter({ hasText: '두 글상자 템플릿' }).click();
    await page.locator('#btn-apply-template-bulk').click();
    await page.locator('#select-modal-target-textbox').selectOption('tpl_lyrics');
    await page.locator('#btn-modal-confirm').click();

    await expect.poll(async () => (await app.exportProject(id)).slides[0].elements.length).toBe(3);
    const elements = (await app.exportProject(id)).slides[0].elements;
    expect(elements.map(element => element.content)).toEqual(['제목 자리', '첫 번째 테스트 자막', '']);
    expect(elements[1].style.fontColor).toBe('#00ff00');
    expect(elements[2]).toMatchObject({ type: 'rect', width: 100, height: 100 });
});

for (const accept of [false, true]) {
    test(`SC-06-05 템플릿 삭제 ${accept ? '확정' : '취소'}`, async ({ page, app }) => {
        const id = await templateFixture(app);
        await openEditor(page);
        await tab(page, 'templates').click();
        await page.locator('.template-grid-item').click();
        page.once('dialog', dialog => accept ? dialog.accept() : dialog.dismiss());
        await page.locator('#btn-delete-template').click();
        await expect.poll(async () => (await app.exportProject(id)).templates.length).toBe(accept ? 0 : 1);
        expect((await app.exportProject(id)).slides[0].elements[0].content).toBe('첫 번째 테스트 자막');
    });
}
