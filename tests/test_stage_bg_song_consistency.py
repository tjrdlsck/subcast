from backend.schemas import Slide
from backend.services import websocket_handler
from backend.services.mood_matching import select_stage_background


def test_legacy_praise_slides_group_across_inserted_copies():
    slides = [
        Slide(id="a", name="찬양: 은혜 (1/3)"),
        Slide(id="b", name="찬양: 은혜 (2/3)"),
        Slide(id="c", name="찬양: 은혜 (1/2) (사본)"),
        Slide(id="d", name="찬양: 은혜 (2/2) (사본)"),
        Slide(id="e", name="찬양: 은혜 (3/3)"),
        Slide(id="f", name="일반 슬라이드"),
        Slide(id="g", name="찬양: 은혜 (1/3)"),
        Slide(id="h", name="자막(템): 주 사랑 (1/2)"),
        Slide(id="i", name="자막(템): 주 사랑 (2/2) [빈 화면]"),
    ]

    key = websocket_handler._legacy_praise_group_key
    assert key("a", slides) == key("b", slides)
    assert key("a", slides) == key("e", slides)
    assert key("c", slides) == key("d", slides)
    assert key("a", slides) != key("c", slides)
    assert key("a", slides) != key("g", slides)
    assert key("f", slides) is None
    assert key("h", slides) == key("i", slides)


def test_slide_background_tag_override_takes_precedence_and_can_be_cleared():
    slide = Slide(id="tagged", name="tagged", mood="song-default", stageBgMoodOverride="slide-choice")
    assert websocket_handler._slide_background_moods(slide, []) == ["slide-choice"]

    slide.stageBgMoodOverride = None
    assert websocket_handler._slide_background_moods(slide, []) == ["song-default"]


def test_slide_tag_override_blocks_stale_explicit_song_cache():
    wrong_tag_bg = {"name": "quiet.mp4", "mood": "quiet"}
    library = [wrong_tag_bg, {"name": "worship.mp4", "mood": "worship"}]
    assert not websocket_handler._should_reuse_cached_background(
        wrong_tag_bg, True, True, ["worship"], library
    )
    assert websocket_handler._should_reuse_cached_background(
        wrong_tag_bg, True, False, ["worship"], library
    )


def test_missing_override_uses_default_consistently():
    library = [
        {"name": "z.mp4", "url": "/z.mp4", "mood": "기본/일반"},
        {"name": "a.mp4", "url": "/a.mp4", "mood": "기본/일반"},
        {"name": "praise.mp4", "url": "/praise.mp4", "mood": "경배/찬양"},
    ]
    history = []

    for _ in range(5):
        chosen = select_stage_background(
            slide_moods=["경배/찬양"],
            override_bg_id="deleted.mp4",
            bg_library=library,
            history_queue=history,
        )
        assert chosen["id"] == "a.mp4"
    assert history == []
    assert select_stage_background(
        override_bg_id="deleted.mp4",
        bg_library=[library[-1]],
    ) == {"type": "ambient"}


def test_stale_background_records_are_excluded(tmp_path, monkeypatch):
    (tmp_path / "available.mp4").touch()
    monkeypatch.setattr(websocket_handler, "backgrounds_dir", tmp_path)
    monkeypatch.setattr(websocket_handler, "load_bg_meta", lambda: {
        "missing.mp4": {"isDefault": True},
        "available.mp4": {"mood": "경배/찬양"},
    })

    library = websocket_handler._available_stage_backgrounds([
        {"name": "missing.mp4", "url": "/missing.mp4", "isDefault": True},
    ])
    assert [item["name"] for item in library] == ["available.mp4"]
    assert library[0]["mood"] == "경배/찬양"


def test_automatic_song_cache_must_still_match_current_mood():
    praise_bg = {"name": "praise.mp4", "mood": "경배/찬양"}
    quiet_bg = {"name": "quiet.mp4", "mood": "잔잔/묵상"}
    default_bg = {"name": "default.mp4", "mood": "기본/일반"}
    library = [praise_bg, quiet_bg, default_bg]

    assert websocket_handler._cached_background_matches_moods(praise_bg, ["경배/찬양"], library)
    assert not websocket_handler._cached_background_matches_moods(praise_bg, ["잔잔/묵상"], library)
    assert websocket_handler._cached_background_matches_moods(default_bg, ["기도/회개"], library)
    assert not websocket_handler._cached_background_matches_moods(quiet_bg, ["기도/회개"], library)
