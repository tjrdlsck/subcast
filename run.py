import os
import sys
import webbrowser
import uvicorn
import json
import subprocess
import threading
from threading import Timer, Thread
import urllib.request
import tempfile
import hashlib
import re
import ctypes
from urllib.parse import urlparse

import pystray
from PIL import Image, ImageDraw

def get_current_version():
    base_path = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
    vfile = os.path.join(base_path, "version.txt")
    if os.path.exists(vfile):
        try:
            with open(vfile, "r", encoding="utf-8") as f:
                return f.read().strip()
        except Exception:
            pass
    return "1.3.20"

CURRENT_VERSION = get_current_version()
REPO_OWNER = "tjrdlsck"
REPO_NAME = "subcast"
icon = None

import shutil
from backend.services.launcher_utils import (
    clean_port_input,
    copy_missing_tree,
    find_available_port,
    is_port_available,
)

appdata_dir = os.getenv("APPDATA")
if not appdata_dir:
    appdata_dir = os.path.expanduser("~")

subcast_appdata = os.path.join(appdata_dir, "Subcast")
os.makedirs(subcast_appdata, exist_ok=True)

# PyInstaller 환경에서 워킹 디렉토리를 먼저 맞춰주어야 backend.main이 임포트될 때 경로 문제가 없습니다.
if getattr(sys, 'frozen', False):
    if hasattr(sys, '_MEIPASS'):
        os.chdir(sys._MEIPASS)
    else:
        os.chdir(os.path.dirname(sys.executable))
    
    # --windowed 모드에서 sys.stdout과 sys.stderr가 None이 되어 발생하는 Uvicorn 에러 방지 (즉시 플러시)
    log_path = os.path.join(subcast_appdata, "subcast.log")
    log_file = open(log_path, "a", encoding="utf-8", buffering=1)
    sys.stdout = log_file
    sys.stderr = log_file

install_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.getcwd()

new_data_dir = os.path.join(subcast_appdata, "data")
for old_dir in [os.path.join(install_dir, "data"), os.path.join(install_dir, "_internal", "data")]:
    if os.path.exists(old_dir):
        try:
            copy_missing_tree(old_dir, new_data_dir)
        except Exception as e:
            raise RuntimeError(f"Failed to migrate data dir from {old_dir}") from e

# 기본 배경화면 에셋을 AppData로 시딩(동기화)
new_bg_dir = os.path.join(subcast_appdata, "frontend", "assets", "backgrounds")
for old_bg_dir in [
    os.path.join(install_dir, "frontend", "assets", "backgrounds"),
    os.path.join(install_dir, "_internal", "frontend", "assets", "backgrounds")
]:
    if os.path.exists(old_bg_dir):
        try:
            copy_missing_tree(old_bg_dir, new_bg_dir)
        except Exception as e:
            raise RuntimeError(f"Failed to seed background assets from {old_bg_dir}") from e

os.environ["SUBCAST_DATA_DIR"] = subcast_appdata

from backend.services.migration_service import migrate_legacy_db_if_needed
if not migrate_legacy_db_if_needed(subcast_appdata, install_dir):
    raise RuntimeError("User database migration failed; existing data was preserved")

# 워킹 디렉토리 세팅 후 app을 임포트합니다.
from backend.main import app

CONFIG_FILE = os.path.join(subcast_appdata, "subcast_config.json")
DEFAULT_PORT = 8000

def load_config():
    old_config = "subcast_config.json"
    if os.path.exists(old_config) and not os.path.exists(CONFIG_FILE):
        try:
            shutil.copy2(old_config, CONFIG_FILE)
        except Exception as exc:
            raise RuntimeError(f"Cannot migrate saved configuration: {old_config}") from exc
            
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                if "host" not in cfg:
                    cfg["host"] = "0.0.0.0"
                return cfg
        except Exception as exc:
            raise RuntimeError(f"Cannot read saved configuration: {CONFIG_FILE}") from exc
    return {"port": DEFAULT_PORT, "host": "0.0.0.0", "auto_start_server": True}

