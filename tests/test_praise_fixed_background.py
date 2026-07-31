import pytest
from backend.services.mood_matching import select_stage_background

def test_praise_song_fixed_background():
    """찬양 곡에 부여된 override_bg_id가 계속 유지되는지 검증"""
    bg_library = [
        {"id": "bg_praise_1", "name": "fast_praise.mp4", "mood": "경배/찬양", "moods": ["경배/찬양"]},
        {"id": "bg_praise_2", "name": "calm_praise.mp4", "mood": "잔잔/묵상", "moods": ["잔잔/묵상"]},
        {"id": "bg_default", "name": "default.mp4", "mood": "기본/일반", "isDefault": True}
    ]
    
    # 1. 분위기 매칭으로 곡용 고정 배경(override_bg_id) 결정
    initial_bg = select_stage_background(
        slide_moods=["경배/찬양"],
        bg_library=bg_library
    )
    assert initial_bg["type"] == "video"
    assert initial_bg["id"] == "bg_praise_1"
    
    assigned_bg_id = initial_bg["id"]
    
    # 2. 곡 내의 여러 슬라이드(1절, 2절, 후렴)를 이동할 때 override_bg_id로 고정 요청 시 매번 동일한 배경이 반환되는지 검증
    history_queue = []
    for _ in range(10):
        res = select_stage_background(
            slide_moods=["경배/찬양"],
            override_bg_id=assigned_bg_id,
            bg_library=bg_library,
            history_queue=history_queue
        )
        assert res["type"] == "video"
        assert res["id"] == assigned_bg_id

def test_praise_song_fallback_and_tag_matching():
    """태그 매칭 및 2차 기본 배경 fallback 처리 검증"""
    bg_library = [
        {"id": "bg_calm", "name": "calm.mp4", "mood": "잔잔/묵상", "moods": ["잔잔/묵상"]},
        {"id": "bg_def", "name": "default.mp4", "mood": "기본/일반", "isDefault": True}
    ]
    
    # 1. 매칭 태그가 있는 경우
    res_calm = select_stage_background(slide_moods=["잔잔/묵상"], bg_library=bg_library)
    assert res_calm["id"] == "bg_calm"
    
    # 2. 매칭 태그가 없는 태그일 경우 Default 배경 fallback
    res_unknown = select_stage_background(slide_moods=["특수태그"], bg_library=bg_library)
    assert res_unknown["id"] == "bg_def"
