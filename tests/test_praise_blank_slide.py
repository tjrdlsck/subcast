import pytest
import re
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def parse_praise_lyrics_to_blocks(lyrics: str):
    """
    Python implementation mirroring frontend parsePraiseLyricsToBlocks (editor-praise.js)
    """
    if not lyrics:
        return []

    raw_lines = re.split(r"\r?\n", lyrics)
    blocks = []
    current_lines = []

    for line in raw_lines:
        trimmed = line.strip()
        is_explicit_keyword = bool(re.match(r"^(\[|\()(빈\s*화면|빈\s*슬라이드|공백)(\]|\))$", trimmed, re.IGNORECASE))
        is_whitespace_line = (trimmed == "" and len(line) > 0 and bool(re.search(r"\s", line)))

        if is_explicit_keyword or is_whitespace_line:
            if current_lines:
                blocks.append("\n".join(current_lines).strip())
                current_lines = []
            blocks.append("")  # Blank slide block
        elif trimmed == "":
            if current_lines:
                blocks.append("\n".join(current_lines).strip())
                current_lines = []
        else:
            current_lines.append(line)

    if current_lines:
        blocks.append("\n".join(current_lines).strip())

    filtered = []
    for idx, b in enumerate(blocks):
        if b != "":
            filtered.append(b)
        elif idx == 0 or (filtered and filtered[-1] != ""):
            filtered.append(b)

    return filtered


def test_standard_lyrics_without_blank_slides():
    lyrics = "은혜 아니면 나 서지 못하네\n십자가 그 사랑\n\n오직 주의 은혜라\n나를 살리신 주"
    blocks = parse_praise_lyrics_to_blocks(lyrics)
    assert len(blocks) == 2
    assert blocks[0] == "은혜 아니면 나 서지 못하네\n십자가 그 사랑"
    assert blocks[1] == "오직 주의 은혜라\n나를 살리신 주"


def test_middle_blank_slide_with_space():
    lyrics = "은혜 아니면 나 서지 못하네\n\n  \n오직 주의 은혜라"
    blocks = parse_praise_lyrics_to_blocks(lyrics)
    assert len(blocks) == 3
    assert blocks[0] == "은혜 아니면 나 서지 못하네"
    assert blocks[1] == ""  # Blank slide in the middle
    assert blocks[2] == "오직 주의 은혜라"


def test_trailing_blank_slide_with_space():
    lyrics = "은혜 아니면 나 서지 못하네\n오직 주의 은혜라\n\n "
    blocks = parse_praise_lyrics_to_blocks(lyrics)
    assert len(blocks) == 2
    assert blocks[0] == "은혜 아니면 나 서지 못하네\n오직 주의 은혜라"
    assert blocks[1] == ""  # Blank slide at the end


def test_multiple_empty_lines_without_space_do_not_create_blank_slide():
    lyrics = "은혜 아니면 나 서지 못하네\n\n\n\n오직 주의 은혜라"
    blocks = parse_praise_lyrics_to_blocks(lyrics)
    assert len(blocks) == 2
    assert blocks[0] == "은혜 아니면 나 서지 못하네"
    assert blocks[1] == "오직 주의 은혜라"


def test_praise_blank_slide_inherits_stage_bg_metadata():
    title = "은혜"
    fixed_bg_id = "stage_bg_grace_01"
    praise_group_id = "praise_grp_12345"
    song_mood = "경배/찬양"

    blocks = ["은혜 아니면 나 서지 못하네", "", "오직 주의 은혜라"]
    slides = []

    for idx, block in enumerate(blocks):
        is_blank = block == ""
        header_text = f"{title} ({idx + 1}/{len(blocks)}) [빈 화면]" if is_blank else f"{title} ({idx + 1}/{len(blocks)})"
        
        slide_obj = {
            "id": f"slide_{idx}",
            "name": f"자막: {header_text}",
            "mood": song_mood,
            "moods": [song_mood],
            "overrideBgId": fixed_bg_id,
            "songTitle": title,
            "praiseGroupId": praise_group_id,
            "elements": [
                {
                    "type": "text",
                    "content": block
                }
            ]
        }
        slides.append(slide_obj)

    # Verify all slides share the exact same overrideBgId & praiseGroupId
    assert len(slides) == 3
    assert slides[1]["elements"][0]["content"] == ""
    assert slides[1]["overrideBgId"] == fixed_bg_id
    assert slides[1]["praiseGroupId"] == praise_group_id
    assert slides[0]["overrideBgId"] == slides[1]["overrideBgId"] == slides[2]["overrideBgId"]
    assert slides[0]["praiseGroupId"] == slides[1]["praiseGroupId"] == slides[2]["praiseGroupId"]


def test_explicit_blank_tag_keywords():
    lyrics = "은혜 아니면 나 서지 못하네\n[빈 화면]\n오직 주의 은혜라\n(빈슬라이드)"
    blocks = parse_praise_lyrics_to_blocks(lyrics)
    assert len(blocks) == 4
    assert blocks[0] == "은혜 아니면 나 서지 못하네"
    assert blocks[1] == ""
    assert blocks[2] == "오직 주의 은혜라"
    assert blocks[3] == ""


def test_praise_api_preserves_trailing_blank_line():
    lyrics_with_trailing_space = "은혜 아니면 나 서지 못하네\n\n "
    payload = {
        "title": "테스트 찬양 공백 보존",
        "lyrics": lyrics_with_trailing_space,
        "mood": "경배/찬양"
    }
    resp = client.post("/api/praise/save", json=payload)
    assert resp.status_code == 200

    search_resp = client.get("/api/praise/search?query=테스트 찬양 공백 보존")
    assert search_resp.status_code == 200
    results = search_resp.json()
    assert len(results) > 0
    saved_song = results[0]
    assert saved_song["lyrics"] == lyrics_with_trailing_space
    parsed_blocks = parse_praise_lyrics_to_blocks(saved_song["lyrics"])
    assert len(parsed_blocks) == 2
    assert parsed_blocks[1] == ""

