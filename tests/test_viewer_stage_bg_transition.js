const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const viewerSource = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'js', 'viewer.js'), 'utf8');
const start = viewerSource.indexOf('        function applyStageBackground(bgConfig) {');
const end = viewerSource.indexOf('        function initStageMotionBg()', start);
assert.notEqual(start, -1, 'applyStageBackground should exist');
assert.notEqual(end, -1, 'initStageMotionBg should follow applyStageBackground');
const applyFunction = viewerSource.slice(start, end);

function createVideo() {
    const listeners = new Map();
    let source = '';
    return {
        style: { display: 'none', opacity: '0' },
        paused: true,
        readyState: 0,
        error: null,
        listeners,
        get src() { return source ? new URL(source, 'http://localhost/static/viewer.html').href : ''; },
        set src(value) { source = value; },
        addEventListener(type, handler) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(handler);
        },
        removeEventListener(type, handler) { listeners.get(type)?.delete(handler); },
        emit(type) { for (const handler of [...(listeners.get(type) || [])]) handler(); },
        load() { this.readyState = 0; },
        play() { this.paused = false; return Promise.resolve(); },
        pause() { this.paused = true; },
    };
}

function createHarness() {
    const videos = {
        'stage-video-bg-1': createVideo(),
        'stage-video-bg-2': createVideo(),
        'stage-video-bg': createVideo(),
    };
    const motionCanvas = { style: {} };
    const timers = new Map();
    let timerId = 0;
    const context = vm.createContext({
        URL,
        URLSearchParams,
        window: { location: { search: '?channel=stage', href: 'http://localhost/static/viewer.html' } },
        document: {
            body: { classList: { add() {} } },
            getElementById(id) { return videos[id] || (id === 'stage-motion-bg' ? motionCanvas : null); },
        },
        initStageMotionBg() {},
        setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
        clearTimeout(id) { timers.delete(id); },
        console: { warn() {} },
    });
    vm.runInContext(`let _stageBgTransitionTimeout = null;\nlet _activeStageVideoIndex = 1;\nlet _stageBgRequestVersion = 0;\nlet _stageBgPendingCleanup = null;\nlet _stageBgOutgoingVideo = null;\n${applyFunction}\nthis.applyStageBackground = applyStageBackground;`, context);
    return { context, videos, motionCanvas };
}

test('rapid background changes discard callbacks from older requests', async () => {
    const { context, videos } = createHarness();
    const active = videos['stage-video-bg-1'];
    const candidate = videos['stage-video-bg-2'];
    active.style.display = 'block';
    active.style.opacity = '0.8';
    active.src = '/old.mp4';

    context.applyStageBackground({ type: 'video', videoUrl: '/first.mp4', opacity: 0.8 });
    const staleReadyHandler = [...candidate.listeners.get('loadeddata')][0];
    context.applyStageBackground({ type: 'video', videoUrl: '/latest.mp4', opacity: 0.6 });

    staleReadyHandler();
    assert.equal(candidate.paused, true, 'stale readiness callback must not start playback');
    assert.equal(candidate.src, 'http://localhost/latest.mp4');

    candidate.readyState = 2;
    candidate.emit('loadeddata');
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(candidate.style.opacity, '0.6');
    assert.equal(active.style.opacity, '0');
    assert.equal(vm.runInContext('_activeStageVideoIndex', context), 2);
});

test('failed playback keeps the current background visible', async () => {
    const { context, videos, motionCanvas } = createHarness();
    const active = videos['stage-video-bg-1'];
    const candidate = videos['stage-video-bg-2'];
    active.style.display = 'block';
    active.style.opacity = '0.7';
    active.src = '/current.mp4';
    candidate.play = () => Promise.reject(new Error('play failed'));

    context.applyStageBackground({ type: 'video', videoUrl: '/unavailable.mp4', opacity: 0.8 });
    candidate.readyState = 2;
    candidate.emit('canplay');
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(active.style.opacity, '0.7');
    assert.equal(active.style.display, 'block');
    assert.equal(candidate.style.display, 'none');
    assert.equal(motionCanvas.style.display, 'none', 'fallback animation stays hidden while the current background remains visible');
});
