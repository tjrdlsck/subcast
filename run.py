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
    if hasattr(sys, '_MEIPASS'):
        os.chdir(sys._MEIPASS)
    else:
        os.chdir(os.path.dirname(sys.executable))
    
    # --windowed 모드에서 sys.stdout과 sys.stderr가 None이 되어 발생하는 Uvicorn 에러 방지
    log_file = open("subcast.log", "w", encoding="utf-8")
    sys.stdout = log_file
    sys.stderr = log_file

# 워킹 디렉토리 세팅 후 app을 임포트합니다.
from backend.main import app

CONFIG_FILE = "subcast_config.json"
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
        server_thread = ServerThread("127.0.0.1", config["port"])
        server_thread.start()
        
        # 브라우저 자동 오픈
        Timer(1.5, lambda: webbrowser.open(f"http://127.0.0.1:{config['port']}")).start()

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

if __name__ == "__main__":
    if config.get("auto_start_server", True):
        start_server()

    menu = pystray.Menu(
        pystray.MenuItem(lambda text: f"Status: {'Running' if is_running() else 'Stopped'} ({config['port']})", None, enabled=False),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Start Server", start_server, visible=is_stopped),
        pystray.MenuItem("Stop Server", stop_server, visible=is_running),
        pystray.MenuItem("Open Browser", lambda: webbrowser.open(f"http://127.0.0.1:{config['port']}"), visible=is_running),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Change Port...", change_port),
        pystray.MenuItem("Auto Start Server", toggle_auto_start, checked=lambda item: config.get("auto_start_server", True)),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Exit", exit_app)
    )

    icon = pystray.Icon("subcast", create_image(), "Subcast WebApp", menu)
    icon.run()
