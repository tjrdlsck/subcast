"""Exercise the launcher against a disposable Windows profile and install cwd."""

import json
import getpass
import os
import socket
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))


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
    run.config.update({"host": "127.0.0.1", "port": port, "auto_start_server": True})
    run.save_config(run.config)
    base_url = f"http://127.0.0.1:{port}"
    result = {"appdata": str(appdata_root / "Subcast"), "user": getpass.getuser()}

    try:
        if action == "cycle":
            class FakeIcon:
                stopped = False

                def update_menu(self):
                    pass

                def stop(self):
                    self.stopped = True

            icon = FakeIcon()
            menu = run.create_tray_menu()
            items = {item.text: item for item in menu.items if isinstance(item.text, str)}
            result["menu_items"] = sorted(items)
            for label in ("Start Server", "Stop Server", "Open Browser", "Auto Start Server", "Exit"):
                if label not in items:
                    raise AssertionError(f"Tray menu is missing {label}")
            opened = []
            run.webbrowser.open = opened.append
            items["Start Server"]._action(icon, items["Start Server"])
            result["version"] = wait_for_server(base_url)["version"]
            result["started"] = run.is_running()
            items["Stop Server"]._action(icon, items["Stop Server"])
            result["stopped"] = not run.is_running()
            items["Start Server"]._action(icon, items["Start Server"])
            result["started_again"] = run.is_running()
            wait_for_server(base_url)
            items["Open Browser"]._action(icon, items["Open Browser"])
            result["browser_url"] = opened[-1]
            items["Auto Start Server"]._action(icon, items["Auto Start Server"])
            result["auto_start"] = run.load_config()["auto_start_server"]
            items["Exit"]._action(icon, items["Exit"])
            result["exit_requested"] = icon.stopped
            result["exit_stopped"] = not run.is_running()
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
