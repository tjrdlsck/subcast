import os
import sys
import pytest

# Add parent directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from run import get_current_version, parse_version
from build_all import get_version, find_iscc

def test_version_reading():
    current_ver = get_current_version()
    build_ver = get_version()
    assert current_ver == build_ver
    assert len(current_ver.split(".")) >= 3

def test_parse_version():
    assert parse_version("v1.3.11") == [1, 3, 11]
    assert parse_version("1.3.11") == [1, 3, 11]
    assert parse_version("v1.4.0") > parse_version("v1.3.11")

def test_spec_file_contains_version_txt():
    spec_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "subcast.spec"))
    with open(spec_path, "r", encoding="utf-8") as f:
        content = f.read()
    assert "version.txt" in content

def test_setup_iss_db_preservation():
    setup_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "setup.iss"))
    with open(setup_path, "r", encoding="utf-8") as f:
        content = f.read()
    assert 'Excludes: "GAE_Bible.db"' in content
    assert 'onlyifdoesntexist' in content
    assert '#ifndef MyAppVersion' in content

def test_find_iscc():
    # ISCC might or might not be installed, but function should run without error
    iscc_path = find_iscc()
    if iscc_path:
        assert os.path.exists(iscc_path)
