const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const viewerSource = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'js', 'viewer.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

async function createHarness(search = '?channel=broadcast', stored = {}, apiSettings = null, options = {}) {
    const elements = new Map();
    function element() {
        const classes = new Set();
        return {
            style: {}, children: [], textContent: '',
            classList: {
                add: name => classes.add(name), remove: name => classes.delete(name),
                contains: name => classes.has(name),
                toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
            },
            appendChild(child) { this.children.push(child); if (child.id) elements.set(child.id, child); },
            set innerHTML(value) { this.children = []; },
        };
    }
    for (const id of ['canvas-container', 'monitor-viewer-container', 'monitor-current-card',
        'monitor-current-text', 'monitor-next-card', 'monitor-next-text', 'stage-motion-bg']) {
        elements.set(id, element());
    }
    if (options.monitorHidden) elements.get('monitor-viewer-container').style.display = 'none';
    const listeners = new Map();
    const channels = new Map();
    const sockets = [];
    const canvases = [];
    const storage = new Map(Object.entries(stored));
    class StaticCanvas {
        constructor(id, options) { Object.assign(this, options); this.objects = []; this.renders = 0; canvases.push(this); }
        dispose() {}
        setWidth(value) { this.width = value; }
        setHeight(value) { this.height = value; }
        getWidth() { return this.width; }
        getHeight() { return this.height; }
        getElement() { return { parentNode: elements.get('canvas-container') }; }
        clear() { this.objects = []; }
        setZoom(value) { this.zoom = value; }
        add(object) { this.objects.push(object); }
        renderAll() { this.renders++; }
    }
    class Textbox {
        constructor(text, options) { this.text = text; Object.assign(this, options); }
    }
    class Rect { constructor(options) { Object.assign(this, options); } }
    class BroadcastChannel {
        constructor(name) { channels.set(name, this); }
    }
    class WebSocket {
        constructor(url) { this.url = url; sockets.push(this); }
    }
    const window = {
        location: { search, protocol: 'http:', host: 'localhost:8000' },
        innerWidth: 1000, innerHeight: 500, BroadcastChannel,
        addEventListener(type, handler) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(handler);
        },
    };
    const context = vm.createContext({
        URLSearchParams, window, BroadcastChannel, WebSocket,
        document: { body: element(), getElementById: id => elements.get(id) || null, createElement: element },
        fabric: { StaticCanvas, Textbox, Rect },
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
        fetch: async () => ({ ok: !!apiSettings, json: async () => ({ status: 'success', data: apiSettings }) }),
        console: { log() {}, warn() {}, error() {} },
        // Timers are retained by the browser in production; settings tests never trigger reconnect or animation.
        setTimeout() { return 1; }, clearTimeout() {}, requestAnimationFrame() {},
    });
    vm.runInContext(viewerSource, context, { filename: 'viewer.js', timeout: 1000 });
    window.onload();
    if (options.initialProject) sockets[0].onmessage({ data: JSON.stringify({ type: 'INITIAL_SYNC', data: options.initialProject }) });
    await new Promise(resolve => setImmediate(resolve));
    return {
        elements, storage, canvas: canvases[0],
        state: expression => clone(vm.runInContext(expression, context)),
        ws(message) { sockets[0].onmessage({ data: JSON.stringify(message) }); },
        broadcast(name, data) {
            assert.ok(channels.get(name)?.onmessage, `${name} listener initialized`);
            channels.get(name).onmessage({ data });
        },
        storageEvent(key, newValue) { for (const handler of listeners.get('storage') || []) handler({ key, newValue }); },
    };
}

function project(settings = {}) {
    return {
        settings: { currentLiveSlideId: 'slide_praise_1', ...settings },
        slides: [{ id: 'slide_praise_1', slideType: 'praise', elements: [
            { type: 'text', content: 'Current lyric', x: 1, y: 2, width: 80, height: 20, style: { fontSize: '30px' } },
        ] }, { id: 'slide_praise_2', slideType: 'praise', elements: [
            { type: 'text', content: 'Next lyric', x: 1, y: 2, width: 80, height: 20 },
        ] }],
    };
}

