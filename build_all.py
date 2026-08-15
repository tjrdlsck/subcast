import os
import sys
import subprocess
import shutil
import zipfile

def run_command(cmd, cwd=None):
    print(f"Running command: {cmd}")
    res = subprocess.run(cmd, shell=True, cwd=cwd)
    if res.returncode != 0:
        print(f"Command failed with code {res.returncode}: {cmd}")
        sys.exit(res.returncode)

def get_version():
    vfile = "version.txt"
    if os.path.exists(vfile):
        with open(vfile, "r", encoding="utf-8") as f:
            return f.read().strip()
    return "1.3.11"

def find_iscc():
    sys_path_iscc = shutil.which("ISCC")
    if sys_path_iscc and os.path.exists(sys_path_iscc):
        return sys_path_iscc
    
    candidates = [
        r"C:\Users\tjrdl\AppData\Local\Programs\Inno Setup 6\ISCC.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"),
        r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
        r"C:\Program Files\Inno Setup 6\ISCC.exe",
    ]
    for candidate in candidates:
        if os.path.exists(candidate):
            return candidate
    return None

def main():
    version = get_version()
    print(f"=== Subcast Enterprise Build & Packaging Pipeline v{version} ===")
    
    # 1. PyInstaller 빌드
    print("\n[Step 1/3] Building executable with PyInstaller...")
    pyinstaller_bin = os.path.join("venv", "Scripts", "pyinstaller.exe")
    if not os.path.exists(pyinstaller_bin):
        pyinstaller_bin = "pyinstaller"
    run_command(f'"{pyinstaller_bin}" subcast.spec --clean -y')
    
    # dist/subcast 에 추가 자원 누락 확인 및 복사
    dist_app = os.path.join("dist", "subcast")
    if not os.path.exists(os.path.join(dist_app, "bible.db")):
        shutil.copy("bible.db", dist_app)
    if not os.path.exists(os.path.join(dist_app, "version.txt")):
        shutil.copy("version.txt", dist_app)
    
    # 2. ZIP 패키지 생성 (자동 업데이트 및 무설치 배포용)
    print("\n[Step 2/3] Creating zip package for auto-updater...")
    zip_filename = os.path.join("dist", f"subcast-v{version}-windows.zip")
    if os.path.exists(zip_filename):
        os.remove(zip_filename)
        
    with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(dist_app):
            for file in files:
                abs_path = os.path.join(root, file)
                rel_path = os.path.relpath(abs_path, dist_app)
                zipf.write(abs_path, rel_path)
    print(f"Created ZIP: {zip_filename}")
    
    # 3. Inno Setup 인스톨러 생성
    print("\n[Step 3/3] Compiling Inno Setup EXE Installer...")
    iscc_path = find_iscc()
    if iscc_path:
        run_command(f'"{iscc_path}" /DMyAppVersion={version} setup.iss')
        print("Successfully created Enterprise Single EXE Setup Installer!")
    else:
        print("Error: ISCC (Inno Setup Compiler) not found on this system.")
        sys.exit(1)
        
    print("\n=== Build Completed Successfully! ===")
    print("Artifacts generated:")
    print(f" - Installer: dist/Subcast_Setup_v{version}.exe")
    print(f" - Auto-Update ZIP: dist/subcast-v{version}-windows.zip")

if __name__ == "__main__":
    main()
