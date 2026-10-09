import json
import getpass
import os
import subprocess
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = Path(__file__).with_name("release_launcher_fixture.py")


def _run_launcher(mode: str, profile: Path, install_dir: Path, temp_dir: Path) -> dict:
    profile.mkdir(parents=True, exist_ok=True)
    install_dir.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    for key in ("SUBCAST_DATA_DIR", "SUBCAST_USER_DB_PATH", "SUBCAST_BIBLE_DB_PATH"):
        env.pop(key, None)
    env.update({"APPDATA": str(profile), "TEMP": str(temp_dir), "TMP": str(temp_dir)})
    completed = subprocess.run(
        [sys.executable, str(FIXTURE), mode, str(profile)],
        cwd=install_dir,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
        check=True,
    )
    return json.loads(completed.stdout.strip().splitlines()[-1])


@pytest.mark.skipif(os.name != "nt", reason="The release launcher scenarios exercise the Windows tray launcher.")
def test_sc16_01_clean_profile_first_start_and_process_restart_preserve_data(tmp_path: Path) -> None:
    profile = tmp_path / "profile" / "Roaming"
    install_dir = tmp_path / "install"
    temp_dir = tmp_path / "temp"
    temp_dir.mkdir()

    first_run = _run_launcher("seed", profile, install_dir, temp_dir)
    second_run = _run_launcher("verify", profile, install_dir, temp_dir)

    assert first_run["saved_project"] is True
    assert second_run["saved_project"] is True
    assert first_run["appdata"] == second_run["appdata"] == str(profile / "Subcast")
    assert first_run["user"] == second_run["user"] == getpass.getuser()


@pytest.mark.skipif(os.name != "nt", reason="The release launcher scenarios exercise the Windows tray launcher.")
def test_sc16_02_server_can_stop_start_and_accept_requests_again(tmp_path: Path) -> None:
    profile = tmp_path / "profile" / "Roaming"
    temp_dir = tmp_path / "temp"
    temp_dir.mkdir()

    result = _run_launcher("cycle", profile, tmp_path / "install", temp_dir)

    assert result["started"] is True
    assert result["stopped"] is True
    assert result["started_again"] is True
    assert result["browser_url"].endswith("/static/index.html")
    assert result["auto_start"] is False
    assert result["exit_requested"] is True
    assert result["exit_stopped"] is True


@pytest.mark.skipif(os.name != "nt", reason="The release launcher scenarios exercise Windows account and profile paths.")
def test_sc16_09_launcher_uses_isolated_profile_and_reports_its_version(tmp_path: Path) -> None:
    profile = tmp_path / "profile" / "Roaming"
    temp_dir = tmp_path / "temp"
    temp_dir.mkdir()

    result = _run_launcher("cycle", profile, tmp_path / "install", temp_dir)
    expected_version = (ROOT / "version.txt").read_text(encoding="utf-8").strip()

    assert result["appdata"] == str(profile / "Subcast")
    assert result["user"] == getpass.getuser()
    assert result["version"] == expected_version
    assert Path(result["appdata"]).is_dir()
