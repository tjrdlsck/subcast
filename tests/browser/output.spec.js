const { test, expect, openEditor } = require('./fixtures');

const TEXT_A = '첫 번째 테스트 자막';
const TEXT_B = '두 번째 테스트 자막';
const LYRIC_A = '첫 번째 가사\n함께 부르는 노래';
const LYRIC_B = '두 번째 가사\n이어지는 노래';

function slide(id, content, type = 'regular') {
    return {
        id, name: type === 'praise' ? `찬양: ${id}` : id,
        slideType: type, isPraise: type === 'praise',
        elements: content ? [{
            id: `elem_${id}`, type: 'text', content,
            x: 10, y: 20, width: 80, height: 25,
            style: { fontSize: '4vw', fontColor: '#ffffff', fontFamily: 'Arial',
                textAlign: 'left', strokeWidth: 0 }
        }] : []
    };
}

const projectIds = new WeakMap();

async function project(app) {
    return app.exportProject(projectIds.get(app) || 'proj_browser');
}

async function seed(app, slides, settings = {}) {
    const id = await app.seedProject({
        id: 'proj_browser', name: '브라우저 송출 검증',
        settings: { targetWidth: 1920, targetHeight: 1080,
            currentLiveSlideId: slides[0].id, ...settings },
        slides, templates: [], customFonts: []
    });
    projectIds.set(app, id);
    return id;
}

async function presenter(page, app) {
    await page.goto(`${app.url}/static/presenter.html`);
    await expect(page.locator('#status-text')).toHaveText('연결됨');
    await expect(page.locator('.slide-item')).toHaveCount(2);
}

async function output(context, app, channel) {
    const page = await context.newPage();
    const path = channel.startsWith('monitor') ? `/static/monitor.html?channel=${channel}`
        : `/static/viewer.html?channel=${channel}`;
    await page.goto(`${app.url}${path}`);
    await expect(page.locator('body')).not.toHaveClass(/system-disconnected/);
    await expect.poll(() => page.evaluate(() => typeof canvas !== 'undefined' && !!canvas)).toBe(true);
    return page;
}

async function objects(page) {
    return page.evaluate(() => canvas.getObjects().map(obj => ({
        type: obj.type, text: obj.text, fontSize: obj.fontSize,
        strokeWidth: obj.strokeWidth, textAlign: obj.textAlign,
        left: obj.left, top: obj.top, width: obj.width, height: obj.height,
        fill: obj.fill
    })));
}

async function textIs(page, text) {
    await expect.poll(async () => (await objects(page)).filter(obj => obj.text).map(obj => obj.text)).toEqual([text]);
}

async function liveIs(page, id) {
    await expect(page.locator(`#slide-item-${id}`)).toHaveClass(/live/);
}

async function editorPanel(page, app, panel) {
    await openEditor(page);
    await page.locator(`.nav-tab-btn[data-target="panel-${panel}"]`).click();
    await expect(page.locator(`#${panel}-main-viewer-overlay`)).toBeVisible();
}

async function range(page, selector, value, min, step) {
    const input = page.locator(selector);
    await input.focus();
    await input.press('Home');
    for (let i = 0; i < Math.round((value - min) / step); i++) await input.press('ArrowRight');
    await input.press('Tab');
    await expect(input).toHaveValue(String(value));
}

async function monitorSettings(app) {
    const response = await app.request.get(`${app.url}/api/v1/monitor/settings`);
    expect(response.ok()).toBeTruthy();
    return (await response.json()).data;
}

