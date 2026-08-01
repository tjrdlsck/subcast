import pytest
from backend.services.mood_matching import select_stage_background

def test_praise_bg_deduplication_basic():
    """동일 태그곡 추가 시 이미 사용 중인 exclude_bg_ids에 해당하는 배경은 피하고 다른 배경이 선택되는지 검증"""
    bg_library = [
        {"id": "bg_praise_1", "name": "찬양 배경 1", "url": "/bg1.mp4", "mood": "경배/찬양"},
        {"id": "bg_praise_2", "name": "찬양 배경 2", "url": "/bg2.mp4", "mood": "경배/찬양"},
        {"id": "bg_praise_3", "name": "찬양 배경 3", "url": "/bg3.mp4", "mood": "경배/찬양"},
    ]
    
    # 1회차: history_queue에 아무것도 없는 경우
    history = []
    res1 = select_stage_background(
        slide_moods="경배/찬양",
        override_bg_id=None,
        bg_library=bg_library,
        history_queue=history
    )
    first_bg_id = res1["id"]
    assert first_bg_id in ["bg_praise_1", "bg_praise_2", "bg_praise_3"]

    # 2회차: first_bg_id가 history에 등록된 상태에서 두번째 선택
    res2 = select_stage_background(
        slide_moods="경배/찬양",
        override_bg_id=None,
        bg_library=bg_library,
        history_queue=history
    )
    second_bg_id = res2["id"]
    assert second_bg_id != first_bg_id, "이미 사용된 배경은 중복 지정되지 않아야 함"

    # 3회차: 1, 2회차 배경 제외 후 세번째 선택
    res3 = select_stage_background(
        slide_moods="경배/찬양",
        override_bg_id=None,
        bg_library=bg_library,
        history_queue=history
    )
    third_bg_id = res3["id"]
    assert third_bg_id not in [first_bg_id, second_bg_id]

def test_praise_bg_fallback_on_exhaustion():
    """후보 배경 영상 수보다 찬양곡 수가 많아 후보군이 고갈된 경우 4차 폴백 검증"""
    bg_library = [
        {"id": "bg_1", "name": "배경 1", "url": "/bg1.mp4", "mood": "경배/찬양"},
        {"id": "bg_2", "name": "배경 2", "url": "/bg2.mp4", "mood": "경배/찬양"},
    ]
    history = []

    res1 = select_stage_background("경배/찬양", None, bg_library, history_queue=history, max_history_size=3)
    res2 = select_stage_background("경배/찬양", None, bg_library, history_queue=history, max_history_size=3)
    # 3회차 (후보 2개 모두 history에 들어갔을 때 폴백 동작)
    res3 = select_stage_background("경배/찬양", None, bg_library, history_queue=history, max_history_size=3)

    assert res3["id"] in ["bg_1", "bg_2"]
    # 바로 직전 선택된 res2와 겹치지 않아야 함
    assert res3["id"] != res2["id"]
