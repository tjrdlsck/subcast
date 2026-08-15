# -*- coding: utf-8 -*-
"""
Unit test suite for Praise Broadcast Layout customizer in Subcast.
"""
import copy
import pytest


DEFAULT_PRAISE_BROADCAST_LAYOUT = {
    "x": 7.2,
    "y": 76.0,
    "width": 85.6,
    "height": 18.0,
    "fontSize": "3.5vw",
    "fontFamily": "Inter",
    "fontWeight": "700",
    "textAlign": "center",
    "fontColor": "#ffffff",
    "strokeColor": "#000000",
    "strokeWidth": 3,
    "hasBgBar": False,
    "bgBarColor": "rgba(0,0,0,0.65)",
    "bgBarY": 72.0,
    "bgBarHeight": 22.0
}


def render_slide_elements_for_channel(current_slide: dict, channel: str, settings: dict) -> list:
    """
    Python implementation of viewer.js:renderCurrentSlide logic for automated unit testing.
    """
    is_stage = channel == "stage"
    is_monitor = channel in ("monitor", "preview", "monitor_preview")
    is_broadcast = not is_stage and not is_monitor

    is_praise = bool(
        current_slide.get("slideType") == "praise" or
        current_slide.get("isPraise") or
        str(current_slide.get("id", "")).startswith("slide_praise_") or
        str(current_slide.get("name", "")).startswith(("찬양:", "자막(템):"))
    )

    rendered_elements = []

    if is_broadcast and is_praise:
        custom_layout = settings.get("praiseBroadcastLayout", {})
        layout = copy.deepcopy(DEFAULT_PRAISE_BROADCAST_LAYOUT)
        layout.update(custom_layout)

        if layout.get("hasBgBar"):
            rendered_elements.append({
                "id": "elem_praise_broadcast_bar",
                "type": "rect",
                "x": 0,
                "y": layout.get("bgBarY", 72.0),
                "width": 100,
                "height": layout.get("bgBarHeight", 22.0),
                "style": {
                    "fillColor": layout.get("bgBarColor", "rgba(0,0,0,0.65)"),
                    "strokeColor": "transparent",
                    "strokeWidth": 0,
                    "opacity": 1.0
                }
            })

        text_elem = next((e for e in current_slide.get("elements", []) if e.get("type") == "text" and ("_c_" in e.get("id", "") or e.get("content"))), None)
        if not text_elem:
            text_elem = next((e for e in current_slide.get("elements", []) if e.get("type") == "text"), None)
        
        lyric_content = text_elem.get("content", "") if text_elem else ""

        rendered_elements.append({
            "id": "elem_praise_broadcast_lyric",
            "type": "text",
            "content": lyric_content,
            "x": layout.get("x", 7.2),
            "y": layout.get("y", 76.0),
            "width": layout.get("width", 85.6),
            "height": layout.get("height", 18.0),
            "style": {
                "fontSize": layout.get("fontSize", "3.5vw"),
                "fontFamily": layout.get("fontFamily", "Inter"),
                "fontWeight": layout.get("fontWeight", "700"),
                "textAlign": layout.get("textAlign", "center"),
                "fontColor": layout.get("fontColor", "#ffffff"),
                "strokeColor": layout.get("strokeColor", "#000000"),
                "strokeWidth": layout.get("strokeWidth", 3),
                "opacity": 1.0
            }
        })
    else:
        # 일반 슬라이드, 성경 슬라이드 및 현장 화면(Stage): 슬라이드 원본 1:1 그대로
        rendered_elements = copy.deepcopy(current_slide.get("elements", []))

    return rendered_elements


def test_praise_slide_in_broadcast_uses_custom_layout():
    """찬양 슬라이드의 방송 화면 송출 시 사용자가 지정한 praiseBroadcastLayout이 정확히 적용되는지 검증"""
    praise_slide = {
        "id": "slide_praise_123",
        "name": "찬양: 은혜",
        "isPraise": True,
        "elements": [
            {
                "id": "elem_praise_bg_full",
                "type": "rect",
                "x": 0.0,
                "y": 0.0,
                "width": 100.0,
                "height": 100.0
            },
            {
                "id": "elem_praise_c_1",
                "type": "text",
                "content": "내가 누려왔던 모든 것들이",
                "x": 7.2,
                "y": 38.0,
                "width": 85.6,
                "height": 20.0
            }
        ]
    }

    custom_settings = {
        "praiseBroadcastLayout": {
            "x": 12.0,
            "y": 82.0,
            "width": 76.0,
            "fontSize": "3.2vw",
            "hasBgBar": True,
            "bgBarColor": "rgba(15, 23, 42, 0.85)"
        }
    }

    # 방송 화면 (channel=obs)
    res = render_slide_elements_for_channel(praise_slide, "obs", custom_settings)

    # 1. 2개 요소 (자막 바 + 커스텀 가사)
    assert len(res) == 2
    bar_elem = res[0]
    lyric_elem = res[1]

    assert bar_elem["id"] == "elem_praise_broadcast_bar"
    assert bar_elem["style"]["fillColor"] == "rgba(15, 23, 42, 0.85)"

    assert lyric_elem["id"] == "elem_praise_broadcast_lyric"
    assert lyric_elem["content"] == "내가 누려왔던 모든 것들이"
    assert lyric_elem["x"] == 12.0
    assert lyric_elem["y"] == 82.0
    assert lyric_elem["width"] == 76.0
    assert lyric_elem["style"]["fontSize"] == "3.2vw"


