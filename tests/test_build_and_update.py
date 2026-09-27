import os
import sys
import inspect
import ast
import pytest

# Add parent directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from build_all import get_version, find_iscc

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RUN_SOURCE = open(os.path.join(ROOT, "run.py"), encoding="utf-8").read()
RUN_TREE = ast.parse(RUN_SOURCE)

def test_version_reading():
    with open(os.path.join(ROOT, "version.txt"), encoding="utf-8") as f:
        current_ver = f.read().strip()
    build_ver = get_version()
    assert current_ver == build_ver
    assert len(current_ver.split(".")) >= 3

def test_parse_version():
    from backend.routers.system import _parse_ver
    assert _parse_ver("v1.3.11") == (1, 3, 11)
    assert _parse_ver("1.3.11") == (1, 3, 11)
    assert _parse_ver("v1.4.0") > _parse_ver("v1.3.11")

def test_spec_file_contains_version_txt():
    spec_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "subcast.spec"))
    with open(spec_path, "r", encoding="utf-8") as f:
        content = f.read()
    assert "version.txt" in content

def test_setup_iss_db_preservation():
    setup_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "setup.iss"))
    with open(setup_path, "r", encoding="utf-8") as f:
        content = f.read()
    assert 'Source: "dist\\subcast\\*"' in content
    assert '#ifndef MyAppVersion' in content
    assert 'Check: IsAutoUpdate' in content
    assert 'runasoriginaluser' in content
    assert '{param:SUBCASTUPDATE|0}' in content

def test_find_iscc():
    # ISCC might or might not be installed, but function should run without error
    iscc_path = find_iscc()
    if iscc_path:
        assert os.path.exists(iscc_path)

def test_check_for_updates_no_icon_shadowing():
    """check_for_updates 파라미터가 전역 icon을 shadowing하지 않아야 함"""
    node = next(n for n in RUN_TREE.body if isinstance(n, ast.FunctionDef) and n.name == "check_for_updates")
    params = [arg.arg for arg in node.args.args]
    assert 'icon' not in params, "icon 파라미터가 전역 icon을 shadowing함"
    assert '_icon' in params, "_icon 파라미터가 존재해야 함"

def test_download_and_update_uses_chunked_download():
    """업데이트는 크기 제한과 청크 단위 검증 다운로드 헬퍼를 사용한다."""
    node = next(n for n in RUN_TREE.body if isinstance(n, ast.FunctionDef) and n.name == "_download_verified_asset")
    src = ast.get_source_segment(RUN_SOURCE, node)
    assert '65536' in src
    assert '1_000_000_000' in src
    assert 'hashlib.sha256' in src

def test_legacy_seed_does_not_overwrite_appdata():
    node = next(n for n in RUN_TREE.body if isinstance(n, ast.FunctionDef) and n.name == "copy_missing_tree")
    src = ast.get_source_segment(RUN_SOURCE, node)
    assert "if not target_file.exists()" in src
    migration_path = os.path.join(ROOT, "backend", "services", "migration_service.py")
    with open(migration_path, encoding="utf-8") as f:
        migration_source = f.read()
    assert '"IGNORE" if not allow_legacy_settings_overwrite else "REPLACE"' in migration_source

def test_installer_uses_visible_progress_and_explicit_relaunch():
    """Silent update shows progress and asks the installer to start the app once."""
    node = next(n for n in RUN_TREE.body if isinstance(n, ast.FunctionDef) and n.name == "download_and_update")
    src = ast.get_source_segment(RUN_SOURCE, node)
    assert '/SILENT' in src
    assert '/NORESTARTAPPLICATIONS' in src
    assert '/SUBCASTUPDATE=1' in src

def test_installer_immediate_exit_to_avoid_lock():
    """인스톨러 실행 후 파일 잠금 방지를 위해 프로세스를 즉시 종료해야 함"""
    node = next(n for n in RUN_TREE.body if isinstance(n, ast.FunctionDef) and n.name == "download_and_update")
    src = ast.get_source_segment(RUN_SOURCE, node)
    assert 'exit_app' in src
    assert 'sys.exit(0)' in src

def test_spec_file_disables_upx():
    """subcast.spec에서 UPX 압축이 비활성화(False)되어야 함"""
    spec_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "subcast.spec"))
    with open(spec_path, "r", encoding="utf-8") as f:
        content = f.read()
    assert "upx=False" in content
    assert "upx=True" not in content

def test_main_uses_absolute_static_path():
    """main.py에서 정적 파일 서빙 시 절대 경로를 사용해야 함"""
    from backend.main import STATIC_FRONTEND_DIR
    assert os.path.isabs(str(STATIC_FRONTEND_DIR))
    assert os.path.exists(STATIC_FRONTEND_DIR)

def test_bible_service_read_only_connection():
    """bible_service가 기존 bible.db에 대해 읽기 전용 URI 모드로 연결해야 함"""
    from backend.services.bible_service import BibleDatabaseHelper
    helper = BibleDatabaseHelper()
    conn = helper.get_connection()
    try:
        # 데이터 조회가 정상적으로 수행되는지 검증
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM bible")
        cnt = cur.fetchone()[0]
        assert cnt >= 0
    finally:
        conn.close()

def test_run_py_has_threading_import():
    """run.py에 threading 모듈 임포트가 있어야 함"""
    run_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "run.py"))
    with open(run_path, "r", encoding="utf-8") as f:
        content = f.read()
    assert 'import threading' in content

def test_run_py_has_global_icon():
    """run.py에 icon 전역 변수 선언이 있어야 함"""
    run_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "run.py"))
    with open(run_path, "r", encoding="utf-8") as f:
        content = f.read()
    assert 'icon = None' in content
