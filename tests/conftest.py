import os
import shutil
import sqlite3
import tempfile
from pathlib import Path

import pytest

# Backend modules read these values during import, before per-test fixtures run.
# Point them at a unique temporary data root before importing the backend below.
_DATA_ENV_KEYS = (
    "SUBCAST_DATA_DIR",
    "SUBCAST_USER_DB_PATH",
    "SUBCAST_DB_PATH",
    "SUBCAST_BIBLE_DB_PATH",
    "APPDATA",
)
_ORIGINAL_DATA_ENV = {key: os.environ.get(key) for key in _DATA_ENV_KEYS}
_TEST_APP_DATA_DIR = Path(tempfile.mkdtemp(prefix="subcast-pytest-")).resolve()
_TEST_APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
os.environ["SUBCAST_DATA_DIR"] = str(_TEST_APP_DATA_DIR)
os.environ["APPDATA"] = str(_TEST_APP_DATA_DIR / "profile")
# Let the backend derive the user DB from the isolated data root. Keeping these
# optional overrides unset preserves tests that exercise their resolution logic.
os.environ.pop("SUBCAST_USER_DB_PATH", None)
os.environ.pop("SUBCAST_DB_PATH", None)
os.environ["SUBCAST_BIBLE_DB_PATH"] = str(_TEST_APP_DATA_DIR / "bible.db")

# Use a disposable copy so Bible behavior tests retain the real test corpus while
# any accidental write stays out of the repository database.
_SOURCE_BIBLE_DB = Path.cwd() / "bible.db"
_TEST_BIBLE_DB = Path(os.environ["SUBCAST_BIBLE_DB_PATH"])
if _SOURCE_BIBLE_DB.is_file():
    shutil.copy2(_SOURCE_BIBLE_DB, _TEST_BIBLE_DB)
else:
    with sqlite3.connect(_TEST_BIBLE_DB) as _bible_connection:
        _bible_connection.execute(
            "CREATE TABLE bible (id INTEGER PRIMARY KEY, version_code TEXT, book_code TEXT, "
            "book_name TEXT, chapter INTEGER, verse INTEGER, content TEXT, title TEXT)"
        )


def pytest_sessionfinish(session, exitstatus):
    for key, value in _ORIGINAL_DATA_ENV.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value
import backend.storage as storage
import backend.database as database
import backend.monitor_repository as monitor_repository
from backend.services.praise_service import praise_db
from backend.services import tag_service

@pytest.fixture(autouse=True)
def isolate_test_data_dir(tmp_path, monkeypatch):
    """모든 pytest 실행 시 실제 data/ 디렉토리를 보호하고 임시 tmp_path 디렉토리로 완전 격리합니다."""
    # Some collected modules change process environment while importing.
    monkeypatch.setenv("SUBCAST_DATA_DIR", str(_TEST_APP_DATA_DIR))
    monkeypatch.setenv("SUBCAST_BIBLE_DB_PATH", str(_TEST_BIBLE_DB))
    monkeypatch.setenv("APPDATA", str(_TEST_APP_DATA_DIR / "profile"))
    monkeypatch.delenv("SUBCAST_USER_DB_PATH", raising=False)
    monkeypatch.delenv("SUBCAST_DB_PATH", raising=False)
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
