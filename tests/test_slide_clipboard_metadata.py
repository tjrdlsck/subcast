import pytest
from backend.schemas import Slide, Element, ElementStyle


def test_slide_schema_metadata_persistence():
    """Slide 스키마가 overrideBgId, moods 등 메타데이터를 정상 수용 및 보존하는지 검증"""
    slide_data = {
        "id": "slide_praise_abc123",
        "name": "찬양: 은혜 (1/4) (사본)",
        "thumbnail": "data:image/png;base64,sample",
        "overrideBgId": "bg_serene_sky_01.mp4",
        "moods": ["경배/찬양"],
        "elements": [
            {
                "id": "elem_praise_c_01",
                "type": "text",
                "content": "내가 누려왔던 모든 것들이",
                "x": 7.2,
                "y": 38.0,
                "width": 85.6,
                "height": 20.0,
                "style": {
                    "fontColor": "#ffffff",
                    "fontSize": "3.2vw",
                    "fontFamily": "Inter"
                }
            }
        ]
    }

    slide = Slide(**slide_data)
    assert slide.id == "slide_praise_abc123"
    assert slide.overrideBgId == "bg_serene_sky_01.mp4"
    assert slide.moods == ["경배/찬양"]
    assert len(slide.elements) == 1
    assert slide.elements[0].content == "내가 누려왔던 모든 것들이"

    # 직렬화 후 복원 검증
    dumped = slide.model_dump()
    assert dumped["overrideBgId"] == "bg_serene_sky_01.mp4"
    assert dumped["moods"] == ["경배/찬양"]


def test_multi_slide_clipboard_deep_clone_simulation():
    """다중 슬라이드 복사/붙여넣기 시 N개 슬라이드의 모든 속성이 온전히 복제되는지 시뮬레이션 검증"""
    original_slides = [
        {
            "id": "slide_01",
            "name": "찬양: 은혜 (1/2)",
            "thumbnail": "thumb1",
            "overrideBgId": "bg_01.mp4",
            "mood": "경배/찬양",
            "moods": ["경배/찬양"],
            "praiseGroupId": "grp_praise_1",
            "songTitle": "은혜",
            "elements": [{"id": "e1", "type": "text", "content": "가사 1", "x": 0, "y": 0, "width": 100, "height": 20}]
        },
        {
            "id": "slide_02",
            "name": "찬양: 은혜 (2/2)",
            "thumbnail": "thumb2",
            "overrideBgId": "bg_01.mp4",
            "mood": "경배/찬양",
            "moods": ["경배/찬양"],
            "praiseGroupId": "grp_praise_1",
            "songTitle": "은혜",
            "elements": [{"id": "e2", "type": "text", "content": "가사 2", "x": 0, "y": 0, "width": 100, "height": 20}]
        }
    ]

    # 복사 단계 (serializeSlideForClipboard 시뮬레이션)
    cloned_payloads = []
    for s in original_slides:
        import copy
        cloned = copy.deepcopy(s)
        cloned["name"] = s["name"] + " (사본)"
        del cloned["id"]
        cloned_payloads.append(cloned)

    # 붙여넣기 단계 (pasteSlidesFromClipboardText 시뮬레이션)
    new_created_slides = []
    for idx, data in enumerate(cloned_payloads):
        import copy
        new_slide = copy.deepcopy(data)
        new_slide["id"] = f"slide_new_{idx}"
        new_created_slides.append(new_slide)

    assert len(new_created_slides) == 2
    for i in range(2):
        assert new_created_slides[i]["id"] == f"slide_new_{i}"
        assert "(사본)" in new_created_slides[i]["name"]
        assert new_created_slides[i]["overrideBgId"] == "bg_01.mp4"
        assert new_created_slides[i]["praiseGroupId"] == "grp_praise_1"
        assert new_created_slides[i]["songTitle"] == "은혜"
        assert len(new_created_slides[i]["elements"]) == 1
