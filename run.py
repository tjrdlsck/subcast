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
    return "1.3.11"

CURRENT_VERSION = get_current_version()
REPO_OWNER = "tjrdlsck"
REPO_NAME = "subcast"
icon = None

import shutil
from pathlib import Path

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
    
    # --windowed 모드에서 sys.stdout과 sys.stderr가 None이 되어 발생하는 Uvicorn 에러 방지
    log_path = os.path.join(subcast_appdata, "subcast.log")
    log_file = open(log_path, "w", encoding="utf-8")
    sys.stdout = log_file
    sys.stderr = log_file

install_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.getcwd()

new_data_dir = os.path.join(subcast_appdata, "data")
for old_dir in [os.path.join(install_dir, "data"), os.path.join(install_dir, "_internal", "data")]:
    if os.path.exists(old_dir):
        try:
            shutil.copytree(old_dir, new_data_dir, dirs_exist_ok=True)
        except Exception as e:
            print(f"Failed to migrate data dir from {old_dir}: {e}")

os.environ["SUBCAST_DATA_DIR"] = subcast_appdata

from backend.services.migration_service import migrate_legacy_db_if_needed
migrate_legacy_db_if_needed(subcast_appdata, install_dir)

# 워킹 디렉토리 세팅 후 app을 임포트합니다.
from backend.main import app

CONFIG_FILE = os.path.join(subcast_appdata, "subcast_config.json")
DEFAULT_PORT = 8000

def load_config():
    old_config = "subcast_config.json"
    if os.path.exists(old_config) and not os.path.exists(CONFIG_FILE):
        try:
            shutil.copy2(old_config, CONFIG_FILE)
        except:
            pass
            
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                if "host" not in cfg:
                    cfg["host"] = "0.0.0.0"
                return cfg
        except:
            pass
    return {"port": DEFAULT_PORT, "host": "0.0.0.0", "auto_start_server": True}

def save_config(config):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f)

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

    def stop(self):
        self.server.should_exit = True

def is_running(item=None):
    return server_thread is not None and server_thread.is_alive()

def is_stopped(item=None):
    return not is_running()

def start_server(icon=None, item=None):
    global server_thread
    if not is_running():
        host = config.get("host", "0.0.0.0")
        server_thread = ServerThread(host, config["port"])
        server_thread.start()
        
        # 브라우저 자동 오픈
        Timer(1.5, lambda: webbrowser.open(f"http://127.0.0.1:{config['port']}/static/index.html")).start()

def stop_server(icon=None, item=None):
    global server_thread
    if is_running():
        server_thread.stop()
        server_thread.join(timeout=3.0)
        server_thread = None

def change_port(icon=None, item=None):
    script = f'''
    Add-Type -AssemblyName Microsoft.VisualBasic
    [Microsoft.VisualBasic.Interaction]::InputBox("Enter new port number (1024-65535)", "Subcast Port Setup", "{config["port"]}")
    '''
    CREATE_NO_WINDOW = 0x08000000
    try:
        result = subprocess.run(["powershell", "-Command", script], capture_output=True, text=True, creationflags=CREATE_NO_WINDOW)
        out = result.stdout.strip()
        if out.isdigit():
            new_port = int(out)
            if 1024 <= new_port <= 65535:
                config["port"] = new_port
                save_config(config)
                
                # Restart server if running
                if is_running():
                    stop_server()
                    start_server()
    except Exception as e:
        if hasattr(sys, "stderr") and sys.stderr is not None:
            sys.stderr.write(f"Port change error: {e}\n")

def toggle_auto_start(icon, item):
    config["auto_start_server"] = not config.get("auto_start_server", True)
    save_config(config)

def exit_app(icon, item):
    stop_server()
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
    return [int(x) for x in v_str.replace('v', '').split('.') if x.isdigit()]

def download_and_update(asset_url, installer_name):
    global icon
    try:
        temp_dir = tempfile.gettempdir()
        installer_path = os.path.join(temp_dir, installer_name)
        
        req = urllib.request.Request(asset_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response, open(installer_path, 'wb') as out_file:
            chunk_size = 65536
            while True:
                chunk = response.read(chunk_size)
                if not chunk:
                    break
                out_file.write(chunk)
            
        script = f'''
        Add-Type -AssemblyName PresentationFramework
        [System.Windows.MessageBox]::Show("업데이트 다운로드가 완료되었습니다. 설치를 진행합니다.", "Subcast Update")
        '''
        subprocess.run(["powershell", "-Command", script], creationflags=0x08000000)
        
        # Run installer with restart
        proc = subprocess.Popen([installer_path, '/VERYSILENT', '/SUPPRESSMSGBOXES', '/FORCECLOSEAPPLICATIONS', '/RESTARTAPPLICATIONS', '/NOCANCEL'])
        
        # Wait briefly then clean up temp installer file
        proc.wait(timeout=5)
        try:
            os.remove(installer_path)
        except Exception:
            pass
        
        # Exit current app
        if icon is not None:
            exit_app(icon, None)
        else:
            stop_server()
            sys.exit(0)
    except Exception as e:
        if hasattr(sys, "stderr") and sys.stderr is not None:
            sys.stderr.write(f"Update failed: {e}\n")

def check_for_updates(_icon=None, item=None):
    def _check():
        release_info = get_latest_release_info()
        if not release_info:
            return
            
        latest_version = release_info.get("tag_name", "")
        if not latest_version:
            return
            
        try:
            if parse_version(latest_version) > parse_version(CURRENT_VERSION):
                for asset in release_info.get("assets", []):
                    if asset["name"].endswith(".exe"):
                        script = f'''
                        Add-Type -AssemblyName PresentationFramework
                        $result = [System.Windows.MessageBox]::Show("새로운 버전({latest_version})이 있습니다. 업데이트 하시겠습니까?", "Subcast Update", 'YesNo')
                        if ($result -eq 'Yes') {{ exit 0 }} else {{ exit 1 }}
                        '''
                        ret = subprocess.run(["powershell", "-Command", script], creationflags=0x08000000)
                        if ret.returncode == 0:
                            threading.Thread(target=download_and_update, args=(asset["browser_download_url"], asset["name"])).start()
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
        pystray.MenuItem("Exit", exit_app)
    )

    icon = pystray.Icon("subcast", create_image(), "Subcast WebApp", menu)
    icon.run()
