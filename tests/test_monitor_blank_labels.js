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
const viewer = vm.createContext({});
vm.runInContext(section(viewerSource, 'function isPraiseSlide(slide)', 'function updateMonitorViewerTexts(')
    + section(viewerSource, 'function extractSlideText(slide, fallbackName', 'function updateMonitorFromProjectData('), viewer);

const editorMonitorSource = fs.readFileSync('frontend/js/modules/editor-monitor.js', 'utf8');
const editorMonitor = vm.createContext({});
vm.runInContext(section(editorMonitorSource, 'function extractSlidePlainText(slide, fallbackName', 'function getCurrentAndNextSlideTexts('), editorMonitor);

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

test('송출 모니터와 에디터 모니터 미리보기는 찬양 빈 슬라이드를 짧게 표시한다', () => {
    for (const slide of [praiseBlank, legacyPraiseBlank, templateBlank]) {
        viewer.slide = slide;
        editorMonitor.slide = slide;
        assert.equal(vm.runInContext('extractSlideText(slide, slide.name)', viewer), '[빈 화면]');
        assert.equal(vm.runInContext('extractSlidePlainText(slide, slide.name)', editorMonitor), '[빈 화면]');
    }
});

test('일반 찬양 가사와 다른 슬라이드 이름은 유지한다', () => {
    for (const [slide, expected] of [[praiseVerse, '가사 한 줄'], [unrelated, '일반: [빈 화면]']]) {
        viewer.slide = slide;
        editorMonitor.slide = slide;
        assert.equal(vm.runInContext('extractSlideText(slide, slide.name)', viewer), expected);
        assert.equal(vm.runInContext('extractSlidePlainText(slide, slide.name)', editorMonitor), expected);
    }
});

test('에디터에서 모니터로 보내는 현재·다음 슬라이드 문구도 짧게 표시한다', () => {
    editorSlides.projectData.slides = [praiseVerse, praiseBlank, templateBlank];
    vm.runInContext('notifyMonitorSlideChange(0); notifyMonitorSlideChange(1)', editorSlides);
    assert.equal(messages[0].currentContent, '가사 한 줄');
    assert.equal(messages[0].nextContent, '[빈 화면]');
    assert.equal(messages[1].currentContent, '[빈 화면]');
    assert.equal(messages[1].nextContent, '[빈 화면]');
});
