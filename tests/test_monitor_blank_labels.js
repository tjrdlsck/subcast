const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

function section(source, start, end) {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from + start.length);
    assert.ok(from !== -1 && to > from, `${start} 함수 구간을 찾지 못했습니다`);
    return source.slice(from, to);
}

const viewerSource = fs.readFileSync('frontend/js/viewer.js', 'utf8');
const viewer = vm.createContext({ renderMonitorViewerLayout() {} });
vm.runInContext(section(viewerSource, 'function isPraiseSlide(slide)', 'function updateMonitorViewerTexts(')
    + section(viewerSource, 'function updateMonitorViewerTexts(', 'function extractSlideText(slide, fallbackName')
    + section(viewerSource, 'function extractSlideText(slide, fallbackName', 'function updateMonitorFromProjectData(')
    + section(viewerSource, 'function updateMonitorFromProjectData()', 'async function initMonitorModeViewer()'), viewer);

const editorMonitorSource = fs.readFileSync('frontend/js/modules/editor-monitor.js', 'utf8');
const editorMonitor = vm.createContext({});
vm.runInContext(section(editorMonitorSource, 'function isBlankMonitorSlide(slide)', 'function getCurrentAndNextSlideTexts('), editorMonitor);

const editorSlidesSource = fs.readFileSync('frontend/js/modules/editor-slides.js', 'utf8');
const messages = [];
const editorSlides = vm.createContext({
    projectData: { slides: [] },
    getMonitorBroadcastChannel: () => ({ postMessage: message => messages.push(message) })
});
vm.runInContext(section(editorSlidesSource, 'function notifyMonitorSlideChange(currentIndex)', 'function selectSlideForEdit('), editorSlides);

const praiseBlank = { id: 'slide_praise_blank', name: '찬양: 테스트 찬양 (2/2) [빈 화면]', slideType: 'praise', elements: [{ type: 'text', content: '' }] };
const legacyPraiseBlank = { id: 'old_blank', name: '찬양: 예전 찬양 (2/2) [빈 화면]', elements: [] };
const templateBlank = { id: 'slide_praise_template', name: '자막(템): 테스트 찬양 (2/2) [빈 화면]', slideType: 'praise', elements: [{ type: 'text', content: '템플릿 글자' }] };
const praiseVerse = { id: 'slide_praise_verse', name: '찬양: 테스트 찬양 (1/2)', slideType: 'praise', elements: [{ type: 'text', content: '가사 한 줄' }] };
const unrelated = { id: 'slide_regular', name: '일반: [빈 화면]', elements: [] };
const regularImage = { id: 'slide_image', name: '일반: 이미지', elements: [{ type: 'image', src: 'image.png' }] };
const namedButNotBlank = { id: 'slide_named', name: '일반: [빈 화면]', elements: [{ type: 'text', content: '실제 내용' }] };

test('송출 모니터와 에디터 미리보기는 종류와 관계없이 빈 슬라이드의 문구를 숨긴다', () => {
    for (const slide of [praiseBlank, legacyPraiseBlank, templateBlank, unrelated,
        { id: 'slide_bible_blank', slideType: 'bibleBlank', name: '성경: 빈 화면', elements: [] },
        { id: 'slide_empty_text', name: '일반 빈 텍스트', elements: [{ type: 'text', content: '  ' }] }]) {
        viewer.slide = slide;
        editorMonitor.slide = slide;
        assert.equal(vm.runInContext('extractSlideText(slide, slide.name)', viewer), '');
        assert.equal(vm.runInContext('extractSlidePlainText(slide, slide.name)', editorMonitor), '');
    }
});

test('가사와 이미지가 있는 일반 슬라이드는 유지한다', () => {
    for (const [slide, expected] of [[praiseVerse, '가사 한 줄'], [regularImage, '일반: 이미지'], [namedButNotBlank, '실제 내용']]) {
        viewer.slide = slide;
        editorMonitor.slide = slide;
        assert.equal(vm.runInContext('extractSlideText(slide, slide.name)', viewer), expected);
        assert.equal(vm.runInContext('extractSlidePlainText(slide, slide.name)', editorMonitor), expected);
    }
});

test('에디터에서 모니터로 보내는 현재·다음 빈 슬라이드 문구도 비운다', () => {
    editorSlides.projectData.slides = [praiseVerse, praiseBlank, unrelated];
    vm.runInContext('notifyMonitorSlideChange(0); notifyMonitorSlideChange(1)', editorSlides);
    assert.equal(messages[0].currentContent, '가사 한 줄');
    assert.equal(messages[0].nextContent, '');
    assert.equal(messages[1].currentContent, '');
    assert.equal(messages[1].nextContent, '');
});

