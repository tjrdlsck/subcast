"""Exercise the launcher against a disposable Windows profile and install cwd."""

import json
import getpass
import os
import socket
import sys
import time
from pathlib import Path
from types import SimpleNamespace
from urllib.error import URLError
from urllib.request import Request, urlopen


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))


class FakeIcon:
    def __init__(self) -> None:
        self.stopped = False
        self.menu_updates = 0

    def update_menu(self) -> None:
        self.menu_updates += 1

    def stop(self) -> None:
        self.stopped = True


class ImmediateThread:
    """Run menu worker callbacks inline so subprocess tests can assert their result."""

    def __init__(self, target, args=(), kwargs=None, **_kwargs) -> None:
        self.target = target
        self.args = args
        self.kwargs = kwargs or {}

    def start(self) -> None:
        self.target(*self.args, **self.kwargs)


def menu_items(run):
    menu = run.create_tray_menu()
    items = {
        item.text: item for item in menu.items
        if item.text is not None and item.text != "- - - -" and not item.text.startswith("Status:")
    }
    status_item = next(item for item in menu.items if item.text.startswith("Status:"))
    return menu, items, status_item


def api_request(base_url: str, path: str, data: dict | None = None) -> dict:
    body = json.dumps(data).encode("utf-8") if data is not None else None
    request = Request(base_url + path, data=body, headers={"Content-Type": "application/json"})
    with urlopen(request, timeout=2) as response:
        return json.loads(response.read())


def wait_for_server(base_url: str) -> dict:
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        try:
            return api_request(base_url, "/api/system/version")
        except (OSError, URLError):
            time.sleep(0.2)
    raise TimeoutError(f"Launcher server did not become ready at {base_url}")