const praiseLayout = {
    x: 10, y: 60, width: 70, height: 25, fontSize: '4vw', fontFamily: 'Arial',
    fontWeight: '500', textAlign: 'right', fontColor: '#123456', strokeColor: '#abcdef',
    strokeWidth: 0, hasBgBar: true, bgBarColor: '#112233', bgBarY: 50, bgBarHeight: 30,
};

function assertPraiseRender(harness) {
    const [bar, text] = harness.canvas.objects;
    assert.equal(harness.canvas.objects.length, 2);
    assert.equal(bar.left, 0);
    assert.equal(bar.top, 540);
    assert.equal(bar.width, 1920);
    assert.equal(bar.height, 324);
    assert.equal(bar.fill, '#112233');
    assert.equal(text.text, 'Current lyric');
    assert.equal(text.left, 192);
    assert.equal(text.top, 648);
    assert.equal(text.width, 1344);
    assert.equal(text.fontSize, 76.8);
    assert.equal(text.fontFamily, 'Arial');
    assert.equal(text.fontWeight, '500');
    assert.equal(text.textAlign, 'right');
    assert.equal(text.fill, '#123456');
    assert.equal(text.stroke, '#abcdef');
    assert.equal(text.strokeWidth, 0);
}

for (const route of ['websocket', 'broadcast', 'storage']) {
    test(`praise ${route} applies all layout fields to project and actual canvas`, async () => {
        const h = await createHarness();
        h.ws({ type: 'INITIAL_SYNC', data: project() });
        const renders = h.canvas.renders;
        if (route === 'websocket') h.ws({ type: 'PRAISE_BROADCAST_LAYOUT_UPDATED', layout: praiseLayout });
        if (route === 'broadcast') h.broadcast('subcast_broadcast_channel', { type: 'PRAISE_BROADCAST_LAYOUT_UPDATED', layout: praiseLayout });
        if (route === 'storage') h.storageEvent('subcast_praise_broadcast_layout', JSON.stringify(praiseLayout));
        assert.deepEqual(h.state('projectData.settings.praiseBroadcastLayout'), praiseLayout);
        assert.ok(h.canvas.renders > renders);
        assertPraiseRender(h);
    });
}

test('praise initial sync uses stored layout and malformed storage falls back to defaults', async () => {
    const h = await createHarness('?channel=broadcast', { subcast_praise_broadcast_layout: JSON.stringify(praiseLayout) });
    h.ws({ type: 'INITIAL_SYNC', data: project() });
    assertPraiseRender(h);
    const fallback = await createHarness('?channel=broadcast', { subcast_praise_broadcast_layout: '{invalid' });
    fallback.ws({ type: 'INITIAL_SYNC', data: project() });
    assert.equal(fallback.canvas.objects.length, 1);
    const text = fallback.canvas.objects[0];
    assert.equal(text.left, 138.24);
    assert.equal(text.top, 820.8);
    assert.equal(text.width, 1643.52);
    assert.equal(text.fontSize, 67.2);
    assert.equal(text.fontFamily, 'Inter');
    assert.equal(text.fontWeight, '700');
    assert.equal(text.textAlign, 'center');
    assert.equal(text.fill, '#ffffff');
    assert.equal(text.stroke, '#000000');
    assert.equal(text.strokeWidth, 3);
});

test('project praise layout takes precedence over stored layout on initialization', async () => {
    const h = await createHarness('?channel=broadcast', { subcast_praise_broadcast_layout: JSON.stringify({ x: 99 }) });
    h.ws({ type: 'INITIAL_SYNC', data: project({ praiseBroadcastLayout: praiseLayout }) });
    assertPraiseRender(h);
});

const monitorSettings = {
    currentBox: { leftPct: 10, topPct: 20, widthPct: 70, heightPct: 30, fontSize: '4vw',
        textColor: '#123456', fontWeight: '600', fontStyle: 'italic', fontFamily: 'Arial',
        textAlign: 'left', opacity: 0, lineHeight: 1.7, strokeColor: '#abcdef', strokeWidth: 2 },
    nextBox: { leftPct: 15, topPct: 55, widthPct: 65, heightPct: 35, fontSize: 24,
        textColor: '#654321', fontWeight: '500', fontStyle: 'normal', fontFamily: 'Inter',
        textAlign: 'right', opacity: 0.5, lineHeight: 1.4, strokeColor: 'transparent', strokeWidth: 0 },
    customElements: [{ type: 'rect', x: 30, y: 40, width: 10, height: 20,
        style: { fillColor: '#fedcba', opacity: 0.3 } }],
};

