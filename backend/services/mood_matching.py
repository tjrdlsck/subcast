import random
from typing import List, Dict, Any, Optional

def select_stage_background(
    slide_moods: Optional[List[str]],
    override_bg_id: Optional[str],
    bg_library: Optional[List[Dict[str, Any]]],
    history_queue: Optional[List[str]] = None,
    max_history_size: int = 3
) -> Dict[str, Any]:
    """
    곡의 분위기 태그 및 오버라이드 배경 정보를 바탕으로 최적의 배경을 선택하는 매칭 엔진.
    - 가중 무작위 매칭 (Weighted Random Selection)
    - 교착 상태 방지 동적 이력 큐 (Dynamic History Queue)
    - 4단계 다단계 폴백 (Multi-tier Fallback Cascade)
    """
    if history_queue is None:
        history_queue = []
    
    if not bg_library:
        return {"type": "ambient"}
    
    # 1. 수동 고정 배경 (Manual Override)
    if override_bg_id:
        target = next((bg for bg in bg_library if bg.get("id") == override_bg_id or bg.get("name") == override_bg_id), None)
        if target:
            return {"type": "video", "videoUrl": target.get("url") or target.get("file_path"), "id": target.get("id"), "item": target}
    
    slide_moods_set = set(slide_moods) if slide_moods else set()
    
    # Helper: 동적 이력 큐 필터링 후 선택
    def pick_from_candidates(candidates_with_weights: List[tuple]):
        if not candidates_with_weights:
            return None
        
        M = len(candidates_with_weights)
        N_eff = max(0, min(max_history_size, M - 1))
        
        recent_history = set(history_queue[-N_eff:]) if N_eff > 0 else set()
        
        # history에 없는 후보 우선 필터링
        filtered = [item for item in candidates_with_weights if item[0].get("id") not in recent_history]
        if not filtered:
            filtered = candidates_with_weights
        
        items = [f[0] for f in filtered]
        weights = [f[1] for f in filtered]
        
        chosen = random.choices(items, weights=weights, k=1)[0]
        
        bg_id = chosen.get("id")
        if bg_id:
            history_queue.append(bg_id)
            if len(history_queue) > max_history_size * 2:
                history_queue.pop(0)
                
        return {"type": "video", "videoUrl": chosen.get("url") or chosen.get("file_path"), "id": chosen.get("id"), "item": chosen}

    # 1차: 태그 매칭 (Weighted Matching)
    if slide_moods_set:
        weighted_candidates = []
        for bg in bg_library:
            bg_moods = set(bg.get("moods") or [])
            overlap = len(slide_moods_set.intersection(bg_moods))
            if overlap > 0:
                weighted_candidates.append((bg, overlap))
        
        res = pick_from_candidates(weighted_candidates)
        if res:
            return res
            
    # 2차: Default 배경 (isDefault: True)
    default_candidates = [(bg, 1) for bg in bg_library if bg.get("isDefault") or bg.get("is_default")]
    res = pick_from_candidates(default_candidates)
    if res:
        return res
        
    # 3차: 전체 라이브러리 배경 중 무작위
    all_candidates = [(bg, 1) for bg in bg_library if bg.get("url") or bg.get("file_path")]
    res = pick_from_candidates(all_candidates)
    if res:
        return res
        
    # 4차: Ambient Canvas Fallback
    return {"type": "ambient"}