def save_config(config):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f)

def open_log_file(icon=None, item=None):
    """현재 로그 파일을 기본 텍스트 뷰어로 엽니다."""
    log_path = os.path.join(subcast_appdata, "subcast.log")
    if os.path.exists(log_path):
        os.startfile(log_path)

def open_appdata_dir(icon=None, item=None):
    """Subcast AppData 데이터 폴더를 탐색기로 엽니다."""
    if os.path.exists(subcast_appdata):
        os.startfile(subcast_appdata)

config = load_config()
server_thread = None

class ServerThread(Thread):
    def __init__(self, host, port):
        super().__init__(daemon=True)
        self.config = uvicorn.Config(app, host=host, port=port, log_level="info", use_colors=False)
        self.server = uvicorn.Server(self.config)

    def run(self):
        try:
            self.server.run()
        except Exception as e:
            if hasattr(sys, "stderr") and sys.stderr is not None:
                sys.stderr.write(f"Server error: {e}\n")
                sys.stderr.flush()

    def stop(self):
        self.server.should_exit = True
        self.server.force_exit = True

def is_running(item=None):
    return server_thread is not None and server_thread.is_alive()

def is_stopped(item=None):
    return not is_running()

def start_server(icon=None, item=None):
    global server_thread
    if not is_running():
        host = config.get("host", "0.0.0.0")
        preferred_port = config.get("port", DEFAULT_PORT)
        actual_port = find_available_port(host, preferred_port)
        
        if actual_port != preferred_port:
            config["port"] = actual_port
            save_config(config)
            if hasattr(sys, "stderr") and sys.stderr is not None:
                sys.stderr.write(f"Port {preferred_port} in use. Switched to available port {actual_port}.\n")
                sys.stderr.flush()
                
        server_thread = ServerThread(host, actual_port)
        server_thread.start()
        
        if icon:
            try:
                icon.update_menu()
            except Exception:
                pass
        
        # 브라우저 자동 오픈
        Timer(1.5, lambda: webbrowser.open(f"http://127.0.0.1:{actual_port}/static/index.html")).start()

def stop_server(icon=None, item=None):
    global server_thread
    if is_running():
        server_thread.stop()
        server_thread.join(timeout=3.0)
        server_thread = None
    if icon:
        try:
            icon.update_menu()
        except Exception:
            pass

def _change_port_worker(icon=None):
    current_port = config.get("port", DEFAULT_PORT)
    script = f'''
    $OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    Add-Type -AssemblyName Microsoft.VisualBasic
    [Microsoft.VisualBasic.Interaction]::InputBox("Enter new port number (1024-65535)", "Subcast Port Setup", "{current_port}")
    '''
    CREATE_NO_WINDOW = 0x08000000
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
            creationflags=CREATE_NO_WINDOW
        )
        new_port = clean_port_input(result.stdout)
        if new_port is None:
            return

        host = config.get("host", "0.0.0.0")
        if not is_port_available(host, new_port):
            alert_script = f'''
            Add-Type -AssemblyName PresentationFramework
            [System.Windows.MessageBox]::Show("Port {new_port} is already in use by another application.", "Port Conflict", 'OK', 'Error')
            '''
            subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", alert_script], creationflags=CREATE_NO_WINDOW)
            return

        config["port"] = new_port
        save_config(config)

        if is_running():
            stop_server(icon=icon)
            start_server(icon=icon)
        elif icon:
            try:
                icon.update_menu()
            except Exception:
                pass
    except Exception as e:
        if hasattr(sys, "stderr") and sys.stderr is not None:
            sys.stderr.write(f"Port change error: {e}\n")
            sys.stderr.flush()

def change_port(icon=None, item=None):
    threading.Thread(target=_change_port_worker, args=(icon,), daemon=True).start()

