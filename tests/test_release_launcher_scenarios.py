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
    assert result["menu_items"] == sorted([
        "Version: " + (ROOT / "version.txt").read_text(encoding="utf-8").strip(),
        "Start Server", "Stop Server", "Open Browser", "Change Port...",
        "Auto Start Server", "Check for Updates", "Open Log File", "Open AppData Folder", "Exit",
    ])
    assert result["version_label"].endswith((ROOT / "version.txt").read_text(encoding="utf-8").strip())
    assert result["status_stopped"].startswith("Status: Stopped (")
    assert result["status_running"].startswith("Status: Running (")
    assert result["status_after_stop"].startswith("Status: Stopped (")
    assert result["visibility_stopped"] == {"Start Server": True, "Stop Server": False, "Open Browser": False}
    assert result["visibility_running"] == {"Start Server": False, "Stop Server": True, "Open Browser": True}
    assert result["autostart_checked_initially"] is True
    assert result["browser_url"].endswith("/static/index.html")
    assert result["auto_start"] is False
    assert result["autostart_checked_after_toggle"] is False
    assert result["exit_requested"] is True
    assert result["exit_stopped"] is True
    assert result["duplicate_start_ignored"] is True
    assert result["duplicate_stop_safe"] is True
    assert result["menu_updates"] >= 4


@pytest.mark.skipif(os.name != "nt", reason="The tray port dialog and server restart are Windows launcher behaviors.")
def test_tray_change_port_restarts_server_and_persists_valid_port(tmp_path: Path) -> None:
    profile = tmp_path / "profile" / "Roaming"
    temp_dir = tmp_path / "temp"
    temp_dir.mkdir()

    result = _run_launcher("port-valid", profile, tmp_path / "install", temp_dir)

    assert result["new_port"] != result["old_port"]
    assert result["running"] is True
    assert result["new_port_responds"] == (ROOT / "version.txt").read_text(encoding="utf-8").strip()
    assert result["saved_port"] == result["new_port"]


@pytest.mark.skipif(os.name != "nt", reason="The tray port dialog is a Windows launcher behavior.")
def test_tray_change_port_while_stopped_saves_without_starting_server(tmp_path: Path) -> None:
    profile = tmp_path / "profile" / "Roaming"
    temp_dir = tmp_path / "temp"
    temp_dir.mkdir()

    result = _run_launcher("port-stopped", profile, tmp_path / "install", temp_dir)

    assert result["new_port"] != result["old_port"]
    assert result["saved_port"] == result["new_port"]
    assert result["running"] is False
    assert result["menu_updated"] is True


@pytest.mark.skipif(os.name != "nt", reason="The tray starts a local Windows server.")
def test_tray_start_server_moves_to_an_available_port_when_saved_port_is_busy(tmp_path: Path) -> None:
    profile = tmp_path / "profile" / "Roaming"
    temp_dir = tmp_path / "temp"
    temp_dir.mkdir()

    result = _run_launcher("start-port-conflict", profile, tmp_path / "install", temp_dir)

    assert result["fallback_port"] != result["preferred_port"]
    assert result["saved_port"] == result["fallback_port"]
    assert result["server_version"] == (ROOT / "version.txt").read_text(encoding="utf-8").strip()
    assert result["running"] is True


@pytest.mark.skipif(os.name != "nt", reason="The tray port dialog and server restart are Windows launcher behaviors.")
def test_tray_change_port_cancel_invalid_and_conflict_keep_server_healthy(tmp_path: Path) -> None:
    profile = tmp_path / "profile" / "Roaming"
    temp_dir = tmp_path / "temp"
    temp_dir.mkdir()

    result = _run_launcher("port-edge", profile, tmp_path / "install", temp_dir)

    assert result["conflict_alert_shown"] is True
    assert result["port_unchanged"] is True
    assert result["saved_port_unchanged"] is True
    assert result["server_still_responds"] == (ROOT / "version.txt").read_text(encoding="utf-8").strip()
    assert result["running"] is True