def test_praise_slide_in_stage_preserves_original_center_and_bg():
    """찬양 슬라이드의 현장 화면(channel=stage) 송출 시에는 원본 중앙 정렬과 배경 요소가 1:1 보존되어야 함"""
    praise_slide = {
        "id": "slide_praise_123",
        "name": "찬양: 은혜",
        "isPraise": True,
        "elements": [
            {
                "id": "elem_praise_bg_full",
                "type": "rect",
                "x": 0.0,
                "y": 0.0,
                "width": 100.0,
                "height": 100.0
            },
            {
                "id": "elem_praise_c_1",
                "type": "text",
                "content": "내가 누려왔던 모든 것들이",
                "x": 7.2,
                "y": 38.0,
                "width": 85.6,
                "height": 20.0
            }
        ]
    }

    custom_settings = {
        "praiseBroadcastLayout": {
            "x": 12.0,
            "y": 82.0,
            "width": 76.0
        }
    }

    # 현장 화면 (channel=stage)
    res = render_slide_elements_for_channel(praise_slide, "stage", custom_settings)

    assert len(res) == 2
    assert res[0]["id"] == "elem_praise_bg_full"
    assert res[1]["y"] == 38.0  # 정중앙 그대로 보존


def test_non_praise_slide_broadcast_preserves_exact_original():
    """성경 본문이나 일반 슬라이드는 방송 화면에서도 praiseBroadcastLayout의 영향을 받지 않고 100% 원본 그대로 송출되어야 함"""
    bible_slide = {
        "id": "slide_bible_456",
        "name": "성경: 창세기 1:1",
        "isPraise": False,
        "elements": [
            {
                "id": "elem_bible_h_1",
                "type": "text",
                "content": "창세기 1:1",
                "x": 7.2,
                "y": 14.8
            },
            {
                "id": "elem_bible_c_1",
                "type": "text",
                "content": "태초에 하나님이 천지를 창조하시니라",
                "x": 7.2,
                "y": 22.5
            }
        ]
    }

    custom_settings = {
        "praiseBroadcastLayout": {
            "x": 12.0,
            "y": 82.0,
            "width": 76.0
        }
    }

    res_obs = render_slide_elements_for_channel(bible_slide, "obs", custom_settings)
    assert len(res_obs) == 2
    assert res_obs[0]["content"] == "창세기 1:1"
    assert res_obs[0]["y"] == 14.8
    assert res_obs[1]["content"] == "태초에 하나님이 천지를 창조하시니라"
    assert res_obs[1]["y"] == 22.5


def test_general_text_slide_broadcast_preserves_exact_original():
    """일반 공지/설교 텍스트 슬라이드는 방송 화면에서도 원본 슬라이드 디자인 그대로 1:1 송출되어야 함"""
    notice_slide = {
        "id": "slide_general_789",
        "name": "새 슬라이드 2 (교회 소식)",
        "isPraise": False,
        "elements": [
            {
                "id": "elem_general_t1",
                "type": "text",
                "content": "2026 여름 수련회 안내",
                "x": 20.0,
                "y": 30.0,
                "width": 60.0,
                "height": 40.0
            }
        ]
    }

    custom_settings = {
        "praiseBroadcastLayout": {
            "x": 12.0,
            "y": 82.0,
            "width": 76.0
        }
    }

    res_obs = render_slide_elements_for_channel(notice_slide, "obs", custom_settings)
    assert len(res_obs) == 1
    assert res_obs[0]["id"] == "elem_general_t1"
    assert res_obs[0]["y"] == 30.0  # 원본 위치 그대로 보존
    assert res_obs[0]["x"] == 20.0
