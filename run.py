import os
import sys
import webbrowser
import uvicorn
import json
import subprocess
from threading import Timer, Thread

import pystray
from PIL import Image, ImageDraw

# PyInstaller 환경에서 워킹 디렉토리를 먼저 맞춰주어야 backend.main이 임포트될 때 경로 문제가 없습니다.
if getattr(sys, 'frozen', False):
    APP_DIR = os.path.dirname(sys.executable)
    if hasattr(sys, '_MEIPASS'):
        os.chdir(sys._MEIPASS)
    else:
        os.chdir(APP_DIR)
    
    # --windowed 모드에서 sys.stdout과 sys.stderr가 None이 되어 발생하는 Uvicorn 에러 방지
    log_file = open(os.path.join(APP_DIR, "subcast.log"), "w", encoding="utf-8")
    sys.stdout = log_file
    sys.stderr = log_file
else:
    APP_DIR = os.getcwd()

# 워킹 디렉토리 세팅 후 app을 임포트합니다.
from backend.main import app

CONFIG_FILE = os.path.join(APP_DIR, "subcast_config.json")
DEFAULT_PORT = 8000

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            pass
    return {"port": DEFAULT_PORT, "auto_start_server": True}

def save_config(config):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f)

def update_startup_registry(enabled: bool):
    if not getattr(sys, 'frozen', False):
        return
    
    key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
    app_name = "Subcast"
    app_path = f'"{sys.executable}"'
    
    try:
        import winreg
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_ALL_ACCESS)
        if enabled:
            winreg.SetValueEx(key, app_name, 0, winreg.REG_SZ, app_path)
        else:
            try:
                winreg.DeleteValue(key, app_name)
            except FileNotFoundError:
                pass
        winreg.CloseKey(key)
    except Exception as e:
        if hasattr(sys, "stderr") and sys.stderr is not None:
            sys.stderr.write(f"Startup registry update error: {e}\n")

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
        server_thread = ServerThread("0.0.0.0", config["port"])
        server_thread.start()
        if icon:
            icon.update_menu()
        
        # 브라우저 자동 오픈
        Timer(1.5, lambda: webbrowser.open(f"http://127.0.0.1:{config['port']}")).start()

def stop_server(icon=None, item=None):
    global server_thread
    if is_running():
        server_thread.stop()
        server_thread.join(timeout=3.0)
        server_thread = None
        if icon:
            icon.update_menu()

def change_port(icon=None, item=None):
    script = f'''
    Add-Type -AssemblyName Microsoft.VisualBasic
    [Microsoft.VisualBasic.Interaction]::InputBox("Enter new port number (1024-65535)", "Subcast Port Setup", "{config["port"]}")
    '''
    CREATE_NO_WINDOW = 0x08000000
    try:
        result = subprocess.run(["powershell", "-NoProfile", "-Command", script], capture_output=True, text=True, creationflags=CREATE_NO_WINDOW)
        out = result.stdout.strip()
        
        # 만약 프로필 출력 등 다른 문자열이 섞여 있으면 마지막 줄만 가져옴
        lines = out.splitlines()
        if lines:
            out = lines[-1].strip()
            
        if out.isdigit():
            new_port = int(out)
            if 1024 <= new_port <= 65535:
                config["port"] = new_port
                save_config(config)
                
                # Restart server if running
                if is_running():
                    stop_server(icon)
                    start_server(icon)
                elif icon:
                    icon.update_menu()
    except Exception as e:
        if hasattr(sys, "stderr") and sys.stderr is not None:
            sys.stderr.write(f"Port change error: {e}\n")

def toggle_auto_start(icon, item):
    new_val = not config.get("auto_start_server", True)
    config["auto_start_server"] = new_val
    save_config(config)
    update_startup_registry(new_val)
    if icon:
        icon.update_menu()

def exit_app(icon, item):
    stop_server()
    icon.stop()

def create_image():
    image = Image.new('RGB', (64, 64), color=(0, 120, 215)) # Windows blue
    draw = ImageDraw.Draw(image)
    draw.ellipse((16, 16, 48, 48), fill=(255, 255, 255))
    return image

if __name__ == "__main__":
    update_startup_registry(config.get("auto_start_server", True))
    if config.get("auto_start_server", True):
        start_server()

    menu = pystray.Menu(
        pystray.MenuItem(lambda text: f"Status: {'Running' if is_running() else 'Stopped'} ({config['port']})", None, enabled=False),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Start Server", start_server, visible=is_stopped),
        pystray.MenuItem("Stop Server", stop_server, visible=is_running),
        pystray.MenuItem("Open Browser", lambda: webbrowser.open(f"http://127.0.0.1:{config['port']}"), visible=is_running),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Change Port...", change_port, enabled=is_stopped),
        pystray.MenuItem("Auto Start Server", toggle_auto_start, checked=lambda item: config.get("auto_start_server", True)),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Exit", exit_app)
    )

    icon = pystray.Icon("subcast", create_image(), "Subcast WebApp", menu)
    icon.run()