test('빈 슬라이드 영역은 숨기고 다음 가사로 넘어가면 다시 표시한다', () => {
    const nodes = Object.fromEntries(['monitor-viewer-container', 'canvas-container', 'monitor-current-card',
        'monitor-current-text', 'monitor-next-card', 'monitor-next-text'].map(id => [id, { style: {}, textContent: '' }]));
    viewer.document = { getElementById: id => nodes[id] };
    vm.runInContext('updateMonitorViewerTexts("가사 한 줄", "", false, true)', viewer);
    assert.equal(nodes['monitor-current-card'].style.display, 'flex');
    assert.equal(nodes['monitor-next-card'].style.display, 'none');
    vm.runInContext('updateMonitorViewerTexts("", "다음 가사", false, true)', viewer);
    assert.equal(nodes['monitor-current-card'].style.display, 'none');
    assert.equal(nodes['monitor-next-card'].style.display, 'flex');
    assert.equal(nodes['monitor-next-text'].textContent, '다음 가사');
});

test('현재가 성경 또는 일반 빈 슬라이드여도 다음 찬양 가사를 표시한다', () => {
    const nodes = Object.fromEntries(['monitor-viewer-container', 'canvas-container', 'monitor-current-card',
        'monitor-current-text', 'monitor-next-card', 'monitor-next-text'].map(id => [id, { style: {}, textContent: '' }]));
    viewer.document = { getElementById: id => nodes[id] };
    viewer.window = { location: { search: '?channel=monitor' } };
    viewer.URLSearchParams = URLSearchParams;
    viewer.renderCurrentSlide = () => {};

    for (const blankSlide of [
        { id: 'bible_blank', name: '성경: 빈 화면', slideType: 'bibleBlank', elements: [] },
        { id: 'regular_blank', name: '일반 빈 슬라이드', elements: [] }
    ]) {
        viewer.projectData = { settings: { currentLiveSlideId: blankSlide.id }, slides: [blankSlide, praiseVerse] };
        vm.runInContext('updateMonitorFromProjectData()', viewer);
        assert.equal(nodes['monitor-viewer-container'].style.display, 'block');
        assert.equal(nodes['monitor-current-card'].style.display, 'none');
        assert.equal(nodes['monitor-next-card'].style.display, 'flex');
        assert.equal(nodes['monitor-next-text'].textContent, '가사 한 줄');
    }

    viewer.projectData.settings.currentLiveSlideId = praiseVerse.id;
    vm.runInContext('updateMonitorFromProjectData()', viewer);
    assert.equal(nodes['monitor-current-card'].style.display, 'flex');
    assert.equal(nodes['monitor-current-text'].textContent, '가사 한 줄');
});

test('내용이 있는 성경 구절은 다음 슬라이드와 관계없이 원본 캔버스로 표시한다', () => {
    const nodes = Object.fromEntries(['monitor-viewer-container', 'canvas-container', 'monitor-current-card',
        'monitor-current-text', 'monitor-next-card', 'monitor-next-text'].map(id => [id, { style: {}, textContent: '' }]));
    viewer.document = { getElementById: id => nodes[id] };
    viewer.window = { location: { search: '?channel=monitor' } };
    viewer.URLSearchParams = URLSearchParams;
    let renders = 0;
    viewer.renderCurrentSlide = () => { renders++; };
    const bibleVerse = { id: 'bible_verse', name: '성경: 요 3:16', elements: [
        { type: 'rect', content: '' },
        { type: 'text', content: '요 3:16' },
        { type: 'text', content: '하나님이 세상을 이처럼 사랑하사' }
    ] };
    viewer.projectData = { settings: { currentLiveSlideId: bibleVerse.id }, slides: [bibleVerse, praiseVerse] };
    vm.runInContext('updateMonitorFromProjectData()', viewer);
    assert.equal(nodes['monitor-viewer-container'].style.display, 'none');
    assert.equal(nodes['canvas-container'].style.display, 'flex');
    assert.equal(renders, 1);
});

test('에디터 슬라이드 변경 메시지도 빈 슬라이드 다음의 찬양을 분할 화면으로 보낸다', () => {
    const blankSlide = { id: 'regular_blank', name: '일반 빈 슬라이드', elements: [] };
    editorSlides.projectData.slides = [blankSlide, praiseVerse];
    vm.runInContext('notifyMonitorSlideChange(0)', editorSlides);
    assert.equal(messages.at(-1).currentContent, '');
    assert.equal(messages.at(-1).nextContent, '가사 한 줄');
    assert.equal(messages.at(-1).isPraise, true);
});

test('모니터가 전체화면으로 바뀌면 성경 캔버스와 가사 레이아웃을 함께 다시 맞춘다', () => {
    let canvasResizes = 0;
    let layoutRenders = 0;
    const resizeContext = vm.createContext({
        window: { location: { search: '?channel=monitor' } },
        URLSearchParams,
        updateCanvasDimensions: () => { canvasResizes++; },
        renderMonitorViewerLayout: () => { layoutRenders++; },
        requestAnimationFrame: callback => callback()
    });
    const resizeHandlerStart = viewerSource.lastIndexOf('window.onresize = () => {');
    assert.ok(resizeHandlerStart >= 0);
    vm.runInContext(viewerSource.slice(resizeHandlerStart), resizeContext);
    resizeContext.window.onresize();
    assert.equal(canvasResizes, 1);
    assert.equal(layoutRenders, 1);
});
