import os
import sys
import webbrowser
import uvicorn
from threading import Timer

if __name__ == "__main__":
    # PyInstaller 임시 폴더 혹은 실행 파일 폴더 경로 대응
    if getattr(sys, 'frozen', False):
        os.chdir(os.path.dirname(sys.executable))
        
        # --windowed 모드에서 sys.stdout과 sys.stderr가 None이 되어 발생하는 Uvicorn 에러(isatty) 방지
        # print() 문으로 인한 튕김 현상도 함께 방지합니다.
        log_file = open("subcast.log", "w", encoding="utf-8")
        sys.stdout = log_file
        sys.stderr = log_file

    # 브라우저 자동 오픈
    def open_browser():
        webbrowser.open("http://127.0.0.1:8000")

    Timer(1.5, open_browser).start()

    # Uvicorn 서버 시작
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, log_level="info", use_colors=False)