function assertMonitorRender(h) {
    assert.deepEqual(h.state('monitorViewerSettings'), monitorSettings);
    const curCard = h.elements.get('monitor-current-card');
    const nextCard = h.elements.get('monitor-next-card');
    const cur = h.elements.get('monitor-current-text');
    const next = h.elements.get('monitor-next-text');
    assert.deepEqual([curCard.style.left, curCard.style.top, curCard.style.width, curCard.style.height], ['100px', '100px', '700px', '150px']);
    assert.deepEqual([nextCard.style.left, nextCard.style.top, nextCard.style.width, nextCard.style.height], ['150px', '275px', '650px', '175px']);
    for (const [node, expected] of [[cur, {
        fontSize: '4vw', color: '#123456', fontWeight: '600', fontStyle: 'italic', fontFamily: 'Arial',
        textAlign: 'left', justifyContent: 'flex-start', opacity: 0, lineHeight: '1.7', webkitTextStroke: '2px #abcdef', paintOrder: 'stroke fill',
    }], [next, {
        fontSize: '24px', color: '#654321', fontWeight: '500', fontStyle: 'normal', fontFamily: 'Inter',
        textAlign: 'right', justifyContent: 'flex-end', opacity: 0.5, lineHeight: '1.4', webkitTextStroke: '0px transparent',
    }]]) {
        for (const [key, value] of Object.entries(expected)) assert.equal(node.style[key], value, key);
    }
    const custom = h.elements.get('monitor-custom-elements-layer').children;
    assert.equal(custom.length, 1);
    assert.deepEqual([custom[0].style.left, custom[0].style.top, custom[0].style.width, custom[0].style.height,
        custom[0].style.backgroundColor, custom[0].style.opacity], ['300px', '200px', '100px', '100px', '#fedcba', 0.3]);
}

for (const search of ['?channel=monitor', '?channel=preview', '?channel=monitor_preview', '?mode=monitor']) {
    test(`monitor layout and storage apply actual DOM settings for ${search}`, async () => {
        const h = await createHarness(search);
        h.ws({ type: 'INITIAL_SYNC', data: project() });
        h.broadcast('subcast_monitor_channel', { type: 'MONITOR_LAYOUT_UPDATE', settings: monitorSettings });
        assertMonitorRender(h);
        assert.equal(h.elements.get('monitor-current-text').textContent, 'Current lyric');
        assert.equal(h.elements.get('monitor-next-text').textContent, 'Next lyric');
        h.broadcast('subcast_monitor_channel', { type: 'MONITOR_LAYOUT_UPDATE', settings: { currentBox: {}, nextBox: {} } });
        assert.equal(h.elements.get('monitor-current-text').style.fontSize, '3.8vw');
        assert.equal(h.elements.get('monitor-next-text').style.fontSize, '6.5vw');
        assert.equal(h.elements.get('monitor-current-text').style.lineHeight, '1.2');
        assert.equal(h.elements.get('monitor-custom-elements-layer').children.length, 0);
        h.storageEvent('subcast_monitor_settings', JSON.stringify(monitorSettings));
        assertMonitorRender(h);
    });
    test(`monitor preview is gated by channel for ${search}`, async () => {
        const h = await createHarness(search);
        const before = h.state('monitorViewerSettings');
        const beforeStyle = { ...h.elements.get('monitor-current-text').style };
        h.broadcast('subcast_monitor_channel', { type: 'MONITOR_PREVIEW_UPDATE', settings: monitorSettings });
        if (search === '?channel=preview' || search === '?channel=monitor_preview') assertMonitorRender(h);
        else {
            assert.deepEqual(h.state('monitorViewerSettings'), before);
            assert.deepEqual(h.elements.get('monitor-current-text').style, beforeStyle);
        }
    });
}

test('monitor initialization loads persisted layout when API is unavailable', async () => {
    const h = await createHarness('?channel=monitor', { subcast_monitor_settings: JSON.stringify(monitorSettings) });
    assertMonitorRender(h);
});