def toggle_auto_start(icon, item):
    config["auto_start_server"] = not config.get("auto_start_server", True)
    save_config(config)
    if icon:
        try:
            icon.update_menu()
        except Exception:
            pass

def exit_app(icon, item):
    stop_server(icon)
    icon.stop()

def create_image():
    image = Image.new('RGB', (64, 64), color=(0, 120, 215)) # Windows blue
    draw = ImageDraw.Draw(image)
    draw.ellipse((16, 16, 48, 48), fill=(255, 255, 255))
    return image

def get_latest_release_info():
    url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/releases/latest"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        if hasattr(sys, "stderr") and sys.stderr is not None:
            sys.stderr.write(f"Failed to get release info: {e}\n")
        return None

def parse_version(v_str):
    match = re.fullmatch(r"v?(\d+(?:\.\d+){1,3})", str(v_str).strip())
    if not match:
        raise ValueError("Invalid release version")
    return [int(x) for x in match.group(1).split('.')]

def _trusted_release_url(url):
    parsed = urlparse(url or "")
    return parsed.scheme == "https" and parsed.hostname in {"github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"}

def _download_verified_asset(release_info):
    version = release_info.get("tag_name", "").lstrip("v")
    parse_version(version)
    filename = f"Subcast_Setup_v{version}.exe"
    assets = {asset.get("name"): asset.get("browser_download_url") for asset in release_info.get("assets", [])}
    installer_url, checksum_url = assets.get(filename), assets.get(filename + ".sha256")
    if not _trusted_release_url(installer_url) or not _trusted_release_url(checksum_url):
        raise ValueError("Release installer/checksum is missing or untrusted")
    temp_dir = tempfile.mkdtemp(prefix="subcast_update_")
    installer_path = os.path.join(temp_dir, filename)
    try:
        def open_url(url):
            request = urllib.request.Request(url, headers={"User-Agent": "Subcast-AutoUpdater"})
            response = urllib.request.urlopen(request, timeout=300)
            if not _trusted_release_url(response.geturl()):
                response.close()
                raise ValueError("Untrusted download redirect")
            return response
        with open_url(checksum_url) as response:
            checksum = response.read(4096).decode("ascii").strip()
        match = re.fullmatch(r"([0-9a-fA-F]{64})(?:\s+\*?.+)?", checksum)
        if not match:
            raise ValueError("Invalid checksum file")
        digest, size = hashlib.sha256(), 0
        with open_url(installer_url) as response, open(installer_path, "xb") as output:
            while True:
                chunk = response.read(65536)
                if not chunk:
                    break
                size += len(chunk)
                if size > 1_000_000_000:
                    raise ValueError("Installer exceeds size limit")
                digest.update(chunk)
                output.write(chunk)
        with open(installer_path, "rb") as installer:
            if installer.read(2) != b"MZ" or size < 1024:
                raise ValueError("Downloaded file is not a Windows installer")
        if digest.hexdigest().lower() != match.group(1).lower():
            raise ValueError("Installer checksum mismatch")
        return installer_path, temp_dir
    except Exception:
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise

def download_and_update(release_info):
    global icon
    temp_dir = None
    try:
        if is_running():
            api_url = f"http://127.0.0.1:{config.get('port', DEFAULT_PORT)}/api/system/auto-update"
            request = urllib.request.Request(api_url, data=b"", method="POST")
            with urllib.request.urlopen(request, timeout=360) as response:
                if response.status != 200:
                    raise RuntimeError("The application update endpoint rejected the request")
            return
        installer_path, temp_dir = _download_verified_asset(release_info)
            
        script = f'''
        Add-Type -AssemblyName PresentationFramework
        [System.Windows.MessageBox]::Show("업데이트 다운로드가 완료되었습니다. 설치를 진행합니다.", "Subcast Update")
        '''
        subprocess.run(["powershell", "-Command", script], creationflags=0x08000000)
        
        from backend.services.update_backup import create_update_backup
        create_update_backup(subcast_appdata)
        result = ctypes.windll.shell32.ShellExecuteW(None, "open", installer_path,
            "/SILENT /NORESTARTAPPLICATIONS /SUBCASTUPDATE=1 /SUBCASTORIGINALUSER=1 /LOG", None, 1)
        if result <= 32:
            raise OSError(f"Windows could not start installer (ShellExecute error {result})")
        _schedule_update_temp_cleanup(temp_dir)
        
        # Exit current app immediately so Inno Setup can update files cleanly
        if icon is not None:
            exit_app(icon, None)
        else:
            stop_server()
            sys.exit(0)
    except Exception as e:
        if temp_dir:
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)
        if hasattr(sys, "stderr") and sys.stderr is not None:
            sys.stderr.write(f"Update failed: {e}\n")

