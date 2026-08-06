# Impact Analysis: CHG-039-enterprise-installer-and-release-packaging

## 1. 영향 범위 분석 (Impact Analysis)

### 1.1 시스템 및 파일 영향도
- **버전 파일**: `version.txt` (버전 `1.3.12` -> `1.3.13` 업그레이드)
- **빌드 및 인스톨러 파이프라인**: `build_all.py`, `setup.iss`, `subcast.spec`
- **배포 아티팩트**: `dist/Subcast_Setup_v1.3.13.exe`, `dist/subcast-v1.3.13-windows.zip`
- **외부 연동**: GitHub Release (`gh` CLI API 호출)

### 1.2 사용자 데이터 보존 및 마이그레이션 안전성
- **DB 보존 규칙**: `setup.iss` 내 `GAE_Bible.db`에 `onlyifdoesntexist` 플래그가 지정되어 있어, 재설치 시 사용자의 기존 성경 및 찬양 DB가 보존됩니다.
- **인앱 자동 업데이트**: `subcast-v1.3.13-windows.zip` 패키지는 실행 파일 및 정적 리소스만 포함하며, 실행 시 사용자의 로컬 DB/설정 파일은 건드리지 않으므로 안전한 인앱 패치가 가능합니다.
- **개발/개인데이터 분리**: PyInstaller spec (`subcast.spec`)에서 `data/` 디렉터리의 개별 사용자 프로젝트 및 임시 파일들을 포함시키지 않으므로 깔끔한 배포가 보장됩니다.

## 2. Scope Boundaries

### Allowed Scope
- `version.txt`
- `build_all.py`
- `setup.iss`
- `subcast.spec`
- `docs/project-state.md`
- `docs/changes/current/*`

### Protected Scope
- `backend/`
- `frontend/`
- `tests/`
- `run.py`
- `requirements.txt`
- `.antigravity/rules.md`
- `.agent/agents/product-orchestrator/agent.md`
