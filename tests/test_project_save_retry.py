import asyncio
import os

from backend.schemas import ProjectData
from backend import storage


def test_project_save_retries_transient_file_access_error(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "PROJECTS_DIR", tmp_path)
    replace = os.replace
    attempts = 0

    def replace_when_reader_releases_file(source, destination):
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            raise PermissionError(5, "file is being read")
        replace(source, destination)

    monkeypatch.setattr(storage.os, "replace", replace_when_reader_releases_file)
    asyncio.run(storage.save_project_data(ProjectData(id="retry_project")))

    assert attempts == 3
    assert ProjectData.model_validate_json((tmp_path / "retry_project.json").read_text(encoding="utf-8")).id == "retry_project"