test.describe('SC-12 송출 제어와 출력 동기화', () => {
    test('SC-12-04 제거된 크로마키 설정은 투명 배경으로 복원된다', async ({ page, context, app }) => {
        await seed(app, [slide('slide_a', TEXT_A)], { backgroundMode: 'chromakey' });
        const obs = await output(context, app, 'obs');
        await expect(obs.locator('body')).not.toHaveClass(/chromakey-mode/);
        await expect.poll(() => obs.locator('body').evaluate(el => getComputedStyle(el).backgroundColor))
            .toBe('rgba(0, 0, 0, 0)');
        expect((await project(app)).settings).not.toHaveProperty('backgroundMode');
    });

    test('SC-12-01 OFF에서 선택은 방송을 켜지 않는다', async ({ page, context, app }) => {
        await presenter(page, app);
        const obs = await output(context, app, 'obs');
        await textIs(obs, TEXT_A);
        await page.locator('#live-status-badge').click();
        await expect(page.locator('#live-status-badge')).not.toHaveClass(/on/);
        await page.locator('#slide-item-slide_b').click();
        await expect(page.locator('#slide-item-slide_b')).toHaveClass(/selected/);
        await expect.poll(() => objects(obs)).toEqual([]);
        await expect.poll(async () => (await project(app)).settings.currentLiveSlideId).toBeNull();
    });

    test('SC-12-01 OFF 후 선택한 슬라이드를 LIVE ON으로 송출한다', async ({ page, context, app }) => {
        await presenter(page, app);
        const obs = await output(context, app, 'obs');
        await page.locator('#live-status-badge').click();
        await page.locator('#slide-item-slide_b').click();
        await page.locator('#live-status-badge').click();
        await liveIs(page, 'slide_b');
        await textIs(obs, TEXT_B);
        await page.locator('#live-status-badge').click();
        await expect.poll(() => objects(obs)).toEqual([]);
    });

    test('SC-12-01 LIVE 중 클릭은 세 출력의 실제 슬라이드를 바꾼다', async ({ page, context, app }) => {
        await presenter(page, app);
        const viewers = await Promise.all(['obs', 'stage', 'monitor'].map(channel => output(context, app, channel)));
        await page.locator('#slide-item-slide_b').click();
        await liveIs(page, 'slide_b');
        for (const viewer of viewers) await textIs(viewer, TEXT_B);
        await expect.poll(async () => (await project(app)).settings.currentLiveSlideId).toBe('slide_b');
    });

    for (const [next, previous] of [['ArrowRight', 'ArrowLeft'], ['Space', 'Backspace'], ['PageDown', 'PageUp']]) {
        test(`SC-12-02 ${next}/${previous} 이전 다음 순환`, async ({ page, context, app }) => {
            await presenter(page, app);
            const obs = await output(context, app, 'obs');
            await page.keyboard.press(next);
            await liveIs(page, 'slide_b');
            await textIs(obs, TEXT_B);
            await page.keyboard.press(next);
            await liveIs(page, 'slide_a');
            await textIs(obs, TEXT_A);
            await page.keyboard.press(previous);
            await liveIs(page, 'slide_b');
            await textIs(obs, TEXT_B);
        });
    }

    test('SC-12-02 연속 입력 후 선택 출력 저장 ID가 일치한다', async ({ page, context, app }) => {
        await presenter(page, app);
        const obs = await output(context, app, 'obs');
        for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight');
        await liveIs(page, 'slide_b');
        await textIs(obs, TEXT_B);
        await expect.poll(async () => (await project(app)).settings.currentLiveSlideId).toBe('slide_b');
    });

    test('SC-12-02 늦게 도착한 이전 LIVE 응답은 빠른 다음 입력을 되돌리지 않는다', async ({ page, context, app }) => {
        await page.addInitScript(() => {
            window.__slideChangeSequences = [];
            const descriptor = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
            Object.defineProperty(WebSocket.prototype, 'onmessage', {
                configurable: true,
                enumerable: true,
                get() { return descriptor.get.call(this); },
                set(listener) {
                    return descriptor.set.call(this, listener && function (event) {
                        let message;
                        try { message = JSON.parse(event.data); } catch {}
                        if (message?.type === 'SLIDE_CHANGE') {
                            window.__slideChangeSequences.push(message.sequence);
                            if (message.sequence === 1) {
                                setTimeout(() => listener.call(this, event), 120);
                                return;
                            }
                        }
                        return listener.call(this, event);
                    });
                }
            });
        });
        await presenter(page, app);
        const obs = await output(context, app, 'obs');
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowRight');
        await expect.poll(() => page.evaluate(() => window.__slideChangeSequences.includes(2))).toBe(true);
        await page.waitForTimeout(150);
        for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');

        await liveIs(page, 'slide_b');
        await textIs(obs, TEXT_B);
        await expect.poll(async () => (await project(app)).settings.currentLiveSlideId).toBe('slide_b');
    });

    test('SC-12-05 늦게 연 출력과 새로고침은 현재 LIVE를 유지한다', async ({ page, context, app }) => {
        await presenter(page, app);
        await page.locator('#slide-item-slide_b').click();
        for (const channel of ['obs', 'stage', 'monitor']) {
            const viewer = await output(context, app, channel);
            await textIs(viewer, TEXT_B);
            await viewer.reload();
            await textIs(viewer, TEXT_B);
        }
    });

    test('SC-12-06 뷰어 소켓 재연결은 제어의 최신 LIVE를 동기화한다', async ({ page, context, app }) => {
        await presenter(page, app);
        const viewer = await context.newPage();
        let upstream;
        let downstream;
        await viewer.routeWebSocket('**/ws?role=viewer*', socket => {
            downstream = socket;
            upstream = socket.connectToServer();
        });
        await viewer.goto(`${app.url}/static/viewer.html?channel=obs`);
        await textIs(viewer, TEXT_A);
        downstream.close({ code: 1001, reason: 'isolated output reconnect test' });
        upstream.close({ code: 1001, reason: 'isolated output reconnect test' });
        await expect(viewer.locator('body')).toHaveClass(/system-disconnected/);
        await page.locator('#slide-item-slide_b').click();
        await liveIs(page, 'slide_b');
        await expect(viewer.locator('body')).not.toHaveClass(/system-disconnected/, { timeout: 12000 });
        await textIs(viewer, TEXT_B);
    });

    test('SC-12-05 서버 재실행 후에도 선택된 LIVE가 복원된다', async ({ page, context, app }) => {
        await presenter(page, app);
        await page.locator('#slide-item-slide_b').click();
        await expect.poll(async () => (await project(app)).settings.currentLiveSlideId).toBe('slide_b');
        await app.restart();
        await page.reload();
        await liveIs(page, 'slide_b');
        const viewer = await output(context, app, 'obs');
        await textIs(viewer, TEXT_B);
    });

    test('SC-12-03 방송 현장 해상도는 독립 저장되고 재접속에 유지된다', async ({ page, context, app }) => {
        await presenter(page, app);
        await page.locator('#btn-open-settings').click();
        await page.locator('#width-input').fill('1280');
        await page.locator('#height-input').fill('720');
        await page.locator('#stage-width-input').fill('1024');
        await page.locator('#stage-height-input').fill('768');
        await page.locator('#btn-apply-res').click();
        await expect.poll(async () => (await project(app)).settings).toMatchObject({
            targetWidth: 1280, targetHeight: 720, stageTargetWidth: 1024, stageTargetHeight: 768
        });
        for (const [channel, width, height] of [['obs', 1280, 720], ['stage', 1024, 768]]) {
            const viewer = await output(context, app, channel);
            await expect.poll(() => viewer.evaluate(() => ({ width: targetWidth, height: targetHeight }))).toEqual({ width, height });
            await textIs(viewer, TEXT_A);
        }
        await app.restart();
        await page.reload();
        await page.locator('#btn-open-settings').click();
        await expect(page.locator('#stage-width-input')).toHaveValue('1024');
        await expect(page.locator('#width-input')).toHaveValue('1280');
    });
});

