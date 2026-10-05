const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function editor({ connected = true, online = true, monitor = false, background = '' } = {}) {
    const sent = [];
    const captures = [];
    const zooms = [];
    const updates = [];
    const timers = new Map();
    let now = 0;
    let timerId = 0;
    const elements = new Map(['status-text', 'autosave-status-icon', 'autosave-status-text', 'editor-name']
        .map(id => [id, { value: '테스터', innerText: '', style: {} }]));
    const object = {
        type: 'textbox', originalId: 'text1', text: '수정한 가사', left: 76.8, top: 43.2,
        width: 384, height: 86.4, scaleX: 1, scaleY: 1, opacity: 0.8,
        originalVwSize: '4vw', fill: '#abcdef', fontFamily: 'Inter', strokeWidth: 2
    };
    let selectedObject = object;
    const context = vm.createContext({
        console, navigator: { onLine: online }, WebSocket: { OPEN: 1 },
        document: { readyState: 'loading', addEventListener() {}, getElementById: id => elements.get(id) || null },
        setTimeout(callback, delay) {
            const id = ++timerId;
            timers.set(id, { callback, due: now + delay });
            return id;
        },
        clearTimeout: id => timers.delete(id),
        requestAnimationFrame() {}
    });
    context.window = context;
    context.subcastMonitorEditor = { isMonitorMode: () => monitor };
    const run = code => vm.runInContext(code, context);
    for (const name of ['editor.js', 'modules/editor-history.js', 'modules/editor-sync.js', 'modules/editor-slides.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend/js', name), 'utf8'), context, { filename: name });
    }
    const canvas = {
        backgroundColor: background,
        getObjects: () => [object],
        getActiveObject: () => selectedObject,
        discardActiveObject() { selectedObject = null; return canvas; },
        setActiveObject(value) { selectedObject = value; return canvas; },
        requestRenderAll() { return canvas; },
        toDataURL(options) {
            captures.push({ options: { ...options }, zoom: run('canvasZoom'), selected: selectedObject, background: canvas.backgroundColor });
            return 'data:image/jpeg;base64,snapshot';
        }
    };
    context.canvasFixture = canvas;
    context.socketFixture = { readyState: connected ? 1 : 3, send: data => sent.push(JSON.parse(data)) };
    context.setCanvasZoom = zoom => { zooms.push(zoom); run(`canvasZoom = ${zoom}`); };
    context.updateSlideListItem = id => updates.push(id);
    context.updateSlideListSelection = () => {};
    context.scheduleActiveSlideVisibility = () => {};
    context.loadSlideToCanvas = id => updates.push(`load:${id}`);
    context.setControlsState = enabled => updates.push(`controls:${enabled}`);
    run(`canvas = canvasFixture; ws = socketFixture; canvasZoom = 1.75;
        projectData = { slides: [
            { id: 's1', name: '찬양', mood: '기쁨', praiseGroupId: 'song1', elements: [], thumbnail: 'old' },
            { id: 's2', name: '다음', elements: [], thumbnail: 'next' }
        ] };
        activeSlideId = 's1'; selectedSlideIds = ['s1']; myEditorId = 'me';
        lockedSlides = { s1: { ownerId: 'me' } }; setSlideDirty(true);`);
    return {
        run, object, canvas, sent, captures, zooms, updates, elements,
        selected: () => selectedObject,
        state: () => JSON.parse(run('JSON.stringify({projectData, activeSlideId, selectedSlideIds, isSlideDirty, canvasZoom, isLockRequested})')),
        tick(milliseconds) {
            now += milliseconds;
            for (const [id, timer] of [...timers]) {
                if (timer.due <= now) { timers.delete(id); timer.callback(); }
            }
        }
    };
}

const expectedElement = {
    id: 'text1', type: 'text', content: '수정한 가사', x: 10, y: 10, width: 50, height: 20,
    style: {
        opacity: 0.8, fontSize: '4vw', fontColor: '#abcdef', fontFamily: 'Inter',
        fontWeight: 'normal', fontStyle: 'normal', textAlign: 'left',
        strokeColor: 'transparent', strokeWidth: 2
    }
};

