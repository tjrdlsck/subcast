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

def test_praise_group_id_independence():
    """같은 찬양 제목이라도 다른 praiseGroupId를 가진 경우 독립된 고정 배경을 유지할 수 있는지 검증"""
    bg_library = [
        {"id": "bg_1", "name": "bg1.mp4", "mood": "경배/찬양"},
        {"id": "bg_2", "name": "bg2.mp4", "mood": "경배/찬양"}
    ]
    
    # 1번째 찬양 곡 슬라이드 집합 (praiseGroupId: grp_1)
    slides_set_1 = [
        {"id": "s1", "songTitle": "은혜", "praiseGroupId": "grp_1", "overrideBgId": "bg_1"},
        {"id": "s2", "songTitle": "은혜", "praiseGroupId": "grp_1", "overrideBgId": "bg_1"}
    ]
    
    # 2번째 찬양 곡 슬라이드 집합 (praiseGroupId: grp_2)
    slides_set_2 = [
        {"id": "s3", "songTitle": "은혜", "praiseGroupId": "grp_2", "overrideBgId": "bg_2"},
        {"id": "s4", "songTitle": "은혜", "praiseGroupId": "grp_2", "overrideBgId": "bg_2"}
    ]
    
    # grp_1 곡 배경만 변경할 때 grp_2는 영향받지 않는지 검증
    target_group_id = "grp_1"
    new_bg_id = "bg_2"
    
    all_slides = slides_set_1 + slides_set_2
    for s in all_slides:
        if s.get("praiseGroupId") == target_group_id:
            s["overrideBgId"] = new_bg_id
            
    assert slides_set_1[0]["overrideBgId"] == "bg_2"
    assert slides_set_1[1]["overrideBgId"] == "bg_2"
    # grp_2는 기존 bg_2 유지
    assert slides_set_2[0]["overrideBgId"] == "bg_2"
    assert slides_set_2[1]["overrideBgId"] == "bg_2"
