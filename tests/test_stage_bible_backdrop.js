const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const viewerSource = fs.readFileSync('frontend/js/viewer.js', 'utf8');
const renderStart = viewerSource.indexOf('function renderCurrentSlide()');
const renderEnd = viewerSource.indexOf('function connectWebSocket()', renderStart);
assert.ok(renderStart >= 0 && renderEnd > renderStart);

test('현장 뷰어에서 성경 구절의 양옆을 검정으로 덮고 다음 슬라이드에서 해제한다', () => {
    const classes = new Set();
    const bibleVerse = {
        id: 'slide_bible_verse',
        name: '성경: 요 3:16',
        elements: [{ type: 'rect', content: '' }, { type: 'text', content: '하나님이 세상을 이처럼 사랑하사' }]
    };
    const bibleBlank = { id: 'slide_bible_blank_1', name: '성경: 빈 화면', slideType: 'bibleBlank', elements: [] };
    const ordinary = { id: 'slide_regular', name: '일반 슬라이드', elements: [{ type: 'text', content: '안내' }] };
    const context = vm.createContext({
        canvas: {
            clear() {}, getWidth: () => 1920, setZoom() {}, add() {}, renderAll() {}
        },
        projectData: { settings: { currentLiveSlideId: bibleVerse.id }, slides: [bibleVerse, bibleBlank, ordinary] },
        targetWidth: 1920,
        targetHeight: 1080,
        window: { location: { search: '?channel=stage' } },
        URLSearchParams,
        deserializeElement: elem => elem,
        document: { body: { classList: {
            add: name => classes.add(name),
            remove: name => classes.delete(name),
            toggle: (name, force) => force ? classes.add(name) : classes.delete(name)
        } } }
    });
    vm.runInContext(viewerSource.slice(renderStart, renderEnd), context);

    vm.runInContext('renderCurrentSlide()', context);
    assert.equal(classes.has('stage-bible-slide'), true);

    for (const slide of [bibleBlank, ordinary]) {
        context.projectData.settings.currentLiveSlideId = slide.id;
        vm.runInContext('renderCurrentSlide()', context);
        assert.equal(classes.has('stage-bible-slide'), false);
    }
});

test('성경 구절의 검정 배경은 현장 영상 위와 슬라이드 캔버스 아래에 배치된다', () => {
    const css = fs.readFileSync('frontend/css/viewer.css', 'utf8');
    const backdrop = css.match(/body\.stage-bible-slide::before\s*\{([^}]+)\}/)?.[1];
    assert.ok(backdrop);
    assert.match(backdrop, /inset:\s*0/);
    assert.match(backdrop, /background:\s*#000000/);
    assert.match(backdrop, /z-index:\s*9/);
    assert.match(css, /#canvas-container\s*\{[^}]*z-index:\s*10/s);
});
