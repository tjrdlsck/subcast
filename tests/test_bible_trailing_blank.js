const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const elements = new Map();
function element(id) {
    if (!elements.has(id)) elements.set(id, { value: '1', checked: true, style: {}, textContent: '', addEventListener() {} });
    return elements.get(id);
}

const context = vm.createContext({
    window: { addEventListener() {} },
    document: {
        getElementById: element,
        querySelector: () => ({ textContent: '' }),
        addEventListener() {}
    }
});
vm.runInContext(fs.readFileSync('frontend/js/modules/editor-bible-slides.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('frontend/js/modules/editor-bible.js', 'utf8'), context);

function prepare(mode, checked, verses) {
    element('select-bible-split-mode').value = mode;
    element('chk-bible-trailing-blank').checked = checked;
    context.selectedBibleVersesFixture = verses;
    vm.runInContext('selectedBibleVerses = selectedBibleVersesFixture; tempBibleSlidesToAdd = []', context);
    vm.runInContext('updateBibleExpectedSlides(); addBibleSlidesToProject();', context);
    return {
        expected: Number(element('val-expected-slides').textContent),
        slides: vm.runInContext('tempBibleSlidesToAdd', context)
    };
}

const verses = [
    { book_name: 'Genesis', chapter: 1, verse: 1, content: 'First verse' },
    { book_name: 'Genesis', chapter: 1, verse: 2, content: 'Second verse' },
    { book_name: 'Genesis', chapter: 1, verse: 3, content: 'Third verse' }
];

test('체크박스 UI 이벤트가 예상 장수와 실제 추가 목록을 함께 바꾼다', () => {
    vm.runInContext('fetchBibleBooks = () => {}; initBibleMainViewerEvents = () => {}; initBibleFeature();', context);
    const checkbox = element('chk-bible-trailing-blank');
    prepare('1', true, [verses[0]]);
    assert.equal(element('val-expected-slides').textContent, 2);

    checkbox.checked = false;
    checkbox.onchange();
    assert.equal(element('val-expected-slides').textContent, 1);
    element('btn-add-bible-slides').onclick();
    assert.equal(vm.runInContext('tempBibleSlidesToAdd.length', context), 1);

    checkbox.checked = true;
    checkbox.onchange();
    assert.equal(element('val-expected-slides').textContent, 2);
    element('btn-add-bible-slides').onclick();
    assert.equal(vm.runInContext('tempBibleSlidesToAdd.at(-1).slideType', context), 'bibleBlank');
});

test('모든 분할 방식에서 구절 묶음 끝에만 빈 슬라이드를 추가한다', () => {
    for (const [mode, count] of [['1', 3], ['2', 2], ['all', 1], ['auto', 3]]) {
        const { expected, slides } = prepare(mode, true, verses);
        assert.equal(expected, count + 1, mode);
        assert.equal(slides.length, count + 1, mode);
        assert.ok(slides.slice(0, -1).every(slide => slide.elements.length === 3), mode);
        assert.equal(slides.at(-1).slideType, 'bibleBlank');
        assert.equal(slides.at(-1).elements.length, 0);
    }
});

test('옵션을 끄면 구절만 추가하고 구절 선택이 없으면 빈 슬라이드도 만들지 않는다', () => {
    const disabled = prepare('1', false, verses);
    assert.equal(disabled.expected, 3);
    assert.equal(disabled.slides.length, 3);
    assert.ok(disabled.slides.every(slide => slide.slideType !== 'bibleBlank'));

    const empty = prepare('1', true, []);
    assert.equal(empty.expected, 0);
    assert.equal(empty.slides.length, 0);
});

test('자동 분할 예상 장수는 실제 분할 결과와 일치한다', () => {
    const longVerse = [{ ...verses[0], content: 'A '.repeat(60).trim() }];
    const { expected, slides } = prepare('auto', true, longVerse);
    assert.equal(expected, slides.length);
    assert.equal(slides.at(-1).slideType, 'bibleBlank');
});

test('빈 슬라이드로 전환할 때 현장 배경을 다시 고르지 않는다', () => {
    const presenter = fs.readFileSync('frontend/js/presenter.js', 'utf8');
    const changeSlide = presenter.slice(presenter.indexOf('function changeSlide(slideId) {'), presenter.indexOf('function navigateSlide(direction) {'));
    const sent = [];
    const presenterContext = vm.createContext({
        ws: { readyState: 1, send: data => sent.push(JSON.parse(data)) },
        WebSocket: { OPEN: 1 },
        projectData: { slides: [{ id: 'verse' }, { id: 'blank', slideType: 'bibleBlank' }] }
    });
    vm.runInContext(`${changeSlide}\nchangeSlide('blank');`, presenterContext);
    assert.deepEqual(sent.map(message => message.type), ['SLIDE_CHANGE']);

    vm.runInContext("changeSlide('verse');", presenterContext);
    assert.deepEqual(sent.slice(1).map(message => message.type), ['SLIDE_CHANGE', 'SELECT_STAGE_BACKGROUND_BY_MOOD']);
});
