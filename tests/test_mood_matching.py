import os
import pytest
from backend.services.mood_matching import select_stage_background
from backend.schemas import Slide

def test_override_bg_selection():
    bg_library = [
        {"id": "bg_1", "name": "호수", "url": "/bg1.mp4", "moods": ["잔잔한"]},
        {"id": "bg_2", "name": "하늘", "url": "/bg2.mp4", "moods": ["경배"]}
    ]
    res = select_stage_background(
        slide_moods=["잔잔한"],
        override_bg_id="bg_2",
        bg_library=bg_library
    )
    assert res["id"] == "bg_2"
    assert res["videoUrl"] == "/bg2.mp4"

def test_weighted_mood_matching():
    bg_library = [
        {"id": "bg_1", "name": "잔잔", "url": "/bg1.mp4", "moods": ["잔잔한"]},
        {"id": "bg_2", "name": "잔잔+경배", "url": "/bg2.mp4", "moods": ["잔잔한", "경배"]}
    ]
    # 잔잔+경배가 가중치 2로 더 선택 확률이 높음
    selected_ids = []
    for _ in range(50):
        res = select_stage_background(
            slide_moods=["잔잔한", "경배"],
            override_bg_id=None,
            bg_library=bg_library,
            history_queue=[]
        )
        selected_ids.append(res["id"])
    
    assert "bg_2" in selected_ids
    assert "bg_1" in selected_ids
    # bg_2 가중치가 2이고 bg_1 가중치가 1이므로 bg_2가 더 자주 선택됨
    assert selected_ids.count("bg_2") > selected_ids.count("bg_1")

def test_dynamic_history_queue_deadlock_prevention():
    # 후보군이 2개(M=2)인 경우, N=3 이력 큐로 인해 갇히거나 무한루프에 빠지지 않아야 함
    bg_library = [
        {"id": "bg_1", "name": "영상1", "url": "/bg1.mp4", "moods": ["기도"]},
        {"id": "bg_2", "name": "영상2", "url": "/bg2.mp4", "moods": ["기도"]}
    ]
    history_queue = []
    for _ in range(10):
        res = select_stage_background(
            slide_moods=["기도"],
            override_bg_id=None,
            bg_library=bg_library,
            history_queue=history_queue,
            max_history_size=3
        )
        assert res["id"] in ["bg_1", "bg_2"]

def test_multitier_fallback():
    bg_library = [
        {"id": "bg_def", "name": "기본배경", "url": "/default.mp4", "isDefault": True, "moods": []},
        {"id": "bg_other", "name": "일반배경", "url": "/other.mp4", "isDefault": False, "moods": ["신나는"]}
    ]
    
    # 1. 일치 태그 없으면 Default 배경 선택
    res_def = select_stage_background(
        slide_moods=["경배"],
        override_bg_id=None,
        bg_library=bg_library
    )
    assert res_def["id"] == "bg_def"

    # 2. Default 배경도 없으면 전체 배경 중 선택
    no_def_library = [
        {"id": "bg_other", "name": "일반배경", "url": "/other.mp4", "isDefault": False, "moods": ["신나는"]}
    ]
    res_all = select_stage_background(
        slide_moods=["경배"],
        override_bg_id=None,
        bg_library=no_def_library
    )
    assert res_all["id"] == "bg_other"

    # 3. 비어있는 라이브러리면 ambient 반환
    res_ambient = select_stage_background(
        slide_moods=["경배"],
        override_bg_id=None,
        bg_library=[]
    )
    assert res_ambient["type"] == "ambient"

def test_slide_schema_defaults():
    slide = Slide(id="s1", name="은혜 아래 있네")
    assert slide.moods == []
    assert slide.overrideBgId is None
