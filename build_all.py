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

def main():
    print("=== Subcast Enterprise Build & Packaging Pipeline v1.3.5 ===")
    
    # 1. PyInstaller 빌드
    print("\n[Step 1/3] Building executable with PyInstaller...")
    pyinstaller_bin = os.path.join("venv", "Scripts", "pyinstaller.exe")
    run_command(f'"{pyinstaller_bin}" subcast.spec --clean -y')
    
    # dist/subcast 에 추가 자원 누락 확인 및 복사
    dist_app = os.path.join("dist", "subcast")
    if not os.path.exists(os.path.join(dist_app, "GAE_Bible.db")):
        shutil.copy("GAE_Bible.db", dist_app)
    
    # 2. ZIP 패키지 생성 (자동 업데이트 및 무설치 배포용)
    print("\n[Step 2/3] Creating zip package for auto-updater...")
    zip_filename = os.path.join("dist", "subcast-v1.3.5-windows.zip")
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
    iscc_path = r"C:\Users\tjrdl\AppData\Local\Programs\Inno Setup 6\ISCC.exe"
    if os.path.exists(iscc_path):
        run_command(f'"{iscc_path}" setup.iss')
        print("Successfully created Enterprise Single EXE Setup Installer!")
    else:
        print(f"Error: ISCC not found at {iscc_path}")
        sys.exit(1)
        
    print("\n=== Build Completed Successfully! ===")
    print("Artifacts generated:")
    print(f" - Installer: dist/Subcast_Setup_v1.3.5.exe")
    print(f" - Auto-Update ZIP: dist/subcast-v1.3.5-windows.zip")

if __name__ == "__main__":
    main()