test.describe('SC-13 방송 찬양 레이아웃', () => {
    test.beforeEach(async ({ app }) => {
        await seed(app, [slide('slide_a', LYRIC_A, 'praise'), slide('slide_b', TEXT_B)]);
    });

    test('SC-13-04 저장 전 초안은 미리보기만 바꾸고 확정 후 출력한다', async ({ page, context, app }) => {
        const obs = await output(context, app, 'obs');
        await textIs(obs, LYRIC_A);
        const before = await objects(obs);
        await editorPanel(page, app, 'broadcast');
        await range(page, '#input-broadcast-font-size', 4, 1.5, 0.1);
        await expect.poll(() => page.evaluate(() => broadcastTextbox.fontSize / broadcastCanvas.getWidth())).toBeCloseTo(0.04, 5);
        expect(await objects(obs)).toEqual(before);
        expect((await project(app)).settings.praiseBroadcastLayout).toBeFalsy();
        await page.locator('#btn-save-broadcast-layout').click();
        await expect.poll(async () => (await objects(obs)).find(obj => obj.text)?.fontSize).toBe(76.8);
        await expect.poll(async () => (await project(app)).settings.praiseBroadcastLayout?.fontSize).toBe('4vw');
    });

    test('SC-13-02/03 외곽선 0 왼쪽 정렬 및 배경 바 반복 적용', async ({ page, context, app }) => {
        const obs = await output(context, app, 'obs');
        await editorPanel(page, app, 'broadcast');
        await range(page, '#input-broadcast-stroke-width', 0, 0, 1);
        await page.locator('#select-broadcast-text-align').selectOption('left');
        for (const enabled of [true, false, true, false]) {
            await page.locator('#chk-broadcast-bg-bar').setChecked(enabled);
            await page.locator('#btn-save-broadcast-layout').click();
            await expect.poll(async () => (await objects(obs)).filter(obj => obj.type === 'rect').length).toBe(enabled ? 1 : 0);
            await expect.poll(async () => (await objects(obs)).find(obj => obj.text)).toMatchObject({ text: LYRIC_A, strokeWidth: 0, textAlign: 'left' });
        }
        expect((await project(app)).settings.praiseBroadcastLayout).toMatchObject({ strokeWidth: 0, textAlign: 'left', hasBgBar: false });
    });

    test('SC-13-06 방송 레이아웃은 현장 모니터 일반 슬라이드를 바꾸지 않는다', async ({ page, context, app }) => {
        const obs = await output(context, app, 'obs');
        const stage = await output(context, app, 'stage');
        const monitor = await output(context, app, 'monitor');
        await textIs(stage, LYRIC_A);
        const stageBefore = await objects(stage);
        const monitorBefore = await monitor.locator('#monitor-current-text').getAttribute('style');
        const source = (await project(app)).slides;
        await editorPanel(page, app, 'broadcast');
        await range(page, '#input-broadcast-font-size', 5, 1.5, 0.1);
        await page.locator('#btn-save-broadcast-layout').click();
        await expect.poll(async () => (await objects(obs)).find(obj => obj.text)?.fontSize).toBe(96);
        expect(await objects(stage)).toEqual(stageBefore);
        expect(await monitor.locator('#monitor-current-text').getAttribute('style')).toBe(monitorBefore);
        await presenter(page, app);
        await page.locator('#slide-item-slide_b').click();
        await textIs(obs, TEXT_B);
        await expect.poll(async () => (await objects(obs)).find(obj => obj.text)?.fontSize).toBe(76.8);
        expect((await project(app)).slides.map(item => item.elements)).toEqual(source.map(item => item.elements));
    });

    test('SC-13-07 초기화 취소는 유지하고 확정은 정확한 기본값을 저장한다', async ({ page, context, app }) => {
        await editorPanel(page, app, 'broadcast');
        await range(page, '#input-broadcast-font-size', 4, 1.5, 0.1);
        await page.locator('#btn-save-broadcast-layout').click();
        await expect.poll(async () => (await project(app)).settings.praiseBroadcastLayout?.fontSize).toBe('4vw');
        page.once('dialog', dialog => dialog.dismiss());
        await page.locator('#btn-reset-broadcast-layout').click();
        expect((await project(app)).settings.praiseBroadcastLayout.fontSize).toBe('4vw');
        page.once('dialog', dialog => dialog.accept());
        await page.locator('#btn-reset-broadcast-layout').click();
        await expect.poll(async () => (await project(app)).settings.praiseBroadcastLayout).toMatchObject({
            x: 7.2, y: 76, width: 85.6, height: 18, fontSize: '3.5vw', textAlign: 'center', strokeWidth: 3, hasBgBar: false
        });
        await app.restart();
        const obs = await output(context, app, 'obs');
        await expect.poll(async () => (await objects(obs)).find(obj => obj.text)?.fontSize).toBeCloseTo(67.2, 5);
    });
});

