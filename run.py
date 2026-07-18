import os
import sys
import webbrowser
import uvicorn
from threading import Timer

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

# 워킹 디렉토리 세팅 후 app을 임포트합니다. (PyInstaller가 의존성을 인식하도록 직접 import)
from backend.main import app

if __name__ == "__main__":
    # 브라우저 자동 오픈
    def open_browser():
        webbrowser.open("http://127.0.0.1:8000")

    Timer(1.5, open_browser).start()

    # 문자열 대신 앱 인스턴스를 직접 넘겨 PyInstaller가 모듈을 누락하지 않게 합니다.
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info", use_colors=False)
