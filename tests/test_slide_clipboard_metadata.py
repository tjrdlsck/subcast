from backend.schemas import ProjectData


def test_praise_metadata_survives_project_save_and_reload():
    slides = [
        {
            "id": f"slide_{index}",
            "name": f"찬양: 은혜 ({index}/2)",
            "mood": "경배/찬양",
            "moods": ["경배/찬양"],
            "overrideBgId": "praise.mp4",
            "songTitle": "은혜",
            "praiseGroupId": "praise_grp_1",
            "slideType": "praise",
            "isPraise": True,
            "elements": [],
        }
        for index in (1, 2)
    ]
    project = ProjectData.model_validate({"id": "praise_project", "slides": slides})
    restored = ProjectData.model_validate_json(project.model_dump_json())

    assert len(restored.slides) == 2
    assert {slide.praiseGroupId for slide in restored.slides} == {"praise_grp_1"}
    assert {slide.songTitle for slide in restored.slides} == {"은혜"}
    assert {slide.overrideBgId for slide in restored.slides} == {"praise.mp4"}
    assert {slide.mood for slide in restored.slides} == {"경배/찬양"}
    assert {slide.slideType for slide in restored.slides} == {"praise"}
    assert all(slide.isPraise for slide in restored.slides)
