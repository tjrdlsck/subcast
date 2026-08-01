const fs = require('fs');
const path = require('path');
const assert = require('assert');

// mock environment
global.projectData = {
    settings: {
        stageBgLibrary: [
            { id: "bg_praise_1", name: "찬양 1", mood: "경배/찬양" },
            { id: "bg_praise_2", name: "찬양 2", mood: "경배/찬양" },
            { id: "bg_praise_3", name: "찬양 3", mood: "경배/찬양" }
        ]
    },
    slides: []
};
global.allStageBgFiles = [];
global.window = {};

const praiseJsPath = path.join(__dirname, '..', 'frontend', 'js', 'modules', 'editor-praise.js');
const fileContent = fs.readFileSync(praiseJsPath, 'utf8');

const matchFuncMatch = fileContent.match(/function matchStageBgForSong[\s\S]*?^            \}/m);
if (!matchFuncMatch) {
    console.error("Could not find matchStageBgForSong in file");
    process.exit(1);
}

const matchStageBgForSong = new Function('songMood', 'excludeBgIds', `
    const projectData = global.projectData;
    const allStageBgFiles = global.allStageBgFiles;
    ${matchFuncMatch[0]}
    return matchStageBgForSong(songMood, excludeBgIds);
`);

console.log("Running JS matchStageBgForSong tests...");

// Test 1: First selection with no excluded bg
const chosen1 = matchStageBgForSong("경배/찬양", []);
assert(["bg_praise_1", "bg_praise_2", "bg_praise_3"].includes(chosen1), "1차 선택은 후보군 중 하나여야함");

// Test 2: Second selection excluding chosen1
const chosen2 = matchStageBgForSong("경배/찬양", [chosen1]);
assert(chosen2 !== chosen1, "이미 차용된 배경은 겹치지 않아야함");

// Test 3: Third selection excluding chosen1 and chosen2
const chosen3 = matchStageBgForSong("경배/찬양", [chosen1, chosen2]);
assert(![chosen1, chosen2].includes(chosen3), "1, 2차 배경이 모두 제외된 3번째 배경이어야함");

// Test 4: Exhaustion fallback (excluding all 3 praise bgs)
const chosen4 = matchStageBgForSong("경배/찬양", [chosen1, chosen2, chosen3]);
assert(["bg_praise_1", "bg_praise_2", "bg_praise_3"].includes(chosen4), "후보 고갈 시에도 경배/찬양 후보군 중 선택되어야 함");
assert(chosen4 !== chosen3, "후보 고갈 폴백 시에도 바로 직전 배경(chosen3)과는 겹치지 않아야 함");

console.log("ALL JS MATCHING TESTS PASSED SUCCESSFULLY!");
