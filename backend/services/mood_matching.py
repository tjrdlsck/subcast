import random
from typing import List, Dict, Any, Optional, Union

def normalize_tag(val: Any) -> str:
    if not val:
        return ""
    s = str(val).strip()
    if s.startswith("#"):
        s = s[1:].strip()
    return s.lower()

def extract_normalized_tags(val: Any) -> List[str]:
    if not val:
        return []
    if isinstance(val, str):
        tags = [val]
    elif isinstance(val, (list, tuple, set)):
        tags = list(val)
    else:
        tags = [str(val)]
    
    result = []
    for t in tags:
        norm = normalize_tag(t)
        if norm and norm not in result:
            result.append(norm)
    return result

def select_stage_background(
    slide_moods: Optional[Union[List[str], str]] = None,
    override_bg_id: Optional[str] = None,
    bg_library: Optional[List[Dict[str, Any]]] = None,
    history_queue: Optional[List[str]] = None,
    max_history_size: int = 3
) -> Dict[str, Any]:
    """
    곡의 분위기 태그 및 오버라이드 배경 정보를 바탕으로 최적의 배경을 선택하는 매칭 엔진.
    - 정규화된 태그 일치 필터링 (Normalized Tag Matching)
    - 직전 사용 배경 중복 방지 이력 큐 (Anti-Repetition History Queue)
    - 태그 후보 존재 시 반드시 해당 태그 배경만 선택 보장
    """
    if history_queue is None:
        history_queue = []
    
    if not bg_library:
        return {"type": "ambient"}
    
    # 1. 수동 고정 배경 (Manual Override)
    if override_bg_id:
        target = next((bg for bg in bg_library if bg.get("id") == override_bg_id or bg.get("name") == override_bg_id), None)
        if target:
            return {"type": "video", "videoUrl": target.get("url") or target.get("file_path"), "id": target.get("id") or target.get("name"), "item": target}
    
    target_tags = extract_normalized_tags(slide_moods)
    
    # Helper: 동적 이력 큐 필터링 후 선택 (직전 배경 연속 재생 방지)
    def pick_from_candidates(candidates: List[Dict[str, Any]]):
        if not candidates:
            return None
        
        M = len(candidates)
        N_eff = max(0, min(max_history_size, M - 1))
        
        recent_history = set(history_queue[-N_eff:]) if N_eff > 0 else set()
        
        # 최근 history에 없는 후보 우선 필터링 (직전 재생 영상 중복 차단)
        filtered = [bg for bg in candidates if (bg.get("id") or bg.get("name")) not in recent_history]
        if not filtered:
            filtered = candidates
        
        chosen = random.choice(filtered)
        
        bg_id = chosen.get("id") or chosen.get("name")
        if bg_id:
            history_queue.append(bg_id)
            if len(history_queue) > max_history_size * 2:
                history_queue.pop(0)
                
        return {"type": "video", "videoUrl": chosen.get("url") or chosen.get("file_path"), "id": bg_id, "item": chosen}

    # 1차: 태그 일치 검색 (정규화 비교)
    if target_tags:
        tag_candidates = []
        for bg in bg_library:
            raw_bg_moods = []
            if bg.get("mood"):
                raw_bg_moods.append(bg.get("mood"))
            if bg.get("tag"):
                raw_bg_moods.append(bg.get("tag"))
            moods_attr = bg.get("moods")
            if isinstance(moods_attr, list):
                raw_bg_moods.extend(moods_attr)
            elif isinstance(moods_attr, str):
                raw_bg_moods.append(moods_attr)
            
            bg_tags = extract_normalized_tags(raw_bg_moods)
            
            # target_tags와 bg_tags의 교집합 존재 여부 체크
            if any(t in bg_tags for t in target_tags):
                tag_candidates.append(bg)
        
        if tag_candidates:
            res = pick_from_candidates(tag_candidates)
            if res:
                return res
            
    # 2차: Default 배경 (isDefault 또는 mood가 '기본/일반'인 경우)
    default_candidates = [
        bg for bg in bg_library 
        if bg.get("isDefault") or bg.get("is_default") or normalize_tag(bg.get("mood")) == "기본/일반" or "기본/일반" in extract_normalized_tags(bg.get("moods"))
    ]
    res = pick_from_candidates(default_candidates)
    if res:
        return res
        
    # 3차: 전체 라이브러리 배경 중 무작위
    all_candidates = [bg for bg in bg_library if bg.get("url") or bg.get("file_path")]
    res = pick_from_candidates(all_candidates)
    if res:
        return res
        
    # 4차: Ambient Canvas Fallback
    return {"type": "ambient"}


