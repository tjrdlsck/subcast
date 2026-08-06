# Impact Analysis: CHG-040-fix-permission-error-appdata-path

## 1. 영향 범위 분석 (Impact Analysis)
- **수정 대상 파일**: `backend/main.py`
- **영향 범위**: 배경 디렉터리(`backgrounds_dir`) 및 배경 메타데이터 파일(`meta.json`)의 저장 위치가 상대 경로 `data/backgrounds`에서 `%APPDATA%\Subcast\data\backgrounds`로 변경됩니다.
- **안전성**: `run.py`에서 이미 `SUBCAST_DATA_DIR`를 `%APPDATA%\Subcast`로 주입하고 있으므로, `backend/storage.py` 등 다른 모듈과 경로 일관성이 달성됩니다.

## 2. Scope Boundaries

### Allowed Scope
- `backend/main.py`
- `docs/project-state.md`
- `docs/changes/current/*`

### Protected Scope
- `backend/database.py`
- `backend/schemas.py`
- `frontend/`
- `tests/`
- `requirements.txt`