def _schedule_update_temp_cleanup(temp_dir):
    env = os.environ.copy()
    env["SUBCAST_UPDATE_TEMP"] = temp_dir
    command = (
        "$p=$env:SUBCAST_UPDATE_TEMP; "
        "for ($i=0; $i -lt 20 -and (Test-Path -LiteralPath $p); $i++) { "
        "Start-Sleep -Seconds 30; "
        "Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue }"
    )
    try:
        subprocess.Popen(
            ["powershell.exe", "-NoProfile", "-WindowStyle", "Hidden", "-Command", command],
            env=env,
            creationflags=0x08000000,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception as e:
        if hasattr(sys, "stderr") and sys.stderr is not None:
            sys.stderr.write(f"Update cleanup scheduling failed: {e}\n")

def check_for_updates(_icon=None, item=None):
    def _check():
        release_info = get_latest_release_info()
        if not release_info:
            return
            
        latest_version = release_info.get("tag_name", "")
        if not latest_version:
            return
            
        try:
            if parse_version(latest_version) > parse_version(CURRENT_VERSION) and not release_info.get("draft") and not release_info.get("prerelease"):
                expected_name = f"Subcast_Setup_v{latest_version.lstrip('v')}.exe"
                for asset in release_info.get("assets", []):
                    if asset.get("name") == expected_name:
                        script = f'''
                        Add-Type -AssemblyName PresentationFramework
                        $result = [System.Windows.MessageBox]::Show("새로운 버전({latest_version})이 있습니다. 업데이트 하시겠습니까?", "Subcast Update", 'YesNo')
                        if ($result -eq 'Yes') {{ exit 0 }} else {{ exit 1 }}
                        '''
                        ret = subprocess.run(["powershell", "-Command", script], creationflags=0x08000000)
                        if ret.returncode == 0:
                            threading.Thread(target=download_and_update, args=(release_info,), daemon=True).start()
                        break
        except Exception as e:
            if hasattr(sys, "stderr") and sys.stderr is not None:
                sys.stderr.write(f"Version check error: {e}\n")
    
    threading.Thread(target=_check).start()

if __name__ == "__main__":
    if config.get("auto_start_server", True):
        start_server()

    menu = pystray.Menu(
        pystray.MenuItem(lambda text: f"Status: {'Running' if is_running() else 'Stopped'} ({config['port']})", None, enabled=False),
        pystray.MenuItem(f"Version: {CURRENT_VERSION}", None, enabled=False),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Start Server", start_server, visible=is_stopped),
        pystray.MenuItem("Stop Server", stop_server, visible=is_running),
        pystray.MenuItem("Open Browser", lambda: webbrowser.open(f"http://127.0.0.1:{config['port']}/static/index.html"), visible=is_running),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Change Port...", change_port),
        pystray.MenuItem("Auto Start Server", toggle_auto_start, checked=lambda item: config.get("auto_start_server", True)),
        pystray.MenuItem("Check for Updates", check_for_updates),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Open Log File", open_log_file),
        pystray.MenuItem("Open AppData Folder", open_appdata_dir),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Exit", exit_app)
    )

    icon = pystray.Icon("subcast", create_image(), "Subcast WebApp", menu)
    icon.run()
