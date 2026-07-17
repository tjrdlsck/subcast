import os
import sys
import webbrowser
import uvicorn
from threading import Timer

if __name__ == "__main__":
    # PyInstaller 임시 폴더 혹은 실행 파일 폴더 경로 대응
    if getattr(sys, 'frozen', False):
        os.chdir(os.path.dirname(sys.executable))

    # 브라우저 자동 오픈
    def open_browser():
        webbrowser.open("http://127.0.0.1:8000")

    Timer(1.5, open_browser).start()

    # Uvicorn 서버 시작
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, log_level="info")