for (const settingsSource of ['storage', 'api']) {
    for (const projectFirst of [false, true]) {
        test(`hidden monitor applies initial ${settingsSource} layout when ${projectFirst ? 'project' : 'settings'} arrives first`, async () => {
            const h = await createHarness('?channel=monitor',
                settingsSource === 'storage' ? { subcast_monitor_settings: JSON.stringify(monitorSettings) } : {},
                settingsSource === 'api' ? monitorSettings : null,
                { monitorHidden: true, initialProject: projectFirst ? project() : null });
            if (!projectFirst) h.ws({ type: 'INITIAL_SYNC', data: project() });
            assert.equal(h.elements.get('monitor-viewer-container').style.display, 'block');
            assertMonitorRender(h);
            assert.equal(h.elements.get('monitor-current-text').textContent, 'Current lyric');
            assert.equal(h.elements.get('monitor-next-text').textContent, 'Next lyric');
        });
    }
}

test('monitor API layout persists and supersedes old local layout', async () => {
    const h = await createHarness('?channel=monitor', { subcast_monitor_settings: JSON.stringify({ currentBox: { fontSize: 99 } }) }, monitorSettings);
    assertMonitorRender(h);
    assert.deepEqual(JSON.parse(h.storage.get('subcast_monitor_settings')), monitorSettings);
});

test('malformed persisted monitor layout keeps initial defaults', async () => {
    const h = await createHarness('?channel=monitor', { subcast_monitor_settings: '{invalid' });
    assert.equal(h.elements.get('monitor-current-text').style.fontSize, '28px');
    assert.equal(h.elements.get('monitor-next-text').style.fontSize, '22px');
    assert.equal(h.elements.get('monitor-current-card').style.left, '50px');
    assert.equal(h.elements.get('monitor-next-card').style.top, '255px');
});

test('malformed and unrelated storage events preserve last applied settings and output', async () => {
    const h = await createHarness('?channel=monitor');
    h.ws({ type: 'INITIAL_SYNC', data: project({ praiseBroadcastLayout: praiseLayout }) });
    h.broadcast('subcast_monitor_channel', { type: 'MONITOR_LAYOUT_UPDATE', settings: monitorSettings });
    const before = clone(h.canvas.objects);
    for (const key of ['subcast_monitor_settings', 'subcast_praise_broadcast_layout']) {
        h.storageEvent(key, '{invalid');
        h.storageEvent(key, null);
    }
    h.storageEvent('unrelated', JSON.stringify({ currentBox: {} }));
    assertMonitorRender(h);
    assert.deepEqual(h.state('projectData.settings.praiseBroadcastLayout'), praiseLayout);
    assert.deepEqual(clone(h.canvas.objects), before);
});

test('stage preserves original slide rendering when praise layout changes', async () => {
    const h = await createHarness('?channel=stage');
    h.ws({ type: 'INITIAL_SYNC', data: project({ stageTargetWidth: 1280, stageTargetHeight: 720 }) });
    h.ws({ type: 'PRAISE_BROADCAST_LAYOUT_UPDATED', layout: praiseLayout });
    assert.deepEqual(h.state('projectData.settings.praiseBroadcastLayout'), praiseLayout);
    assert.equal(h.canvas.objects.length, 1);
    assert.equal(h.canvas.objects[0].left, 12.8);
    assert.equal(h.canvas.objects[0].fontSize, 30);
});

test('praise local channels can store a layout before initial project synchronization', async () => {
    for (const route of ['broadcast', 'storage']) {
        const h = await createHarness();
        if (route === 'broadcast') h.broadcast('subcast_broadcast_channel', { type: 'PRAISE_BROADCAST_LAYOUT_UPDATED', layout: praiseLayout });
        else h.storageEvent('subcast_praise_broadcast_layout', JSON.stringify(praiseLayout));
        assert.deepEqual(h.state('projectData.settings.praiseBroadcastLayout'), praiseLayout);
        assert.equal(h.canvas.renders, 0);
    }
    const h = await createHarness();
    h.ws({ type: 'PRAISE_BROADCAST_LAYOUT_UPDATED', layout: praiseLayout });
    assert.equal(h.state('projectData'), null);
});