for (const save of ['performAutoSave', 'saveSlideData']) {
    test(`${save}: 저장 메시지·요소 좌표·태그와 곡 메타데이터·zoom 복원을 유지한다`, () => {
        const app = editor();
        app.run(`${save}()`);
        assert.deepEqual(app.sent, [{ type: 'SAVE_SLIDE', slide: {
            id: 's1', name: '찬양', mood: '기쁨', praiseGroupId: 'song1',
            elements: [expectedElement], thumbnail: 'data:image/jpeg;base64,snapshot'
        } }]);
        assert.deepEqual(app.zooms, [1, 1.75]);
        assert.equal(app.captures[0].zoom, 1);
        assert.equal(app.captures[0].background, '#000000');
        assert.deepEqual(app.captures[0].options, { format: 'jpeg', quality: 0.4 });
        assert.deepEqual(app.state().projectData.slides[0], app.sent[0].slide);
        assert.equal(app.state().projectData.slides[1].thumbnail, 'next');
        assert.equal(app.state().isSlideDirty, false);
        assert.equal(app.state().canvasZoom, 1.75);
        assert.equal(app.selected(), app.object);
        assert.deepEqual(app.updates, ['s1']);
    });

    test(`${save}: 지정한 배경색을 유지한다`, () => {
        const app = editor({ background: '#123456' });
        app.run(`${save}()`);
        assert.equal(app.captures[0].background, '#123456');
        assert.equal(app.canvas.backgroundColor, '#123456');
    });

    test(`${save}: 모니터 편집 중에는 슬라이드 캡처·전송·dirty 변경을 하지 않는다`, () => {
        const app = editor({ monitor: true });
        const before = app.state();
        app.run(`${save}()`);
        assert.deepEqual(app.state(), before);
        assert.deepEqual(app.sent, []);
        assert.deepEqual(app.captures, []);
    });

    test(`${save}: 활성 슬라이드가 없으면 저장하지 않는다`, () => {
        const app = editor();
        app.run(`activeSlideId = null; ${save}()`);
        assert.deepEqual(app.sent, []);
        assert.deepEqual(app.captures, []);
        assert.equal(app.state().isSlideDirty, true);
    });

    test(`${save}: 선택 객체가 없는 빈 슬라이드도 메타데이터와 함께 저장한다`, () => {
        const app = editor();
        app.canvas.setActiveObject(null);
        app.canvas.getObjects = () => [];
        app.run(`${save}()`);
        assert.deepEqual(app.sent[0].slide.elements, []);
        assert.equal(app.sent[0].slide.praiseGroupId, 'song1');
        assert.equal(app.selected(), null);
        assert.equal(app.state().canvasZoom, 1.75);
        assert.equal(app.state().isSlideDirty, false);
    });
}

test('수동 저장은 선택 표시를 제외해 캡처하고 선택을 복원한다', () => {
    const app = editor();
    app.run('saveSlideData()');
    assert.equal(app.captures[0].selected, null);
    assert.equal(app.selected(), app.object);
    assert.equal(app.elements.get('status-text').innerText, '저장 완료');
    app.tick(2000);
    assert.equal(app.elements.get('status-text').innerText, '연결됨');
});

test('자동 저장은 선택 객체를 유지하며 저장 상태를 표시한다', () => {
    const app = editor();
    app.run('performAutoSave()');
    assert.equal(app.captures[0].selected, app.object);
    assert.equal(app.elements.get('autosave-status-text').innerText, '모든 변경사항 저장됨');
});

test('자동 저장의 socket 단절은 로컬 모델·dirty를 유지하고 오류를 표시한다', () => {
    const app = editor({ connected: false });
    const before = app.state();
    app.run('performAutoSave()');
    assert.deepEqual(app.sent, []);
    assert.deepEqual(app.state(), before);
    assert.deepEqual(app.updates, []);
    assert.equal(app.elements.get('autosave-status-text').innerText, '저장 실패 - 연결 끊김');
});

test('현재 수동 저장은 socket 단절에도 로컬 모델과 저장 완료 표시를 갱신한다', () => {
    const app = editor({ connected: false });
    app.run('saveSlideData()');
    assert.deepEqual(app.sent, []);
    assert.deepEqual(app.state().projectData.slides[0].elements, [expectedElement]);
    assert.equal(app.state().isSlideDirty, false);
    app.tick(2000);
    assert.equal(app.elements.get('status-text').innerText, '저장 완료');
});

test('autosave는 마지막 변경부터 1초 후 최신 내용을 한 번 저장한다', () => {
    const app = editor();
    app.run('triggerAutoSave()');
    app.tick(900);
    assert.deepEqual(app.sent, []);
    app.object.text = '마지막 변경';
    app.run('triggerAutoSave()');
    app.tick(999);
    assert.deepEqual(app.sent, []);
    app.tick(1);
    assert.equal(app.sent.length, 1);
    assert.equal(app.sent[0].slide.elements[0].content, '마지막 변경');
    app.tick(1000);
    assert.equal(app.sent.length, 1);
});

