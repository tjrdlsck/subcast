import pytest
from pathlib import Path
import backend.storage as storage
import backend.database as database
import backend.monitor_repository as monitor_repository
from backend.services.praise_service import praise_db
from backend.services import tag_service

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
    monkeypatch.setattr(tag_service, "TAG_FILE", test_data_dir / "mood_tags.json")
    monkeypatch.setattr(tag_service, "PROJECTS_DIR", test_projects_dir)
    monkeypatch.setattr(tag_service, "load_bg_meta", lambda: {})
    monkeypatch.setattr(tag_service, "_TAG_CACHE", None)
    monkeypatch.setattr(tag_service, "_TAG_CACHE_MTIME_NS", None)

    test_user_db = str(test_data_dir / "subcast_user.db")
    monkeypatch.setattr(praise_db, "db_path", test_user_db)
    monkeypatch.setattr(database, "DEFAULT_DB_PATH", test_user_db)
    monkeypatch.setattr(monitor_repository, "DEFAULT_DB_PATH", test_user_db)
    praise_db.init_table()
    
    yield
