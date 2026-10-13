from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend.routers import backgrounds as backgrounds_router
from backend.services.connection_manager import manager
from backend.schemas import ProjectData


def _project(project_id: str, *, active: bool = False) -> ProjectData:
    return ProjectData.model_validate({
        "id": project_id,
        "name": project_id,
        "settings": {
            "stageBackground": {"type": "video", "videoUrl": "https://old-pc/static/backgrounds/old%20video.mp4?cache=1"} if active else None,
            "stageBgLibrary": [{
                "name": "old video.mp4",
                "url": "/static/backgrounds/old%20video.mp4",
            }],
        },
        "slides": [{"id": "slide-1", "name": "슬라이드", "overrideBgId": "old video.mp4", "elements": []}],
    })


def _configure_rename(tmp_path, monkeypatch, *, fail_project_id: str | None = None):
    background_dir = tmp_path / "backgrounds"
    background_dir.mkdir()
    (background_dir / "old video.mp4").write_bytes(b"video")
    (background_dir / "thumb_old video.jpg").write_bytes(b"thumbnail")
    monkeypatch.setattr(backgrounds_router, "backgrounds_dir", background_dir)
    metadata = {"old video.mp4": {
        "title": "Old title", "thumbnailUrl": "/static/backgrounds/thumb_old video.jpg",
    }}
    monkeypatch.setattr(backgrounds_router, "load_bg_meta", lambda: deepcopy(metadata))

    def save_metadata(value):
        metadata.clear()
        metadata.update(deepcopy(value))
        return True

    monkeypatch.setattr(backgrounds_router, "save_bg_meta", save_metadata)
    projects = {"active": _project("active", active=True), "inactive": _project("inactive")}
    saved = {}
    failed_once = False

    async def load_project(project_id):
        return deepcopy(projects[project_id])

    async def save_project(project, project_id=None):
        nonlocal failed_once
        if project.id == fail_project_id and not failed_once:
            failed_once = True
            raise OSError("simulated project save failure")
        saved[project.id] = deepcopy(project)

    monkeypatch.setattr(backgrounds_router, "list_projects", lambda: _items(projects))
    monkeypatch.setattr(backgrounds_router, "load_project_data", load_project)
    monkeypatch.setattr(backgrounds_router, "save_project_data", save_project)
    events = []

    async def broadcast(event):
        events.append(event)

    monkeypatch.setattr(manager, "project_data", deepcopy(projects["active"]))
    monkeypatch.setattr(manager, "broadcast", broadcast)
    return background_dir, metadata, saved, events


async def _items(projects):
    return [SimpleNamespace(id=project_id) for project_id in projects]


@pytest.mark.anyio
async def test_rename_updates_all_project_video_references_and_active_clients(tmp_path, monkeypatch):
    background_dir, metadata, saved, events = _configure_rename(tmp_path, monkeypatch)

    result = await backgrounds_router.rename_background_file(
        backgrounds_router.RenameBackgroundRequest(old_name="old video.mp4", new_name="new video.mp4")
    )

    assert result["new_name"] == "new video.mp4"
    assert not (background_dir / "old video.mp4").exists()
    assert (background_dir / "new video.mp4").read_bytes() == b"video"
    assert (background_dir / "thumb_new video.jpg").read_bytes() == b"thumbnail"
    assert metadata["new video.mp4"]["thumbnailUrl"] == "/static/backgrounds/thumb_new video.jpg"
    assert set(saved) == {"active", "inactive"}
    for project in saved.values():
        assert project.slides[0].overrideBgId == "new video.mp4"
        assert project.settings.stageBgLibrary[0]["name"] == "new video.mp4"
        assert project.settings.stageBgLibrary[0]["url"] == "/static/backgrounds/new%20video.mp4"
    assert saved["active"].settings.stageBackground["videoUrl"] == "/static/backgrounds/new%20video.mp4"
    assert manager.project_data.slides[0].overrideBgId == "new video.mp4"
    assert events[0]["type"] == "INITIAL_SYNC"


@pytest.mark.anyio
async def test_failed_project_save_rolls_back_video_metadata_and_prior_project_changes(tmp_path, monkeypatch):
    background_dir, metadata, saved, _events = _configure_rename(tmp_path, monkeypatch, fail_project_id="inactive")

    with pytest.raises(HTTPException) as error:
        await backgrounds_router.rename_background_file(
            backgrounds_router.RenameBackgroundRequest(old_name="old video.mp4", new_name="new video.mp4")
        )

    assert error.value.status_code == 500
    assert (background_dir / "old video.mp4").read_bytes() == b"video"
    assert not (background_dir / "new video.mp4").exists()
    assert (background_dir / "thumb_old video.jpg").read_bytes() == b"thumbnail"
    assert metadata["old video.mp4"]["thumbnailUrl"] == "/static/backgrounds/thumb_old video.jpg"
    assert saved["active"].slides[0].overrideBgId == "old video.mp4"
    assert manager.project_data.slides[0].overrideBgId == "old video.mp4"
    assert _events == []
