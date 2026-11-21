import os
from pathlib import Path

from backend.main import fonts_dir
from backend.services.background_service import backgrounds_dir, meta_file
from backend.services.environment_sync import user_database_path


def test_application_files_use_disposable_test_root(tmp_path):
    data_root = Path(os.environ['SUBCAST_DATA_DIR']).resolve()
    repository_root = Path(__file__).resolve().parents[1]

    assert data_root != repository_root
    assert backgrounds_dir.resolve() == data_root / 'frontend' / 'assets' / 'backgrounds'
    assert meta_file.resolve() == backgrounds_dir.resolve() / 'meta.json'
    assert fonts_dir.resolve() == data_root / 'frontend' / 'fonts'
    assert Path(os.environ['SUBCAST_BIBLE_DB_PATH']).resolve().parent == data_root
    assert Path(os.environ['APPDATA']).resolve().parent == data_root
    assert user_database_path(tmp_path) == tmp_path / 'subcast_user.db'
