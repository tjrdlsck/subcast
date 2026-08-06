# Change Request: CHG-044-version-bump-build-and-release

## 1. Request Details
- **Change ID**: `CHG-044-version-bump-build-and-release`
- **Request Date**: 2026-08-06
- **Requester**: User
- **Status**: IN_PROGRESS

## 2. Problem Statement
최근 찬양 배경 동영상 업로드 버그 수정(`CHG-043`) 등 최신 소스 변경 사항이 배포용 바이너리에 반영되지 않음.
기업 환경에서 단일 EXE 파일로 설치할 수 있어야 하며, 기존 사용자는 별도 EXE 설치 없이 인앱 자동 업데이트(ZIP 기반)가 지원되어야 함.

## 3. Objective & Scope
- **목표**: 
  1. `version.txt`를 `1.3.14`로 업데이트.
  2. `build_all.py` 파이프라인을 실행하여 단일 EXE 인스톨러(`Subcast_Setup_v1.3.14.exe`) 및 인앱 자동 업데이트 패키지(`subcast-v1.3.14-windows.zip`) 패키징.
  3. GitHub CLI(`gh`)를 활용하여 GitHub Release `v1.3.14` 태그/릴리즈 생성 및 아티팩트 업로드.
- **Allowed Scope**:
  - `docs/project-state.md`
  - `docs/changes/current/*`
  - `version.txt`
  - `setup.iss`
  - `build_all.py`
  - `dist/`
- **Protected Scope**:
  - `backend/`
  - `frontend/`
  - `tests/`

## 4. Proposed Solution Overview
- `version.txt` 버전을 `1.3.14`로 수정.
- `venv\Scripts\python.exe build_all.py`를 실행하여 PyInstaller 바이너리 빌드, 자동 업데이트용 ZIP 생성, Inno Setup 단일 인스톨러 EXE 컴파일 수행.
- `gh release create v1.3.14 dist/Subcast_Setup_v1.3.14.exe dist/subcast-v1.3.14-windows.zip` 명령으로 릴리즈 및 업로드 수행.