test.describe('SC-14 무대 모니터', () => {
    test.beforeEach(async ({ app }) => {
        await seed(app, [slide('slide_a', LYRIC_A, 'praise'), slide('slide_b', LYRIC_B, 'praise')]);
    });

    test('SC-14-01/03 현재 다음 가사와 목록 마지막 표시', async ({ page, context, app }) => {
        await presenter(page, app);
        const monitor = await output(context, app, 'monitor');
        await expect(monitor.locator('#monitor-current-text')).toHaveText(LYRIC_A);
        await expect(monitor.locator('#monitor-next-text')).toHaveText(LYRIC_B);
        await page.locator('#slide-item-slide_b').click();
        await expect(monitor.locator('#monitor-current-text')).toHaveText(LYRIC_B);
        await expect(monitor.locator('#monitor-next-text')).toHaveText('[마지막 슬라이드입니다]');
        await expect(monitor.locator('#monitor-next-card')).toHaveCSS('opacity', '0.4');
    });

    test('SC-14-03 다음 빈 화면과 현재 빈 화면에서 이전 가사가 남지 않는다', async ({ page, context, app }) => {
        await seed(app, [slide('slide_a', LYRIC_A, 'praise'), slide('slide_b', '', 'praise'), slide('slide_c', LYRIC_B, 'praise')]);
        await page.goto(`${app.url}/static/presenter.html`);
        await expect(page.locator('.slide-item')).toHaveCount(3);
        const monitor = await output(context, app, 'monitor');
        await expect(monitor.locator('#monitor-next-card')).toBeHidden();
        await expect(monitor.locator('#monitor-next-text')).toHaveText('');
        await page.locator('#slide-item-slide_b').click();
        await expect(monitor.locator('#monitor-current-card')).toBeHidden();
        await expect(monitor.locator('#monitor-current-text')).toHaveText('');
        await expect(monitor.locator('#monitor-next-text')).toHaveText(LYRIC_B);
    });

    test('SC-14-02 찬양 일반 성경 찬양 전환 시 컨테이너와 원본 디자인 일치', async ({ page, context, app }) => {
        await seed(app, [slide('slide_a', LYRIC_A, 'praise'), slide('slide_b', TEXT_B), slide('slide_c', '자체 성경 검증 본문', 'bible')]);
        await page.goto(`${app.url}/static/presenter.html`);
        await expect(page.locator('.slide-item')).toHaveCount(3);
        const monitor = await output(context, app, 'monitor');
        await expect(monitor.locator('#monitor-viewer-container')).toBeVisible();
        for (const [id, content] of [['slide_b', TEXT_B], ['slide_c', '자체 성경 검증 본문']]) {
            await page.locator(`#slide-item-${id}`).click();
            await expect(monitor.locator('#monitor-viewer-container')).toBeHidden();
            await expect(monitor.locator('#canvas-container')).toBeVisible();
            await textIs(monitor, content);
        }
        await page.locator('#slide-item-slide_a').click();
        await expect(monitor.locator('#monitor-viewer-container')).toBeVisible();
        await expect(monitor.locator('#canvas-container')).toBeHidden();
        await expect(monitor.locator('#monitor-current-text')).toHaveText(LYRIC_A);
    });

    test('SC-14-04/06 초안은 미리보기만 적용하고 저장은 두 영역을 독립 적용한다', async ({ page, context, app }) => {
        const monitor = await output(context, app, 'monitor');
        const preview = await output(context, app, 'monitor_preview');
        await expect(monitor.locator('#monitor-current-text')).toHaveText(LYRIC_A);
        const before = await monitor.locator('#monitor-current-text').getAttribute('style');
        const source = (await project(app)).slides.map(item => item.elements);
        await editorPanel(page, app, 'monitor');
        await range(page, '#input-monitor-cur-font-size', 4, 1, 0.1);
        await range(page, '#input-monitor-nxt-font-size', 3, 1, 0.1);
        await page.locator('#select-monitor-cur-text-align').selectOption('left');
        await page.locator('#select-monitor-nxt-text-align').selectOption('right');
        await expect.poll(() => preview.locator('#monitor-current-text').evaluate(el => el.style.fontSize)).toMatch(/^4(?:\.0)?vw$/);
        expect(await monitor.locator('#monitor-current-text').getAttribute('style')).toBe(before);
        await page.locator('#btn-save-monitor-layout').click();
        await expect.poll(async () => (await monitorSettings(app)).currentBox?.fontSize).toBe('4.0vw');
        await expect.poll(() => monitor.locator('#monitor-current-text').evaluate(el => el.style.fontSize)).toMatch(/^4(?:\.0)?vw$/);
        await expect.poll(() => monitor.locator('#monitor-next-text').evaluate(el => el.style.fontSize)).toMatch(/^3(?:\.0)?vw$/);
        await expect(monitor.locator('#monitor-current-text')).toHaveCSS('text-align', 'left');
        await expect(monitor.locator('#monitor-next-text')).toHaveCSS('text-align', 'right');
        expect((await project(app)).slides.map(item => item.elements)).toEqual(source);
        await app.restart();
        await monitor.reload();
        await expect.poll(() => monitor.locator('#monitor-current-text').evaluate(el => el.style.fontSize)).toMatch(/^4(?:\.0)?vw$/);
        await expect(monitor.locator('#monitor-current-text')).toHaveText(LYRIC_A);
    });

    test('SC-14-05/09 저장된 CURRENT/NEXT 카드 설정을 복원하고 슬라이드 원본을 보호한다', async ({ page, context, app }) => {
        await seed(app, [slide('slide_a', LYRIC_A, 'praise'), slide('slide_b', LYRIC_B, 'praise')]);
        const initial = await monitorSettings(app);
        const settings = {
            ...initial,
            currentBox: { ...initial.currentBox, fontSize: '4.0vw', textAlign: 'left' },
            nextBox: { ...initial.nextBox, fontSize: '3.0vw', textAlign: 'right' }
        };
        const response = await app.request.put(`${app.url}/api/v1/monitor/settings`, { data: settings });
        expect(response.ok()).toBeTruthy();
        const source = (await project(app)).slides.map(item => item.elements);
        const monitor = await output(context, app, 'monitor');
        await editorPanel(page, app, 'monitor');
        await expect(page.locator('#input-monitor-cur-font-size')).toHaveValue('4');
        await expect(page.locator('#select-monitor-cur-text-align')).toHaveValue('left');
        await expect(page.locator('#input-monitor-nxt-font-size')).toHaveValue('3');
        await expect(page.locator('#select-monitor-nxt-text-align')).toHaveValue('right');
        await expect.poll(() => page.evaluate(() => monitorCanvas.getObjects().length)).toBe(2);
        await page.locator('#btn-save-monitor-layout').click();
        await expect.poll(async () => (await monitorSettings(app)).currentBox?.fontSize).toBe('4.0vw');
        await expect.poll(async () => (await monitorSettings(app)).nextBox?.fontSize).toBe('3.0vw');
        expect((await project(app)).slides.map(item => item.elements)).toEqual(source);
        await monitor.reload();
        await expect(monitor.locator('#monitor-current-text')).toHaveText(LYRIC_A);
    });

    test('SC-14-10 같은 PC 다른 창에 저장값을 적용하고 화면 크기 변경을 반영한다', async ({ page, context, app }) => {
        const monitor = await output(context, app, 'monitor');
        await editorPanel(page, app, 'monitor');
        await range(page, '#input-monitor-cur-font-size', 4, 1, 0.1);
        await page.locator('#btn-save-monitor-layout').click();
        await expect.poll(() => monitor.locator('#monitor-current-text').evaluate(el => el.style.fontSize)).toMatch(/^4(?:\.0)?vw$/);

        await monitor.setViewportSize({ width: 800, height: 600 });
        await expect.poll(() => monitor.locator('#monitor-current-text').evaluate(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight;
        })).toBe(true);
        await expect(monitor.locator('#monitor-current-text')).toHaveText(LYRIC_A);
    });

    test('SC-14-04/06 색상 외곽선 줄간격은 두 카드에 독립 적용하고 빠른 저장 후 복원한다', async ({ page, context, app }) => {
        const defaults = await monitorSettings(app);
        const seeded = await app.request.put('/api/v1/monitor/settings', { data: {
            ...defaults,
            currentBox: { ...defaults.currentBox, strokeColor: '#000000' },
            nextBox: { ...defaults.nextBox, strokeColor: '#000000' },
        } });
        expect(seeded.ok()).toBeTruthy();
        const monitor = await output(context, app, 'monitor');
        const preview = await output(context, app, 'monitor_preview');
        const source = (await project(app)).slides.map(item => item.elements);
        const before = await monitorSettings(app);
        await editorPanel(page, app, 'monitor');
        const controls = [
            { prefix: 'cur', key: 'currentBox', target: 'current', color: '#22cc88', cssColor: 'rgb(34, 204, 136)', stroke: 5, lineHeight: 1.6 },
            { prefix: 'nxt', key: 'nextBox', target: 'next', color: '#cc3388', cssColor: 'rgb(204, 51, 136)', stroke: 0, lineHeight: 1.85 }
        ];
        for (const control of controls) {
            const color = page.locator(`#input-monitor-${control.prefix}-text-color`);
            await expect(color).toBeVisible();
            // Native color dialogs are outside Playwright; exercise the input's browser event path.
            await color.evaluate((input, value) => {
                input.value = value;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }, control.color);
            await range(page, `#input-monitor-${control.prefix}-stroke-width`, control.stroke, 0, 1);
            await range(page, `#range-monitor-${control.prefix}-lineheight`, control.lineHeight, 1, 0.05);
            const text = preview.locator(`#monitor-${control.target}-text`);
            await expect(text).toHaveCSS('color', control.cssColor);
            await expect.poll(() => text.evaluate(el => el.style.lineHeight)).toBe(String(control.lineHeight));
            await expect.poll(() => page.evaluate(({ key, target }) => {
                const group = monitorCanvas.getObjects().find(item => item.boxType === key);
                return group.getObjects()[1].strokeWidth;
            }, { key: control.key, target: control.target })).toBe(control.stroke * (await page.evaluate(() => monitorCanvas.getWidth())) / 1920);
            await expect(page.locator(`#lbl-monitor-${control.prefix}-stroke-val`)).toHaveText(String(control.stroke));
            await expect(page.locator(`#val-monitor-${control.prefix}-lineheight`)).toHaveText(`${control.lineHeight.toFixed(2)}x`);
        }
        expect(await monitorSettings(app)).toEqual(before);
        await page.locator('#btn-monitor-apply-quick').click();
        for (const control of controls) {
            await expect.poll(async () => (await monitorSettings(app))[control.key]).toMatchObject({
                textColor: control.color, strokeWidth: control.stroke, lineHeight: control.lineHeight
            });
            await expect(monitor.locator(`#monitor-${control.target}-text`)).toHaveCSS('color', control.cssColor);
        }
        await page.reload();
        await page.locator('.nav-tab-btn[data-target="panel-monitor"]').click();
        await monitor.reload();
        for (const control of controls) {
            await expect(page.locator(`#input-monitor-${control.prefix}-text-color`)).toHaveValue(control.color);
            await expect(page.locator(`#input-monitor-${control.prefix}-stroke-width`)).toHaveValue(String(control.stroke));
            await expect(page.locator(`#range-monitor-${control.prefix}-lineheight`)).toHaveValue(String(control.lineHeight));
            const text = monitor.locator(`#monitor-${control.target}-text`);
            await expect(text).toHaveCSS('color', control.cssColor);
            await expect(text).toHaveCSS('-webkit-text-stroke-width', `${control.stroke}px`);
            await expect.poll(() => text.evaluate(el => el.style.lineHeight)).toBe(String(control.lineHeight));
        }
        expect((await project(app)).slides.map(item => item.elements)).toEqual(source);
    });

    for (const [key, target] of [['currentBox', 'current'], ['nextBox', 'next']]) {
        test(`SC-14-05 ${target} 카드 실제 드래그 리사이즈 저장과 화면 복원`, async ({ page, context, app }) => {
            const monitor = await output(context, app, 'monitor');
            await editorPanel(page, app, 'monitor');
            await expect.poll(() => page.evaluate(() => monitorCanvas.getObjects().length)).toBe(2);
            const before = await monitorSettings(app);
            const otherKey = key === 'currentBox' ? 'nextBox' : 'currentBox';
            const position = await page.evaluate(boxKey => {
                const card = monitorCanvas.getObjects().find(item => item.boxType === boxKey);
                const bounds = monitorCanvas.upperCanvasEl.getBoundingClientRect();
                const center = card.getCenterPoint();
                return { x: bounds.left + center.x, y: bounds.top + center.y,
                    left: card.left, top: card.top, width: monitorCanvas.getWidth(), height: monitorCanvas.getHeight() };
            }, key);
            await page.mouse.move(position.x, position.y);
            await page.mouse.down();
            await page.mouse.move(position.x + 20, position.y - 10, { steps: 8 });
            await page.mouse.up();
            const handle = await page.evaluate(boxKey => {
                const card = monitorCanvas.getObjects().find(item => item.boxType === boxKey);
                const bounds = monitorCanvas.upperCanvasEl.getBoundingClientRect();
                return { x: bounds.left + card.oCoords.mr.x, y: bounds.top + card.oCoords.mr.y };
            }, key);
            await page.mouse.move(handle.x, handle.y);
            await page.mouse.down();
            await page.mouse.move(handle.x - 50, handle.y, { steps: 8 });
            await page.mouse.up();
            await page.locator('#btn-monitor-apply-quick').click();
            await expect.poll(async () => (await monitorSettings(app))[key].leftPct)
                .toBeCloseTo((position.left + 20) / position.width * 100, 1);
            const saved = (await monitorSettings(app))[key];
            expect(saved.topPct).toBeCloseTo((position.top - 10) / position.height * 100, 1);
            expect(saved.widthPct).toBeLessThan(before[key].widthPct - 1);
            const untouched = (await monitorSettings(app))[otherKey];
            for (const property of ['leftPct', 'topPct', 'widthPct', 'heightPct']) {
                expect(untouched[property]).toBeCloseTo(before[otherKey][property], 0);
            }
            expect(untouched.textColor).toBe(before[otherKey].textColor);
            await monitor.reload();
            await expect.poll(() => monitor.locator(`#monitor-${target}-card`).evaluate(el => {
                const bounds = el.getBoundingClientRect();
                return bounds.width / window.innerWidth * 100;
            })).toBeCloseTo(saved.widthPct, 1);
            await expect(monitor.locator(`#monitor-${target}-text`)).toHaveText(target === 'current' ? LYRIC_A : LYRIC_B);
        });
    }
});

