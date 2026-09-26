const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'js', 'modules', 'editor-praise.js'), 'utf8');
const start = source.indexOf('function parsePraiseLyricsToBlocks(lyrics)');
const end = source.indexOf('window.parsePraiseLyricsToBlocks = parsePraiseLyricsToBlocks;', start);
assert.ok(start >= 0 && end > start, '찬양 가사 파서를 찾을 수 없습니다');
const parseLyrics = vm.runInNewContext(`(${source.slice(start, end).trim()})`);

test('공백만 있는 줄은 빈 슬라이드를 만들고 일반 빈 줄은 단락만 나눈다', () => {
    assert.deepEqual(Array.from(parseLyrics('1절\r\n  \r\n2절')), ['1절', '', '2절']);
    assert.deepEqual(Array.from(parseLyrics('1절\n\t\n2절')), ['1절', '', '2절']);
    assert.deepEqual(Array.from(parseLyrics('1절\n\n2절')), ['1절', '2절']);
});

test('끝의 공백 줄과 명시적 태그는 빈 슬라이드가 된다', () => {
    assert.deepEqual(Array.from(parseLyrics('1절\n ')), ['1절', '']);
    assert.deepEqual(Array.from(parseLyrics('1절\n[빈 화면]\n2절')), ['1절', '', '2절']);
    assert.deepEqual(Array.from(parseLyrics('1절\n \n\t\n2절')), ['1절', '', '2절']);
});
