# Design Specification: CHG-044-version-bump-build-and-release

## 1. Goal
`version.txt`를 `1.3.14`로 상향하고 기업용 단일 EXE 설치 패키지와 무설치/인앱 자동 업데이트용 ZIP 패키지를 빌드한 뒤 GitHub Release v1.3.14 자산으로 게시함.

## 2. Process Specification

1. **Version Update**:
   - `version.txt` -> `1.3.14`

2. **Build Execution**:
   - `venv\Scripts\python.exe build_all.py`
   - 산출물:
     - `dist/Subcast_Setup_v1.3.14.exe` (Inno Setup 인스톨러)
     - `dist/subcast-v1.3.14-windows.zip` (자동 업데이트용 ZIP)

3. **Release Upload**:
   - `gh release create v1.3.14 dist/Subcast_Setup_v1.3.14.exe dist/subcast-v1.3.14-windows.zip --title "v1.3.14 Release" --notes "..."`
