import pytest
from pathlib import Path
import backend.storage as storage

@pytest.fixture(autouse=True)
def isolate_test_data_dir(tmp_path, monkeypatch):
    """모든 pytest 실행 시 실제 data/ 디렉토리를 보호하고 임시 tmp_path 디렉토리로 완전 격리합니다."""
    test_data_dir = tmp_path / "data"
    test_data_dir.mkdir(parents=True, exist_ok=True)
    test_projects_dir = test_data_dir / "projects"
    test_projects_dir.mkdir(parents=True, exist_ok=True)
    
    monkeypatch.setattr(storage, "DATA_DIR", test_data_dir)
    monkeypatch.setattr(storage, "PROJECTS_DIR", test_projects_dir)
    monkeypatch.setattr(storage, "ACTIVE_PROJECT_FILE", test_data_dir / "active_project_id.txt")
    monkeypatch.setattr(storage, "OLD_DATA_FILE_PATH", test_data_dir / "project_data.json")
    monkeypatch.setattr(storage, "TEMPLATES_FILE_PATH", test_data_dir / "templates.json")
    
    yield
