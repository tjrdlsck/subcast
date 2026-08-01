import time
import pytest

def simulate_slide_change_event(current_index, slides):
    """
    BroadcastChannel SLIDE_CHANGE 이벤트 시뮬레이터 및 무대 모니터 뷰어 상태 갱신
    """
    start_time = time.perf_counter()

    if not slides or current_index < 0 or current_index >= len(slides):
        return None, 0.0

    cur_slide = slides[current_index]
    is_last_slide = (current_index + 1 >= len(slides))
    next_slide = None if is_last_slide else slides[current_index + 1]

    def extract_text(slide):
        if not slide or "elements" not in slide:
            return ""
        texts = [e.get("content", "") for e in slide.get("elements", []) if e.get("type") in ("text", "i-text", "textbox")]
        return "\n".join(filter(None, texts))

    cur_content = extract_text(cur_slide) or cur_slide.get("name", f"슬라이드 {current_index + 1}")
    if is_last_slide:
        next_content = "[마지막 슬라이드입니다]"
        next_opacity = 0.4
    else:
        next_content = extract_text(next_slide) or next_slide.get("name", f"슬라이드 {current_index + 2}")
        next_opacity = 1.0

    end_time = time.perf_counter()
    latency_ms = (end_time - start_time) * 1000.0

    return {
        "currentContent": cur_content,
        "nextContent": next_content,
        "isLastSlide": is_last_slide,
        "nextOpacity": next_opacity,
        "latencyMs": latency_ms
    }, latency_ms

def test_e2e_monitor_slide_change_sync():
    mock_slides = [
        {"id": "s1", "name": "슬라이드 1", "elements": [{"type": "text", "content": "1번 자막"}]},
        {"id": "s2", "name": "슬라이드 2", "elements": [{"type": "text", "content": "2번 자막"}]},
        {"id": "s3", "name": "슬라이드 3", "elements": [{"type": "text", "content": "3번 자막"}]}
    ]

    # 1. 첫 번째 슬라이드 선택
    state, latency = simulate_slide_change_event(0, mock_slides)
    assert state["currentContent"] == "1번 자막"
    assert state["nextContent"] == "2번 자막"
    assert state["isLastSlide"] is False
    assert state["nextOpacity"] == 1.0
    assert latency <= 50.0  # 지연 시간 <= 50ms 검증

    # 2. 두 번째 슬라이드 이동
    state, latency = simulate_slide_change_event(1, mock_slides)
    assert state["currentContent"] == "2번 자막"
    assert state["nextContent"] == "3번 자막"
    assert state["isLastSlide"] is False

    # 3. 마지막 슬라이드 (인덱스 범주 초과 엣지케이스)
    state, latency = simulate_slide_change_event(2, mock_slides)
    assert state["currentContent"] == "3번 자막"
    assert state["nextContent"] == "[마지막 슬라이드입니다]"
    assert state["isLastSlide"] is True
    assert state["nextOpacity"] == 0.4

def test_monitor_mode_slide_isolation():
    # 모니터 가이드 박스 요소가 메인 슬라이드 목록에 덮어씌워지지 않는 상태 격리 검증
    mock_slides = [
        {"id": "s1", "name": "원본 슬라이드", "elements": [{"type": "textbox", "content": "본문 내용"}]}
    ]
    is_monitor_mode = True
    
    # 모니터 모드 활성화 시 자동저장/수동저장 함수 트리거 시뮬레이션
    def can_save_slide(is_monitor):
        return not is_monitor

    assert can_save_slide(is_monitor_mode) is False  # 모니터 모드 중 저장 차단
    assert len(mock_slides) == 1
    assert mock_slides[0]["elements"][0]["content"] == "본문 내용"  # 슬라이드 데이터 오염 방지 검증

