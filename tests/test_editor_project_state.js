const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function editor() {
    const sent = [];
    const context = vm.createContext({
        console,
        document: { readyState: 'loading', addEventListener() {}, getElementById: () => null },
        location: { protocol: 'http:', host: 'localhost' },
        localStorage: { getItem: () => null, setItem() {} },
        WebSocket: class {
            static OPEN = 1;
            readyState = 1;
            send(data) { sent.push(JSON.parse(data)); }
        }
    });
    context.window = context;
    const run = code => vm.runInContext(code, context);
    // Match the classic script order in editor.html.
    for (const name of ['modules/editor-monitor.js', 'modules/editor-broadcast.js', 'modules/editor-sync.js', 'editor.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend/js', name), 'utf8'), context, { filename: name });
    }
    context.selectSlideForEdit = () => {};
    context.loadSlideToCanvas = () => {};
    context.renderSlides = () => {};
    context.renderTemplates = () => {};
    context.updateSlideListItem = () => true;
    run('connectWebSocket()');
    return {
        run, sent, context,
        receive: message => context.ws.onmessage({ data: JSON.stringify(message) }),
        json: code => JSON.parse(run(`JSON.stringify(${code})`))
    };
}

function project(prefix, fontSize = '8vw') {
    return {
        name: prefix,
        settings: { praiseBroadcastLayout: { fontSize } },
        slides: ['1', '2', '3'].map(id => ({
            id: `${prefix}${id}`, thumbnail: 'cached', elements: [{ type: 'text', content: `${prefix} text ${id}` }]
        }))
    };
}

test('startup exposes the same null project and selection through window', () => {
    const app = editor();
    assert.equal(app.context.projectData, null);
    assert.equal(app.context.activeSlideId, null);
    assert.equal(app.run('window.projectData === projectData && window.activeSlideId === activeSlideId'), true);
});

test('INITIAL_SYNC reaches broadcast layout and monitor text consumers with the selected slide', () => {
    const app = editor();
    app.receive({ type: 'INITIAL_SYNC', data: project('first') });
    assert.equal(app.run('window.projectData === projectData'), true);
    assert.equal(app.run('getPraiseBroadcastLayout().fontSize'), '8vw');
    app.run("activeSlideId = 'first2'");
    assert.equal(app.context.activeSlideId, 'first2');
    assert.deepEqual(app.json('getCurrentAndNextSlideTexts()'), { curText: 'first text 2', nextText: 'first text 3' });
});

test('PROJECT_SYNC replaces the shared project and subsequent slide updates reach monitor text', () => {
    const app = editor();
    app.receive({ type: 'INITIAL_SYNC', data: project('old') });
    const previous = app.context.projectData;
    app.receive({ type: 'PROJECT_SYNC', data: project('new', '5vw') });
    assert.notEqual(app.context.projectData, previous);
    assert.equal(app.run('window.projectData === projectData'), true);
    assert.equal(app.run('getPraiseBroadcastLayout().fontSize'), '5vw');
    app.run("activeSlideId = 'new2'");
    app.receive({ type: 'SLIDE_UPDATED', slideId: 'new3', slide: {
        id: 'new3', elements: [{ type: 'text', content: 'updated next' }]
    } });
    assert.deepEqual(app.json('getCurrentAndNextSlideTexts()'), { curText: 'new text 2', nextText: 'updated next' });
});

test('broadcast saves mutate the lexical project without discarding slides or metadata', () => {
    const app = editor();
    app.receive({ type: 'INITIAL_SYNC', data: project('saved') });
    app.run("savePraiseBroadcastLayoutDirect({ fontSize: '6vw' }, false)");
    assert.equal(app.run('projectData.settings.praiseBroadcastLayout.fontSize'), '6vw');
    assert.equal(app.run('projectData.name'), 'saved');
    assert.equal(app.run('projectData.slides.length'), 3);
    assert.deepEqual(app.sent, [{ type: 'UPDATE_PRAISE_BROADCAST_LAYOUT', layout: { fontSize: '6vw' } }]);
});

test('window replacements and startup broadcast initialization update the lexical state', () => {
    const app = editor();
    app.run("savePraiseBroadcastLayoutDirect({ fontSize: '4vw' }, false)");
    assert.equal(app.run('projectData.settings.praiseBroadcastLayout.fontSize'), '4vw');
    app.run("window.projectData = { slides: [] }; window.activeSlideId = 'selected'");
    assert.equal(app.run('window.projectData === projectData'), true);
    assert.equal(app.run('activeSlideId'), 'selected');
    app.run('window.projectData = null; window.activeSlideId = null');
    assert.equal(app.run('projectData'), null);
    assert.equal(app.run('activeSlideId'), null);
});
