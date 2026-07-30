import os
import pytest
from backend.services.mood_matching import select_stage_background
from backend.schemas import Slide

def test_override_bg_selection():
    bg_library = [
        {"id": "bg_1", "name": "호수", "url": "/bg1.mp4", "mood": "잔잔/묵상"},
        {"id": "bg_2", "name": "하늘", "url": "/bg2.mp4", "mood": "경배/찬양"}
    ]
    res = select_stage_background(
        slide_moods="잔잔/묵상",
        override_bg_id="bg_2",
        bg_library=bg_library
    )
    assert res["id"] == "bg_2"
    assert res["videoUrl"] == "/bg2.mp4"

def test_single_tag_mood_matching():
    bg_library = [
        {"id": "bg_praise", "name": "찬양영상", "url": "/praise.mp4", "mood": "경배/찬양"},
        {"id": "bg_quiet", "name": "묵상영상", "url": "/quiet.mp4", "mood": "잔잔/묵상"}
    ]
    res = select_stage_background(
        slide_moods="경배/찬양",
        override_bg_id=None,
        bg_library=bg_library,
        history_queue=[]
    )
    assert res["id"] == "bg_praise"

def test_anti_repetition_sequential_matching():
    bg_library = [
        {"id": "bg_1", "name": "찬양영상1", "url": "/praise1.mp4", "mood": "경배/찬양"},
        {"id": "bg_2", "name": "찬양영상2", "url": "/praise2.mp4", "mood": "경배/찬양"}
    ]
    history_queue = []
    
    # 1회차 추출
    res1 = select_stage_background(
        slide_moods="경배/찬양",
        override_bg_id=None,
        bg_library=bg_library,
        history_queue=history_queue
    )
    first_id = res1["id"]
    
    # 2회차 추출 (동일 태그 연속 추출 시 바로 전 영상이 나오지 않는지 검증)
    res2 = select_stage_background(
        slide_moods="경배/찬양",
        override_bg_id=None,
        bg_library=bg_library,
        history_queue=history_queue
    )
    second_id = res2["id"]
    
    assert first_id != second_id, "연속 추출 시 동일 배경이 나오지 않아야 함"

def test_multitier_fallback():
    bg_library = [
        {"id": "bg_def", "name": "기본배경", "url": "/default.mp4", "isDefault": True, "mood": "기본/일반"},
        {"id": "bg_other", "name": "일반배경", "url": "/other.mp4", "isDefault": False, "mood": "절기/특별"}
    ]
    
    # 1. 일치 태그 없으면 Default 배경 선택
    res_def = select_stage_background(
        slide_moods="경배/찬양",
        override_bg_id=None,
        bg_library=bg_library
    )
    assert res_def["id"] == "bg_def"

    # 2. Default 배경도 없으면 전체 배경 중 선택
    no_def_library = [
        {"id": "bg_other", "name": "일반배경", "url": "/other.mp4", "isDefault": False, "mood": "절기/특별"}
    ]
    res_all = select_stage_background(
        slide_moods="경배/찬양",
        override_bg_id=None,
        bg_library=no_def_library
    )
    assert res_all["id"] == "bg_other"

    # 3. 비어있는 라이브러리면 ambient 반환
    res_ambient = select_stage_background(
        slide_moods="경배/찬양",
        override_bg_id=None,
        bg_library=[]
    )
    assert res_ambient["type"] == "ambient"

def test_slide_schema_defaults():
    slide = Slide(id="s1", name="은혜 아래 있네")
    assert slide.moods == []
    assert slide.overrideBgId is None

