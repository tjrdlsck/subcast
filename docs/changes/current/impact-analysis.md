# Impact Analysis: CHG-044-version-bump-build-and-release

## 1. Overview
- **Change ID**: `CHG-044-version-bump-build-and-release`
- **Target Component**: `version.txt`, `dist/`, GitHub Release Asset

## 2. Impact Assessment
- **Affected Files**:
  - `version.txt`
  - `dist/Subcast_Setup_v1.3.14.exe`
  - `dist/subcast-v1.3.14-windows.zip`
- **Non-Affected Areas**:
  - 소스코드 로직 (`backend/`, `frontend/`)
  - DB Schema

## 3. Allowed vs Protected Scope
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

## 4. Risk Mitigation Plan
- 빌드 전 최신 소스 문법 및 릴리즈 태그 존재 여부 사전 확인.
- Inno Setup 및 PyInstaller 정합성 검증.