for (const blocked of ['other-lock', 'offline', 'monitor']) {
    test(`autosave 예약 차단: ${blocked}`, () => {
        const app = editor({ online: blocked !== 'offline', monitor: blocked === 'monitor' });
        if (blocked === 'other-lock') app.run("lockedSlides.s1.ownerId = 'other'");
        app.run('triggerAutoSave()');
        app.tick(2000);
        assert.deepEqual(app.sent, []);
        assert.deepEqual(app.captures, []);
        assert.equal(app.state().isSlideDirty, true);
    });
}

test('자동 저장은 이미 삭제된 활성 슬라이드를 저장하지 않는다', () => {
    const app = editor();
    app.run("projectData.slides = projectData.slides.filter(s => s.id !== 's1'); performAutoSave()");
    assert.deepEqual(app.sent, []);
    assert.deepEqual(app.captures, []);
});

test('저장 후 전환은 이전 잠금 해제→새 잠금 요청 후 선택과 캔버스를 바꾼다', () => {
    const app = editor();
    app.run("performAutoSave(); selectSlideForEdit('s2')");
    assert.deepEqual(app.sent.slice(1), [
        { type: 'UNLOCK_SLIDE', slideId: 's1' },
        { type: 'LOCK_SLIDE', slideId: 's2', editorName: '테스터' }
    ]);
    assert.equal(app.state().activeSlideId, 's2');
    assert.deepEqual(app.state().selectedSlideIds, ['s2']);
    assert.equal(app.state().isLockRequested, true);
    assert.ok(app.updates.includes('load:s2'));
});

test('같은 슬라이드 재선택은 저장이나 잠금 재요청을 하지 않는다', () => {
    const app = editor();
    app.run("selectedSlideIds = []; selectSlideForEdit('s1')");
    assert.deepEqual(app.sent, []);
    assert.deepEqual(app.state().selectedSlideIds, ['s1']);
    assert.deepEqual(app.captures, []);
});

// Characterize the known boolean/function mismatch separately from intended saving behavior.
test('알려진 현재 동작: boolean dirty 상태의 전환은 이전 슬라이드를 즉시 저장하지 않는다', () => {
    const app = editor();
    app.run("selectSlideForEdit('s2')");
    assert.deepEqual(app.sent.map(message => message.type), ['UNLOCK_SLIDE', 'LOCK_SLIDE']);
    assert.equal(app.state().projectData.slides[0].thumbnail, 'old');
    assert.deepEqual(app.captures, []);
});

for (const save of ['performAutoSave', 'saveSlideData']) {
    test(`${save}: 캡처와 선택 복원 후 요소를 직렬화한다`, () => {
        const app = editor();
        const order = [];
        const capture = app.canvas.toDataURL;
        const restoreSelection = app.canvas.setActiveObject;
        app.canvas.toDataURL = options => { order.push('capture'); return capture(options); };
        app.canvas.setActiveObject = object => { order.push('selection'); return restoreSelection(object); };
        app.canvas.getObjects = () => { order.push('serialize'); return [app.object]; };
        app.run(`${save}()`);
        assert.deepEqual(order, save === 'saveSlideData'
            ? ['capture', 'selection', 'serialize'] : ['capture', 'serialize']);
    });
}

test('function dirty 상태의 전환은 요소 직렬화 후 캡처하고 이전 슬라이드를 먼저 저장한다', () => {
    const app = editor();
    const order = [];
    const capture = app.canvas.toDataURL;
    app.canvas.toDataURL = options => { order.push('capture'); return capture(options); };
    app.canvas.getObjects = () => { order.push('serialize'); return [app.object]; };
    app.run("isSlideDirty = () => true; selectSlideForEdit('s2')");
    assert.deepEqual(order, ['serialize', 'capture']);
    assert.deepEqual(app.sent.map(message => message.type), ['SAVE_SLIDE', 'UNLOCK_SLIDE', 'LOCK_SLIDE']);
    assert.deepEqual(app.sent[0].slide.elements, [expectedElement]);
    assert.equal(app.sent[0].slide.thumbnail, 'data:image/jpeg;base64,snapshot');
    assert.equal(app.captures[0].selected, app.object);
    assert.deepEqual(app.zooms, [1, 1.75]);
});