test.describe('출력 설정 복원과 경계 조건', () => {
    test('SC-13-01 방송 자막 이동 크기 변경 저장 재열기', async ({ page, context, app }) => {
        await seed(app, [slide('slide_a', LYRIC_A, 'praise'), slide('slide_b', LYRIC_B, 'praise')]);
        const obs = await output(context, app, 'obs');
        await editorPanel(page, app, 'broadcast');
        await expect.poll(() => page.evaluate(() => !!broadcastTextbox)).toBe(true);
        const original = await page.evaluate(() => {
            const bounds = broadcastCanvas.upperCanvasEl.getBoundingClientRect();
            return { x: bounds.left + broadcastTextbox.left + broadcastTextbox.width / 2,
                y: bounds.top + broadcastTextbox.top + broadcastTextbox.height / 2,
                left: broadcastTextbox.left, top: broadcastTextbox.top,
                canvasWidth: broadcastCanvas.getWidth(), canvasHeight: broadcastCanvas.getHeight() };
        });
        await page.mouse.move(original.x, original.y);
        await page.mouse.down();
        await page.mouse.move(original.x - 60, original.y - 50, { steps: 8 });
        await page.mouse.up();
        const handle = await page.evaluate(() => {
            const bounds = broadcastCanvas.upperCanvasEl.getBoundingClientRect();
            return { x: bounds.left + broadcastTextbox.oCoords.mr.x, y: bounds.top + broadcastTextbox.oCoords.mr.y };
        });
        await page.mouse.move(handle.x, handle.y);
        await page.mouse.down();
        await page.mouse.move(handle.x - 80, handle.y, { steps: 8 });
        await page.mouse.up();
        await page.locator('#btn-save-broadcast-layout').click();
        await expect.poll(async () => (await project(app)).settings.praiseBroadcastLayout?.x).toBeCloseTo((original.left - 60) / original.canvasWidth * 100, 0);
        const saved = (await project(app)).settings.praiseBroadcastLayout;
        expect(saved.y).toBeCloseTo((original.top - 50) / original.canvasHeight * 100, 0);
        expect(saved.width).toBeLessThan(85.6);
        await expect.poll(async () => (await objects(obs)).find(obj => obj.text)?.left).toBeCloseTo(saved.x / 100 * 1920, 1);
        await obs.reload();
        await expect.poll(async () => (await objects(obs)).find(obj => obj.text)?.width).toBeCloseTo(saved.width / 100 * 1920, 1);
        await textIs(obs, LYRIC_A);
    });

    test('SC-13-05 서버 레이아웃 우선 적용 및 서버 없음 로컬 복원', async ({ page, context, app }) => {
        const slides = [slide('slide_a', LYRIC_A, 'praise'), slide('slide_b', LYRIC_B, 'praise')];
        await seed(app, slides);
        await editorPanel(page, app, 'broadcast');
        await range(page, '#input-broadcast-font-size', 4, 1.5, 0.1);
        await page.locator('#btn-save-broadcast-layout').click();
        await expect.poll(async () => (await project(app)).settings.praiseBroadcastLayout?.fontSize).toBe('4vw');
        await page.close();
        await seed(app, slides, { praiseBroadcastLayout: { fontSize: '5vw' } });
        const obs = await output(context, app, 'obs');
        await expect.poll(async () => (await objects(obs)).find(obj => obj.text)?.fontSize).toBe(96);
        await obs.reload();
        await expect.poll(async () => (await objects(obs)).find(obj => obj.text)?.fontSize).toBe(96);
        await obs.close();
        await seed(app, slides);
        const fallback = await output(context, app, 'obs');
        await expect.poll(async () => (await objects(fallback)).find(obj => obj.text)?.fontSize).toBe(76.8);
    });

    test('SC-13-08 긴 가사 빈 화면 다음 곡 전환은 이전 가사와 배경 바를 제거한다', async ({ page, context, app }) => {
        const longLyric = '길게 이어지는 자체 테스트 가사 첫 줄\n함께 부르는 자체 테스트 가사 둘째 줄\n끝까지 유지되는 자체 테스트 가사 셋째 줄';
        await seed(app, [slide('slide_a', longLyric, 'praise'), slide('slide_b', '', 'praise'), slide('slide_c', LYRIC_B, 'praise')], {
            praiseBroadcastLayout: { hasBgBar: true }
        });
        await page.goto(`${app.url}/static/presenter.html`);
        await expect(page.locator('.slide-item')).toHaveCount(3);
        const obs = await output(context, app, 'obs');
        await textIs(obs, longLyric);
        const lyric = (await objects(obs)).find(obj => obj.text);
        expect(lyric.top + lyric.height).toBeLessThanOrEqual(1080);
        await page.locator('#slide-item-slide_b').click();
        await expect.poll(async () => (await objects(obs)).filter(obj => obj.text).length).toBe(0);
        await expect.poll(async () => (await objects(obs)).filter(obj => obj.type === 'rect').length).toBe(0);
        await page.locator('#slide-item-slide_c').click();
        await textIs(obs, LYRIC_B);
    });

    test('SC-12-07 창 크기별 출력 비율 좌표와 LIVE 유지', async ({ page, context, app }) => {
        await presenter(page, app);
        const obs = await output(context, app, 'obs');
        const stage = await output(context, app, 'stage');
        const monitor = await output(context, app, 'monitor');
        for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }]) {
            for (const viewer of [obs, stage, monitor]) {
                await viewer.setViewportSize(viewport);
                await textIs(viewer, TEXT_A);
                await expect.poll(() => viewer.evaluate(() => canvas.getWidth() / canvas.getHeight())).toBeCloseTo(16 / 9, 2);
                const text = (await objects(viewer)).find(obj => obj.text);
                expect(text.left).toBeCloseTo(192, 2);
                expect(text.top).toBeCloseTo(432, 2);
            }
            await liveIs(page, 'slide_a');
        }
        expect((await project(app)).settings.currentLiveSlideId).toBe('slide_a');
    });

    test('SC-14-07 API 실패 시 UI로 저장한 로컬 설정을 다시 읽는다', async ({ page, context, app }) => {
        await seed(app, [slide('slide_a', LYRIC_A, 'praise'), slide('slide_b', LYRIC_B, 'praise')]);
        await editorPanel(page, app, 'monitor');
        await range(page, '#input-monitor-cur-font-size', 4, 1, 0.1);
        await page.locator('#btn-save-monitor-layout').click();
        await expect.poll(async () => (await monitorSettings(app)).currentBox?.fontSize).toBe('4.0vw');
        await context.route('**/api/v1/monitor/settings', route => route.fulfill({ status: 503, json: { status: 'error' } }));
        const monitor = await output(context, app, 'monitor');
        await expect(monitor.locator('#monitor-current-text')).toHaveText(LYRIC_A);
        await expect.poll(() => monitor.locator('#monitor-current-text').evaluate(el => el.style.fontSize)).toMatch(/^4(?:\.0)?vw$/);
        await page.reload();
        await page.locator('.nav-tab-btn[data-target="panel-monitor"]').click();
        await expect(page.locator('#input-monitor-cur-font-size')).toHaveValue('4');
        expect((await monitorSettings(app)).currentBox.fontSize).toBe('4.0vw');
    });

    test('SC-14-08 모니터 초기화 취소 확정 및 재실행 기본값 유지', async ({ page, context, app }) => {
        await seed(app, [slide('slide_a', LYRIC_A, 'praise'), slide('slide_b', LYRIC_B, 'praise')]);
        await editorPanel(page, app, 'monitor');
        await range(page, '#input-monitor-cur-font-size', 4, 1, 0.1);
        await page.locator('#btn-save-monitor-layout').click();
        await expect.poll(async () => (await monitorSettings(app)).currentBox?.fontSize).toBe('4.0vw');
        page.once('dialog', dialog => dialog.dismiss());
        await page.locator('#btn-reset-monitor-layout').click();
        expect((await monitorSettings(app)).currentBox.fontSize).toBe('4.0vw');
        page.once('dialog', dialog => dialog.accept());
        await page.locator('#btn-reset-monitor-layout').click();
        await expect.poll(async () => (await monitorSettings(app)).currentBox).toMatchObject({
            leftPct: 5, topPct: 5, widthPct: 90, heightPct: 42, fontSize: '6.5vw', textAlign: 'center', strokeWidth: 2
        });
        expect((await monitorSettings(app)).nextBox).toMatchObject({ topPct: 51, fontSize: '6.5vw', strokeWidth: 1 });
        await app.restart();
        const monitor = await output(context, app, 'monitor');
        await expect.poll(() => monitor.locator('#monitor-current-text').evaluate(el => el.style.fontSize)).toBe('6.5vw');
        await expect(monitor.locator('#monitor-current-text')).toHaveText(LYRIC_A);
    });

    test('SC-14-08 저장 HTTP 오류는 성공 안내 없이 서버 기존값을 유지한다', async ({ page, app }) => {
        await seed(app, [slide('slide_a', LYRIC_A, 'praise'), slide('slide_b', LYRIC_B, 'praise')]);
        const original = await monitorSettings(app);
        await editorPanel(page, app, 'monitor');
        await range(page, '#input-monitor-cur-font-size', 4, 1, 0.1);
        await page.route('**/api/v1/monitor/settings', route => route.request().method() === 'PUT'
            ? route.fulfill({ status: 500, json: { status: 'error', message: 'controlled save failure' } })
            : route.continue());
        const failedResponse = page.waitForResponse(response => response.url().endsWith('/api/v1/monitor/settings') && response.status() === 500);
        await page.locator('#btn-save-monitor-layout').click();
        await failedResponse;
        expect((await monitorSettings(app)).currentBox).toEqual(original.currentBox);
        await expect(page.locator('#subcast-editor-toast')).toContainText(/실패|오류/);
        await expect(page.locator('#subcast-editor-toast')).not.toContainText('저장 및 적용되었습니다');
    });
});
