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
        console, navigator: { onLine: online }, WebSocket: Object.assign(function () { return context.socketFixture; }, { OPEN: 1 }),
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
    context.location = { protocol: 'http:', host: 'localhost' };
    context.subcastMonitorEditor = { isMonitorMode: () => monitor };
    const run = code => vm.runInContext(code, context);
    for (const name of ['editor.js', 'modules/editor-history.js', 'modules/editor-sync.js', 'modules/editor-slides.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend/js', name), 'utf8'), context, { filename: name });
    }
    const canvas = {
        backgroundColor: background,
        getObjects: () => [object],
        forEachObject(callback) { callback(object); },
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
    context.loadSlideToCanvas = id => { updates.push(`load:${id}`); run("setSlideDirty(false)"); };
    context.renderSlides = () => {};
    context.renderTemplates = () => {};
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
        acknowledge(success = true, requestId = sent.at(-1).requestId) {
            run('connectWebSocket()');
            context.socketFixture.onmessage({ data: JSON.stringify({ type: 'SAVE_SLIDE_RESULT', requestId, success }) });
        },
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
        assert.deepEqual(app.sent, [{ type: 'SAVE_SLIDE', requestId: app.sent[0].requestId, slide: {
            id: 's1', name: '찬양', mood: '기쁨', praiseGroupId: 'song1',
            elements: [expectedElement], thumbnail: 'data:image/jpeg;base64,snapshot'
        } }]);
        assert.deepEqual(app.zooms, [1, 1.75]);
        assert.equal(app.captures[0].zoom, 1);
        assert.equal(app.captures[0].background, '#000000');
        assert.deepEqual(app.captures[0].options, { format: 'jpeg', quality: 0.4 });
        assert.deepEqual(app.state().projectData.slides[0], app.sent[0].slide);
        assert.equal(app.state().projectData.slides[1].thumbnail, 'next');
        assert.equal(app.state().isSlideDirty, true);
        app.acknowledge();
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
        assert.equal(app.state().isSlideDirty, true);
        app.acknowledge();
        assert.equal(app.state().isSlideDirty, false);
    });
}

test('수동 저장은 선택 표시를 제외해 캡처하고 선택을 복원한다', () => {
    const app = editor();
    app.run('saveSlideData()');
    assert.equal(app.captures[0].selected, null);
    assert.equal(app.selected(), app.object);
    assert.equal(app.elements.get('status-text').innerText, '저장 중...');
    app.acknowledge();
    assert.equal(app.elements.get('status-text').innerText, '저장 완료');
    app.tick(2000);
    assert.equal(app.elements.get('status-text').innerText, '연결됨');
});