@pytest.mark.skipif(os.name != "nt", reason="The tray opens files and folders through the Windows shell.")
def test_tray_file_actions_and_auto_start_setting_persist_across_restart(tmp_path: Path) -> None:
    profile = tmp_path / "profile" / "Roaming"
    temp_dir = tmp_path / "temp"
    temp_dir.mkdir()

    result = _run_launcher("auxiliary", profile, tmp_path / "install", temp_dir)
    restarted = _run_launcher("inspect-config", profile, tmp_path / "install", temp_dir)

    assert result["opened_paths"] == [
        str(profile / "Subcast" / "subcast.log"),
        str(profile / "Subcast"),
    ]
    assert result["autostart_before"] is True
    assert result["autostart_after"] is False
    assert result["autostart_saved"] is False
    assert restarted["auto_start"] is False


@pytest.mark.skipif(os.name != "nt", reason="The tray update prompt is implemented with the Windows shell.")
def test_tray_update_menu_filters_release_edges_and_honors_user_choice(tmp_path: Path) -> None:
    profile = tmp_path / "profile" / "Roaming"
    temp_dir = tmp_path / "temp"
    temp_dir.mkdir()

    result = _run_launcher("updates", profile, tmp_path / "install", temp_dir)

    assert result["prompt_count"] == 2
    assert result["download_count"] == 1
    assert result["download_version"] == "v99.0.0"
    assert result["accepted_prompt_has_update"] is True


@pytest.mark.skipif(os.name != "nt", reason="The tray update menu delegates to the local Windows app server.")
def test_tray_update_menu_uses_safe_backend_update_sequence_when_server_runs(tmp_path: Path) -> None:
    profile = tmp_path / "profile" / "Roaming"
    temp_dir = tmp_path / "temp"
    temp_dir.mkdir()

    result = _run_launcher("update-server", profile, tmp_path / "install", temp_dir)

    assert result["update_events"] == ["release", "download", "flush", "backup", "launch"]
    assert result["server_running"] is True


@pytest.mark.skipif(os.name != "nt", reason="The tray update menu uses Windows installer APIs.")
def test_tray_update_menu_downloads_verifies_and_launches_when_server_is_stopped(tmp_path: Path) -> None:
    profile = tmp_path / "profile" / "Roaming"
    temp_dir = tmp_path / "temp"
    temp_dir.mkdir()

    result = _run_launcher("update-stopped", profile, tmp_path / "install", temp_dir)

    assert result["installer_downloaded"] is True
    assert result["installer_valid"] is True
    assert result["backup_count"] == 1
    assert result["launch_count"] == 1
    assert "/SUBCASTUPDATE=1" in result["launch_args"]
    assert "/SUBCASTORIGINALUSER=1" in result["launch_args"]
    assert result["icon_stopped"] is True


@pytest.mark.skipif(os.name != "nt", reason="The tray update menu uses Windows installer APIs.")
def test_tray_update_menu_rejects_checksum_mismatch_without_installing(tmp_path: Path) -> None:
    profile = tmp_path / "profile" / "Roaming"
    temp_dir = tmp_path / "temp"
    temp_dir.mkdir()

    result = _run_launcher("update-stopped-bad-checksum", profile, tmp_path / "install", temp_dir)

    assert result["installer_downloaded"] is True
    assert result["failure_logged"] is True
    assert result["backup_count"] == 0
    assert result["launch_count"] == 0
    assert result["icon_stopped"] is False


@pytest.mark.skipif(os.name != "nt", reason="The tray updater uses Windows installer assets.")
def test_tray_updater_rejects_untrusted_redirects_and_malformed_downloads(tmp_path: Path) -> None:
    profile = tmp_path / "profile" / "Roaming"
    temp_dir = tmp_path / "temp"
    temp_dir.mkdir()

    result = _run_launcher("download-edges", profile, tmp_path / "install", temp_dir)

    assert result["outcomes"] == {
        "untrusted-installer": "rejected",
        "untrusted-checksum": "rejected",
        "bad-checksum-text": "rejected",
        "redirect": "rejected",
        "invalid-exe": "rejected",
    }


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