def main(action: str, appdata_root: Path) -> None:
    if os.name != "nt":
        raise RuntimeError("Launcher lifecycle scenarios require Windows")
    if not os.environ.get("APPDATA"):
        raise RuntimeError("APPDATA must point to the disposable test profile")

    import run

    class NoBrowserTimer:
        def __init__(self, *_args, **_kwargs):
            pass

        def start(self):
            pass

    run.Timer = NoBrowserTimer
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    run.config.update({"host": "127.0.0.1", "port": port})
    run.save_config(run.config)
    base_url = f"http://127.0.0.1:{port}"
    result = {"appdata": str(appdata_root / "Subcast"), "user": getpass.getuser()}

    try:
        if action == "cycle":
            icon = FakeIcon()
            menu, items, status_item = menu_items(run)
            result["menu_items"] = sorted(items)
            for label in (
                "Version: " + run.CURRENT_VERSION,
                "Start Server", "Stop Server", "Open Browser", "Change Port...",
                "Auto Start Server", "Check for Updates", "Open Log File", "Open AppData Folder", "Exit",
            ):
                if label not in items:
                    raise AssertionError(f"Tray menu is missing {label}")
            result["version_label"] = items["Version: " + run.CURRENT_VERSION].text
            result["status_stopped"] = status_item.text
            result["visibility_stopped"] = {
                label: items[label].visible for label in ("Start Server", "Stop Server", "Open Browser")
            }
            result["autostart_checked_initially"] = items["Auto Start Server"].checked
            opened = []
            run.webbrowser.open = opened.append
            items["Start Server"]._action(icon, items["Start Server"])
            result["version"] = wait_for_server(base_url)["version"]
            result["started"] = run.is_running()
            running_thread = run.server_thread
            items["Start Server"]._action(icon, items["Start Server"])
            result["duplicate_start_ignored"] = running_thread is run.server_thread
            result["status_running"] = status_item.text
            result["visibility_running"] = {
                label: items[label].visible for label in ("Start Server", "Stop Server", "Open Browser")
            }
            items["Stop Server"]._action(icon, items["Stop Server"])
            result["stopped"] = not run.is_running()
            items["Stop Server"]._action(icon, items["Stop Server"])
            result["duplicate_stop_safe"] = not run.is_running()
            result["status_after_stop"] = status_item.text
            items["Start Server"]._action(icon, items["Start Server"])
            result["started_again"] = run.is_running()
            wait_for_server(base_url)
            items["Open Browser"]._action(icon, items["Open Browser"])
            result["browser_url"] = opened[-1]
            items["Auto Start Server"]._action(icon, items["Auto Start Server"])
            result["auto_start"] = run.load_config()["auto_start_server"]
            result["autostart_checked_after_toggle"] = items["Auto Start Server"].checked
            items["Exit"]._action(icon, items["Exit"])
            result["exit_requested"] = icon.stopped
            result["exit_stopped"] = not run.is_running()
            result["menu_updates"] = icon.menu_updates
        if action == "port-valid":
            icon = FakeIcon()
            _, items, _ = menu_items(run)
            run.start_server(icon)
            wait_for_server(base_url)
            old_port = run.config["port"]
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
                listener.bind(("127.0.0.1", 0))
                new_port = listener.getsockname()[1]
            run.threading = SimpleNamespace(Thread=ImmediateThread)
            original_run = run.subprocess.run
            run.subprocess.run = lambda *_args, **_kwargs: SimpleNamespace(stdout=str(new_port))
            try:
                items["Change Port..."]._action(icon, items["Change Port..."])
            finally:
                run.subprocess.run = original_run
            result.update({"old_port": old_port, "new_port": run.config["port"], "running": run.is_running()})
            result["new_port_responds"] = wait_for_server(f"http://127.0.0.1:{new_port}")["version"]
            result["saved_port"] = run.load_config()["port"]
            result["menu_updates"] = icon.menu_updates
        if action == "port-stopped":
            icon = FakeIcon()
            _, items, _ = menu_items(run)
            old_port = run.config["port"]
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
                listener.bind(("127.0.0.1", 0))
                new_port = listener.getsockname()[1]
            run.threading = SimpleNamespace(Thread=ImmediateThread)
            original_run = run.subprocess.run
            run.subprocess.run = lambda *_args, **_kwargs: SimpleNamespace(stdout=str(new_port))
            try:
                items["Change Port..."]._action(icon, items["Change Port..."])
            finally:
                run.subprocess.run = original_run
            result.update({"old_port": old_port, "new_port": run.config["port"]})
            result["saved_port"] = run.load_config()["port"]
            result["running"] = run.is_running()
            result["menu_updated"] = icon.menu_updates > 0
        if action == "start-port-conflict":
            icon = FakeIcon()
            _, items, _ = menu_items(run)
            preferred_port = run.config["port"]
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as occupied:
                occupied.bind(("127.0.0.1", preferred_port))
                occupied.listen(1)
                items["Start Server"]._action(icon, items["Start Server"])
                result["preferred_port"] = preferred_port
                result["fallback_port"] = run.config["port"]
                result["server_version"] = wait_for_server(
                    f"http://127.0.0.1:{run.config['port']}"
                )["version"]
                result["running"] = run.is_running()
            result["saved_port"] = run.load_config()["port"]
            run.stop_server(icon)
        if action == "port-edge":
            icon = FakeIcon()
            _, items, _ = menu_items(run)
            run.start_server(icon)
            wait_for_server(base_url)
            old_port = run.config["port"]
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as occupied:
                occupied.bind(("127.0.0.1", 0))
                occupied.listen(1)
                occupied_port = occupied.getsockname()[1]
                responses = iter(("", "80", "65536", "not a port", str(occupied_port), ""))
                calls = []

                def fake_run(command, *_args, **_kwargs):
                    calls.append(command)
                    return SimpleNamespace(stdout=next(responses, ""))

                run.threading = SimpleNamespace(Thread=ImmediateThread)
                original_run = run.subprocess.run
                run.subprocess.run = fake_run
                try:
                    for _ in range(5):
                        items["Change Port..."]._action(icon, items["Change Port..."])
                finally:
                    run.subprocess.run = original_run
                result["conflict_alert_shown"] = any(
                    "PresentationFramework" in " ".join(command) for command in calls
                )
                result["occupied_port"] = occupied_port
            result["port_unchanged"] = run.config["port"] == old_port
            result["saved_port_unchanged"] = run.load_config()["port"] == old_port
            result["server_still_responds"] = wait_for_server(base_url)["version"]
            result["running"] = run.is_running()
            run.stop_server(icon)
        if action == "auxiliary":
            icon = FakeIcon()
            _, items, _ = menu_items(run)
            opened_paths = []
            original_startfile = run.os.startfile
            run.os.startfile = opened_paths.append
            original_threading = run.threading
            run.threading = SimpleNamespace(Thread=ImmediateThread)
            try:
                log_path = Path(run.subcast_appdata) / "subcast.log"
                log_path.write_text("tray test log", encoding="utf-8")
                items["Open Log File"]._action(icon, items["Open Log File"])
                items["Open AppData Folder"]._action(icon, items["Open AppData Folder"])
                log_path.unlink()
                items["Open Log File"]._action(icon, items["Open Log File"])
                before = items["Auto Start Server"].checked
                items["Auto Start Server"]._action(icon, items["Auto Start Server"])
                result["autostart_before"] = before
                result["autostart_after"] = items["Auto Start Server"].checked
                result["autostart_saved"] = run.load_config()["auto_start_server"]
                result["opened_paths"] = opened_paths
            finally:
                run.os.startfile = original_startfile
                run.threading = original_threading
        if action == "inspect-config":
            result["auto_start"] = run.load_config()["auto_start_server"]
        if action == "updates":
            icon = FakeIcon()
            _, items, _ = menu_items(run)
            run.threading = SimpleNamespace(Thread=ImmediateThread)
            downloads = []
            prompts = []
            run.download_and_update = downloads.append
            releases = [
                None,
                {"tag_name": run.CURRENT_VERSION, "assets": []},
                {"tag_name": "v0.1.0", "assets": []},
                {"tag_name": "v99.0.0-beta", "assets": []},
                {"tag_name": "v99.0.0", "draft": True, "assets": []},
                {"tag_name": "v99.0.0", "prerelease": True, "assets": []},
                {"tag_name": "v99.0.0", "assets": []},
                {"tag_name": "v99.0.0", "assets": [{"name": "Subcast_Setup_v99.0.0.exe"}]},
            ]
            current_release = None
            prompt_results = iter((1, 0))

            def fake_release():
                return current_release

            def fake_prompt(command, *_args, **_kwargs):
                prompts.append(command)
                return SimpleNamespace(returncode=next(prompt_results))

            run.get_latest_release_info = fake_release
            original_run = run.subprocess.run
            run.subprocess.run = fake_prompt
            try:
                for release_info in releases:
                    current_release = release_info
                    items["Check for Updates"]._action(icon, items["Check for Updates"])
                current_release = {
                    "tag_name": "v99.0.0",
                    "assets": [{"name": "Subcast_Setup_v99.0.0.exe"}],
                }
                items["Check for Updates"]._action(icon, items["Check for Updates"])
            finally:
                run.subprocess.run = original_run
            result["prompt_count"] = len(prompts)
            result["download_count"] = len(downloads)
            result["download_version"] = downloads[0]["tag_name"] if downloads else None
            result["accepted_prompt_has_update"] = "v99.0.0" in " ".join(prompts[-1]) if prompts else False
        if action == "update-server":
            from backend.routers import system

            icon = FakeIcon()
            _, items, _ = menu_items(run)
            events = []
            release_info = {
                "tag_name": "v99.0.0",
                "assets": [
                    {"name": "Subcast_Setup_v99.0.0.exe", "browser_download_url": "https://github.com/tjrdlsck/subcast/releases/download/v99.0.0/Subcast_Setup_v99.0.0.exe"},
                    {"name": "Subcast_Setup_v99.0.0.exe.sha256", "browser_download_url": "https://github.com/tjrdlsck/subcast/releases/download/v99.0.0/Subcast_Setup_v99.0.0.exe.sha256"},
                ],
            }

            async def latest():
                events.append("release")
                return release_info

            async def downloaded(_installer_url, _checksum_url):
                events.append("download")
                return str(Path(run.subcast_appdata) / "installer.exe"), run.subcast_appdata

            async def flushed():
                events.append("flush")

            def backed_up(_data_dir):
                events.append("backup")

            def launched(_installer_path):
                events.append("launch")

            async def exit_after_launch(_installer_path):
                return None

            system._latest_release = latest
            system._download_verified_installer = downloaded
            system._flush_project_state = flushed
            system.create_update_backup = backed_up
            system._launch_installer = launched
            system._schedule_temp_cleanup = lambda _temp_dir: None
            system._exit_after_install_launch = exit_after_launch
            system._UPDATE_IN_PROGRESS = False
            run.get_latest_release_info = lambda: release_info
            run.subprocess.run = lambda *_args, **_kwargs: SimpleNamespace(returncode=0)
            run.threading = SimpleNamespace(Thread=ImmediateThread)
            run.start_server(icon)
            wait_for_server(base_url)
            try:
                items["Check for Updates"]._action(icon, items["Check for Updates"])
                result["update_events"] = events
                result["server_running"] = run.is_running()
            finally:
                run.stop_server(icon)
                system._UPDATE_IN_PROGRESS = False
        if action in {"update-stopped", "update-stopped-bad-checksum"}:
            import shutil
            import hashlib
            import backend.services.update_backup as backup

            icon = FakeIcon()
            run.icon = icon
            _, items, _ = menu_items(run)
            installer_data = b"MZ" + (b"fixture-installer" * 100)
            checksum_data = installer_data if action == "update-stopped" else b"MZ" + b"different" * 100
            digest = hashlib.sha256(checksum_data).hexdigest()
            base_url = "https://github.com/tjrdlsck/subcast/releases/download/v99.0.0/"
            installer_url = base_url + "Subcast_Setup_v99.0.0.exe"
            checksum_url = installer_url + ".sha256"
            release_info = {
                "tag_name": "v99.0.0",
                "assets": [
                    {"name": "Subcast_Setup_v99.0.0.exe", "browser_download_url": installer_url},
                    {"name": "Subcast_Setup_v99.0.0.exe.sha256", "browser_download_url": checksum_url},
                ],
            }

            class FakeResponse:
                def __init__(self, data, url, final_url=None):
                    self.data = data
                    self.url = url
                    self.final_url = final_url or url
                    self.position = 0

                def __enter__(self):
                    return self

                def __exit__(self, *_args):
                    return False

                def geturl(self):
                    return self.final_url

                def close(self):
                    pass

                def read(self, size=-1):
                    if size < 0:
                        size = len(self.data) - self.position
                    chunk = self.data[self.position:self.position + size]
                    self.position += len(chunk)
                    return chunk

            original_urlopen = run.urllib.request.urlopen
            original_run = run.subprocess.run
            original_backup = backup.create_update_backup
            original_schedule = run._schedule_update_temp_cleanup
            original_threading = run.threading
            original_ctypes = run.ctypes
            original_stderr = run.sys.stderr
            launched = []
            backed_up = []
            url_calls = []

            def fake_urlopen(url, **_kwargs):
                url_calls.append(url.full_url if hasattr(url, "full_url") else url)
                requested_url = url_calls[-1]
                if requested_url == checksum_url:
                    return FakeResponse(f"{digest}  installer.exe".encode("ascii"), checksum_url)
                return FakeResponse(installer_data, installer_url)

            def shell_execute(_hwnd, _verb, installer_path, arguments, _directory, _show):
                launched.append((installer_path, arguments))
                return 33

            prompt_results = iter((0, 0))
            run.get_latest_release_info = lambda: release_info
            run.urllib.request.urlopen = fake_urlopen
            run.subprocess.run = lambda *_args, **_kwargs: SimpleNamespace(returncode=next(prompt_results))
            run.threading = SimpleNamespace(Thread=ImmediateThread)
            run._schedule_update_temp_cleanup = lambda _temp_dir: None
            run.ctypes = SimpleNamespace(
                windll=SimpleNamespace(shell32=SimpleNamespace(ShellExecuteW=shell_execute))
            )
            backup.create_update_backup = lambda path: backed_up.append(path)
            if action == "update-stopped-bad-checksum":
                import io
                run.sys.stderr = io.StringIO()
            try:
                items["Check for Updates"]._action(icon, items["Check for Updates"])
                result["launch_count"] = len(launched)
                result["backup_count"] = len(backed_up)
                result["icon_stopped"] = icon.stopped
                result["installer_downloaded"] = bool(url_calls)
                if launched:
                    installer_path, installer_args = launched[0]
                    result["installer_valid"] = Path(installer_path).read_bytes() == installer_data
                    result["launch_args"] = installer_args
                    shutil.rmtree(Path(installer_path).parent, ignore_errors=True)
                else:
                    result["failure_logged"] = "checksum mismatch" in run.sys.stderr.getvalue().lower()
            finally:
                run.urllib.request.urlopen = original_urlopen
                run.subprocess.run = original_run
                backup.create_update_backup = original_backup
                run._schedule_update_temp_cleanup = original_schedule
                run.threading = original_threading
                run.ctypes = original_ctypes
                run.sys.stderr = original_stderr
        if action == "download-edges":
            import hashlib

            installer_data = b"MZ" + (b"fixture-installer" * 100)
            valid_digest = hashlib.sha256(installer_data).hexdigest()
            base_url = "https://github.com/tjrdlsck/subcast/releases/download/v99.0.0/"
            installer_url = base_url + "Subcast_Setup_v99.0.0.exe"
            checksum_url = installer_url + ".sha256"
            outcomes = {}
            network_calls = []

            class FakeResponse:
                def __init__(self, data, url, final_url=None):
                    self.data = data
                    self.url = url
                    self.final_url = final_url or url
                    self.position = 0

                def __enter__(self):
                    return self

                def __exit__(self, *_args):
                    return False

                def geturl(self):
                    return self.final_url

                def close(self):
                    pass

                def read(self, size=-1):
                    if size < 0:
                        size = len(self.data) - self.position
                    chunk = self.data[self.position:self.position + size]
                    self.position += len(chunk)
                    return chunk

            original_urlopen = run.urllib.request.urlopen
            for case in ("untrusted-installer", "untrusted-checksum", "bad-checksum-text", "redirect", "invalid-exe"):
                case_installer = "http://evil.example/installer.exe" if case == "untrusted-installer" else installer_url
                case_checksum = "https://evil.example/installer.sha256" if case == "untrusted-checksum" else checksum_url
                checksum_bytes = (
                    b"not a checksum" if case == "bad-checksum-text"
                    else f"{valid_digest}  installer.exe".encode("ascii")
                )
                downloaded_bytes = b"NO" + (b"invalid-installer" * 100) if case == "invalid-exe" else installer_data

                def fake_urlopen(url, **_kwargs):
                    requested_url = url.full_url if hasattr(url, "full_url") else url
                    network_calls.append(requested_url)
                    if requested_url == case_checksum:
                        return FakeResponse(checksum_bytes, case_checksum)
                    final_url = "https://evil.example/redirected.exe" if case == "redirect" else requested_url
                    return FakeResponse(downloaded_bytes, requested_url, final_url)

                run.urllib.request.urlopen = fake_urlopen
                try:
                    run._download_verified_asset({
                        "tag_name": "v99.0.0",
                        "assets": [
                            {"name": "Subcast_Setup_v99.0.0.exe", "browser_download_url": case_installer},
                            {"name": "Subcast_Setup_v99.0.0.exe.sha256", "browser_download_url": case_checksum},
                        ],
                    })
                    outcomes[case] = "accepted"
                except ValueError:
                    outcomes[case] = "rejected"
            run.urllib.request.urlopen = original_urlopen
            result["outcomes"] = outcomes
            result["network_calls"] = len(network_calls)
        if action == "seed":
            run.start_server()
            result["version"] = wait_for_server(base_url)["version"]
            result["started"] = run.is_running()
            project = api_request(base_url, "/api/projects", {"name": "SC16 disposable user data"})
            result["project_id"] = project["id"]
            result["saved_project"] = True
            run.stop_server()
            result["stopped"] = not run.is_running()
        if action == "verify":
            run.start_server()
            result["version"] = wait_for_server(base_url)["version"]
            projects = api_request(base_url, "/api/projects")
            result["saved_project"] = any(item["name"] == "SC16 disposable user data" for item in projects)
            run.stop_server()
            result["stopped_again"] = not run.is_running()
    finally:
        run.stop_server()

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: release_launcher_fixture.py <seed|verify|cycle> <appdata-root>")
    main(sys.argv[1], Path(sys.argv[2]).resolve())