test('자동 저장은 선택 객체를 유지하며 저장 상태를 표시한다', () => {
    const app = editor();
    app.run('performAutoSave()');
    assert.equal(app.captures[0].selected, app.object);
    assert.equal(app.elements.get('autosave-status-text').innerText, '저장 중...');
    app.acknowledge();
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

test('수동 저장은 연결 단절 시 모델과 dirty를 유지하고 실패를 표시한다', () => {
    const app = editor({ connected: false });
    const before = app.state();
    app.run('saveSlideData()');
    assert.deepEqual(app.sent, []);
    assert.deepEqual(app.state(), before);
    assert.match(app.elements.get('status-text').innerText, /저장 실패/);
});

for (const save of ['performAutoSave', 'saveSlideData']) {
    test(`${save}: 서버 실패와 응답 시간 초과는 dirty를 유지한다`, () => {
        for (const failure of ['server', 'timeout']) {
            const app = editor();
            app.run(`${save}()`);
            if (failure === 'server') app.acknowledge(false);
            else app.tick(10000);
            assert.equal(app.state().isSlideDirty, true);
            assert.match(app.elements.get('autosave-status-text').innerText, /저장 실패/);
        }
    });
    test(`${save}: 이전 저장 응답은 이후 편집을 완료 처리하지 않는다`, () => {
        const app = editor();
        app.run(`${save}()`);
        app.object.text = '새 편집';
        app.run('setSlideDirty(true)');
        app.acknowledge();
        assert.equal(app.state().isSlideDirty, true);
        assert.notEqual(app.elements.get('autosave-status-text').innerText, '모든 변경사항 저장됨');
    });
}

test('연결 단절은 대기 중인 저장을 실패 처리한다', () => {
    const app = editor();
    app.run('connectWebSocket(); saveSlideData(); handleOffline()');
    assert.equal(app.state().isSlideDirty, true);
    assert.match(app.elements.get('status-text').innerText, /저장 실패/);
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
    app.run("performAutoSave(); setSlideDirty(false); selectSlideForEdit('s2')");
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

test('boolean dirty 전환은 이전 슬라이드를 저장한 뒤 잠금을 넘긴다', () => {
    const app = editor();
    app.run("triggerAutoSave(); selectSlideForEdit('s2')");
    assert.deepEqual(app.sent.map(message => message.type), ['SAVE_SLIDE']);
    assert.equal(app.state().activeSlideId, 's1');
    app.acknowledge();
    assert.deepEqual(app.sent.map(message => message.type), ['SAVE_SLIDE', 'UNLOCK_SLIDE', 'LOCK_SLIDE']);
    assert.deepEqual(app.sent[0].slide.elements, [expectedElement]);
    app.tick(1000);
    assert.equal(app.sent.filter(message => message.type === 'SAVE_SLIDE').length, 1);
});

test('저장할 수 없으면 이전 슬라이드의 편집 내용과 잠금을 유지한다', () => {
    const app = editor({ connected: false });
    app.run("selectSlideForEdit('s2')");
    assert.equal(app.state().activeSlideId, 's1');
    assert.equal(app.state().isSlideDirty, true);
    assert.deepEqual(app.sent, []);
    assert.ok(!app.updates.includes('load:s2'));
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

test('dirty 전환은 캡처와 직렬화 후 이전 슬라이드를 먼저 저장한다', () => {
    const app = editor();
    const order = [];
    const capture = app.canvas.toDataURL;
    app.canvas.toDataURL = options => { order.push('capture'); return capture(options); };
    app.canvas.getObjects = () => { order.push('serialize'); return [app.object]; };
    app.run("selectSlideForEdit('s2')");
    assert.deepEqual(order, ['capture', 'serialize']);
    assert.deepEqual(app.sent.map(message => message.type), ['SAVE_SLIDE']);
    assert.equal(app.state().activeSlideId, 's1');
    app.acknowledge();
    assert.deepEqual(app.sent.map(message => message.type), ['SAVE_SLIDE', 'UNLOCK_SLIDE', 'LOCK_SLIDE']);
    assert.deepEqual(app.sent[0].slide.elements, [expectedElement]);
    assert.equal(app.sent[0].slide.thumbnail, 'data:image/jpeg;base64,snapshot');
    assert.equal(app.captures[0].selected, app.object);
    assert.deepEqual(app.zooms, [1, 1.75]);
});

for (const failure of ['server', 'timeout', 'send']) {
    test(`전환 저장 실패(${failure})는 이전 캔버스에 남는다`, () => {
        const app = editor();
        if (failure === 'send') app.run("ws.send = () => { throw Error('closed'); }");
        app.run("selectSlideForEdit('s2')");
        if (failure === 'server') app.acknowledge(false);
        if (failure === 'timeout') app.tick(10000);
        assert.equal(app.state().activeSlideId, 's1');
        assert.equal(app.state().isSlideDirty, true);
        assert.ok(!app.updates.includes('load:s2'));
        assert.match(app.elements.get('autosave-status-text').innerText, /저장 실패/);
    });
}

test('저장 중 다시 편집하면 이전 응답으로 전환하지 않는다', () => {
    const app = editor();
    app.run("selectSlideForEdit('s2'); setSlideDirty(true)");
    app.acknowledge();
    assert.equal(app.state().activeSlideId, 's1');
    assert.equal(app.state().isSlideDirty, true);
});

test('자신의 저장 broadcast는 진행 중인 최신 로컬 상태를 덮어쓰지 않는다', () => {
    const app = editor();
    app.run('connectWebSocket(); saveSlideData()');
    app.run(`ws.onmessage({data: JSON.stringify({type: 'SLIDE_UPDATED', slideId: 's1', slide: {id: 's1', elements: []}})})`);
    assert.deepEqual(app.state().projectData.slides[0].elements, [expectedElement]);
});

test('연결 복구 동기화는 같은 프로젝트의 저장 실패 편집을 보존한다', () => {
    const app = editor();
    app.run('connectWebSocket(); saveSlideData(); handleOffline()');
    app.run(`ws.onmessage({data: JSON.stringify({type: 'INITIAL_SYNC', data: {slides: [
        {id: 's1', elements: [], thumbnail: 'server-old'}, {id: 's2', elements: [], thumbnail: 'next'}
    ]}})})`);
    assert.equal(app.state().isSlideDirty, true);
    assert.deepEqual(app.state().projectData.slides[0].elements, [expectedElement]);
    assert.ok(!app.updates.includes('load:s1'));
});

test('이전 프로젝트의 저장 응답은 새 프로젝트에서 전환을 실행하지 않는다', () => {
    const app = editor();
    app.run("projectData.id = 'old'; selectSlideForEdit('s2'); projectData.id = 'new'");
    app.acknowledge();
    assert.equal(app.state().activeSlideId, 's1');
    assert.equal(app.state().isSlideDirty, true);
});

test('시간 초과 뒤 늦은 broadcast도 최신 편집 내용을 덮지 않는다', () => {
    const app = editor();
    app.run('connectWebSocket(); saveSlideData()');
    app.tick(10000);
    app.object.text = '응답 대기 뒤 편집';
    app.run('setSlideDirty(true)');
    app.run(`ws.onmessage({data: JSON.stringify({type: 'SLIDE_UPDATED', slideId: 's1', slide: {id: 's1', elements: []}})})`);
    assert.deepEqual(app.state().projectData.slides[0].elements, [expectedElement]);
    assert.equal(app.state().isSlideDirty, true);
});

test('최신 저장 완료 뒤 오래된 요청의 시간 초과가 실패 표시를 만들지 않는다', () => {
    const app = editor();
    app.run('saveSlideData()');
    app.tick(500);
    app.run('setSlideDirty(true); saveSlideData()');
    app.acknowledge();
    app.tick(10000);
    assert.equal(app.state().isSlideDirty, false);
    assert.equal(app.elements.get('autosave-status-text').innerText, '모든 변경사항 저장됨');
});

test('명시적 PROJECT_SYNC의 템플릿 변경은 기존처럼 캔버스에 적용한다', () => {
    const app = editor();
    app.run('connectWebSocket()');
    app.run(`ws.onmessage({data: JSON.stringify({type: 'PROJECT_SYNC', data: {slides: [
        {id: 's1', elements: [], thumbnail: 'template'}, {id: 's2', elements: [], thumbnail: 'next'}
    ]}})})`);
    assert.equal(app.state().isSlideDirty, false);
    assert.deepEqual(app.state().projectData.slides[0].elements, []);
    assert.ok(app.updates.includes('load:s1'));
});
