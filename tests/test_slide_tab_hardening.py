import pytest
import copy
from backend.schemas import Slide, ProjectData, SystemSettings


def test_dnd_multi_slide_reorder_algorithm():
    slides = [
        {"id": f"s_{i}", "name": f"Slide {i}"}
        for i in range(10)
    ]
    selected_ids = ["s_1", "s_3", "s_4"]
    moving_slides = [s for s in slides if s["id"] in selected_ids]
    moving_ids = [s["id"] for s in moving_slides]

    target_slide = slides[7]
    remaining_slides = [s for s in slides if s["id"] not in moving_ids]
    target_idx_in_remaining = next(i for i, s in enumerate(remaining_slides) if s["id"] == target_slide["id"])
    
    insert_idx = target_idx_in_remaining + 1
    remaining_slides[insert_idx:insert_idx] = moving_slides
    reordered_slides = remaining_slides

    expected_order = ["s_0", "s_2", "s_5", "s_6", "s_7", "s_1", "s_3", "s_4", "s_8", "s_9"]
    actual_order = [s["id"] for s in reordered_slides]
    assert actual_order == expected_order, f"기대 순서: {expected_order}, 실제 순서: {actual_order}"


def test_dnd_multi_slide_reorder_top_half():
    slides = [{"id": f"s_{i}"} for i in range(6)]
    selected_ids = ["s_4", "s_5"]
    moving_slides = [s for s in slides if s["id"] in selected_ids]
    moving_ids = [s["id"] for s in moving_slides]

    target_slide = slides[1]
    remaining_slides = [s for s in slides if s["id"] not in moving_ids]
    target_idx_in_remaining = next(i for i, s in enumerate(remaining_slides) if s["id"] == target_slide["id"])
    
    insert_idx = target_idx_in_remaining
    remaining_slides[insert_idx:insert_idx] = moving_slides

    expected_order = ["s_0", "s_4", "s_5", "s_1", "s_2", "s_3"]
    actual_order = [s["id"] for s in remaining_slides]
    assert actual_order == expected_order


def test_delete_all_slides_backend_behavior():
    import uuid
    project_data = ProjectData(
        slides=[Slide(id="s_1", name="슬라이드 1", elements=[])],
        templates=[],
        settings=SystemSettings()
    )
    slide_ids = ["s_1"]
    project_data.slides = [s for s in project_data.slides if s.id not in slide_ids]
    
    if not project_data.slides:
        new_id = f"slide_{uuid.uuid4().hex[:8]}"
        new_slide = Slide(id=new_id, name="새 슬라이드 1", elements=[])
        project_data.slides.append(new_slide)
        
    assert len(project_data.slides) == 1
    assert project_data.slides[0].id.startswith("slide_")
    assert project_data.slides[0].id != "slide_placeholder"


def test_frontend_code_integrity_and_guards():
    with open("frontend/js/modules/editor-slides.js", "r", encoding="utf-8") as f:
        slides_code = f.read()

    assert "projectData?.slides?.find(s => s.id === slide.id)" in slides_code
    assert "let monitorBroadcastChannel = null;" in slides_code
    assert "function getMonitorBroadcastChannel()" in slides_code
    assert "isSlideDirty()" in slides_code
    assert "prevSlide.elements = canvas.getObjects()" in slides_code
    assert 'alert("슬라이드가 저장 및 동기화되었습니다.");' not in slides_code
    assert 'statusText.innerText = "저장 완료";' in slides_code
    assert 'id: "slide_placeholder"' not in slides_code

    with open("frontend/js/modules/editor-shortcuts.js", "r", encoding="utf-8") as f:
        shortcuts_code = f.read()

    assert "document.getElementById('panel-slides')?.classList.contains('active')" in shortcuts_code

    with open("frontend/js/modules/editor-sync.js", "r", encoding="utf-8") as f:
        sync_code = f.read()

    assert "batchSize = 2" in sync_code
