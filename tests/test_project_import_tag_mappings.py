import io
import json

from fastapi.testclient import TestClient

from backend.main import app
from backend.routers import projects as projects_router
from backend.services.project_import_tags import apply_import_tag_mappings, extract_project_tags


def test_extract_project_tags_collects_slide_and_source_library_tags():
    tags = extract_project_tags({
        "slides": [
            {"mood": " Worship ", "moods": ["Quiet", "worship"], "stageBgMoodOverride": "#Prayer"},
        ],
        "settings": {"stageBgLibrary": [{"mood": "Quiet", "moods": ["Default"]}]},
    })

    assert {tag.casefold() for tag in tags} == {"worship", "quiet", "prayer"}


def test_import_mapping_rewrites_project_tags_and_discards_foreign_video_references():
    imported = apply_import_tag_mappings({
        "slides": [{
            "mood": "Source Praise",
            "moods": ["Source Praise", "Source Quiet"],
            "stageBgMoodOverride": "Source Quiet",
            "overrideBgId": "source-machine-video.mp4",
        }],
        "settings": {
            "stageBgLibrary": [{"name": "source-machine-video.mp4", "mood": "Source Praise"}],
            "stageBackground": {"type": "video", "videoUrl": "/static/backgrounds/source-machine-video.mp4"},
        },
    }, {"Source Praise": "Worship", "Source Quiet": "Prayer"})

    assert imported["slides"][0]["mood"] == "Worship"
    assert imported["slides"][0]["moods"] == ["Worship", "Prayer"]
    assert imported["slides"][0]["stageBgMoodOverride"] == "Prayer"
    assert imported["slides"][0]["overrideBgId"] is None
    assert imported["settings"]["stageBgLibrary"] is None
    assert imported["settings"]["stageBackground"] is None


def test_import_endpoint_applies_and_saves_user_selected_tag_mapping(monkeypatch):
    captured_projects = []
    saved_mappings = []

    async def fake_import_project(raw):
        captured_projects.append(raw)
        return raw

    monkeypatch.setattr(projects_router, "import_project_data", fake_import_project)
    monkeypatch.setattr(projects_router, "get_tags", lambda include_usage=False: [{"name": "Local Worship"}])
    monkeypatch.setattr(projects_router, "canonical_tag_name", lambda value: value)
    monkeypatch.setattr(projects_router, "load_import_tag_mappings", lambda: {"Earlier": "Local Worship"})
    monkeypatch.setattr(projects_router, "save_import_tag_mappings", lambda mappings: saved_mappings.append(mappings))

    payload = {"slides": [{"id": "s1", "name": "slide", "mood": "Remote Praise"}]}
    with TestClient(app) as client:
        response = client.post(
            "/api/projects/import",
            files={"file": ("project.json", io.BytesIO(json.dumps(payload).encode()), "application/json")},
            data={"tag_mapping": json.dumps({"Remote Praise": "Local Worship"})},
        )

    assert response.status_code == 200
    assert captured_projects[0]["slides"][0]["mood"] == "Local Worship"
    assert saved_mappings == [{"Earlier": "Local Worship", "Remote Praise": "Local Worship"}]
