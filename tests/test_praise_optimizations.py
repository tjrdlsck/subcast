import re
import pytest


def parse_praise_lyrics_to_blocks_py(lyrics: str):
    """Python port of editor-praise.js parsePraiseLyricsToBlocks function"""
    if not lyrics:
        return []

    raw_lines = re.split(r'\r?\n', lyrics)
    blocks = []
    current_lines = []

    for line in raw_lines:
        trimmed = line.strip()
        is_explicit_blank_keyword = bool(re.match(r'^(\[|\()(빈\s*화면|빈\s*슬라이드|공백)(\]|\))$', trimmed, re.IGNORECASE))

        if is_explicit_blank_keyword:
            if current_lines:
                blocks.append("\n".join(current_lines).strip())
                current_lines = []
            blocks.append("")
        elif trimmed == "":
            if current_lines:
                blocks.append("\n".join(current_lines).strip())
                current_lines = []
        else:
            current_lines.append(line)

    if current_lines:
        blocks.append("\n".join(current_lines).strip())

    cleaned_blocks = []
    for idx, b in enumerate(blocks):
        if b != "":
            cleaned_blocks.append(b)
        elif idx == 0 or (cleaned_blocks and cleaned_blocks[-1] != ""):
            cleaned_blocks.append(b)

    return cleaned_blocks


def test_lyrics_parsing_with_whitespace_lines():
    lyrics = "은혜로다 주의 은혜\r\n   \r\n한없는 주의 사랑"
    blocks = parse_praise_lyrics_to_blocks_py(lyrics)
    assert len(blocks) == 2
    assert blocks[0] == "은혜로다 주의 은혜"
    assert blocks[1] == "한없는 주의 사랑"


def test_lyrics_parsing_with_explicit_blank_keywords():
    lyrics = "은혜로다 주의 은혜\n[빈 화면]\n한없는 주의 사랑\n(공백)\n주의 품에 거하리"
    blocks = parse_praise_lyrics_to_blocks_py(lyrics)
    assert len(blocks) == 5
    assert blocks[0] == "은혜로다 주의 은혜"
    assert blocks[1] == ""
    assert blocks[2] == "한없는 주의 사랑"
    assert blocks[3] == ""
    assert blocks[4] == "주의 품에 거하리"


def test_multi_selection_slide_creation_structure():
    selected_songs = [
        {"title": "곡 1", "lyrics": "1절 가사\n\n2절 가사", "mood": "경배/찬양"},
        {"title": "곡 2", "lyrics": "후렴 가사\n[빈 화면]\n엔딩 가사", "mood": "잔잔/묵상"}
    ]

    temp_slides = []
    for song in selected_songs:
        blocks = parse_praise_lyrics_to_blocks_py(song["lyrics"])
        for idx, block in enumerate(blocks):
            header = f"{song['title']} ({idx + 1}/{len(blocks)})" + (" [빈 화면]" if block == "" else "")
            temp_slides.append({
                "name": f"찬양: {header}",
                "content": block,
                "songTitle": song["title"],
                "mood": song["mood"]
            })

    assert len(temp_slides) == 5
    assert temp_slides[0]["songTitle"] == "곡 1"
    assert temp_slides[0]["content"] == "1절 가사"
    assert temp_slides[1]["content"] == "2절 가사"
    assert temp_slides[2]["songTitle"] == "곡 2"
    assert temp_slides[2]["content"] == "후렴 가사"
    assert temp_slides[3]["content"] == ""
    assert "[빈 화면]" in temp_slides[3]["name"]
    assert temp_slides[4]["content"] == "엔딩 가사"


def test_shortcut_guard_condition_integrity():
    with open("frontend/js/modules/editor-shortcuts.js", "r", encoding="utf-8") as f:
        content = f.read()

    assert "if (isPraiseTabActive && selectedPraiseSongs && selectedPraiseSongs.length > 0)" in content
    assert "if (isPraiseTabActive || (selectedPraiseSongs && selectedPraiseSongs.length > 0))" not in content


def test_praise_variable_declarations():
    with open("frontend/js/modules/editor-praise.js", "r", encoding="utf-8") as f:
        content = f.read()

    assert "let praiseLastClickedIndex = -1;" in content
    assert "let praiseSearchDebounceTimer = null;" in content
    assert "let praiseSearchAbortController = null;" in content


def test_show_toast_integration():
    with open("frontend/js/modules/editor-ui.js", "r", encoding="utf-8") as f:
        ui_content = f.read()
    assert "function showToast(" in ui_content

    with open("frontend/js/modules/editor-bible.js", "r", encoding="utf-8") as f:
        bible_content = f.read()
    assert 'showToast("🎉 찬양 슬라이드가 성공적으로 추가되었습니다.");' in bible_content
    assert 'alert("🎉 찬양 슬라이드가 성공적으로 추가되었습니다.");' not in bible_content
