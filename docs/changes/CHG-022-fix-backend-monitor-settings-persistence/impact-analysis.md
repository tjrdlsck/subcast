# Impact Analysis: CHG-022-fix-backend-monitor-settings-persistence

## 1. 영향 범위 분석 (Impact Analysis)

### Changed System Modules
- `backend/database.py`: `monitor_settings` 테이블 컬럼 추가 및 `init_monitor_db()` 마이그레이션 정의.
- `backend/monitor_repository.py`: `get_settings()`, `update_settings()`에 신규 텍스트 속성 저장/조회 연결.
- `backend/routers/monitor.py`: `MonitorBoxSchema` Pydantic 모델 필드 확장.

### Scope Boundaries
- **Allowed Scope**:
  - `backend/database.py`
  - `backend/monitor_repository.py`
  - `backend/routers/monitor.py`
  - `tests/test_monitor_backend_persistence.py`
  - `docs/changes/CHG-022-fix-backend-monitor-settings-persistence/`
  - `docs/project-state.md`
- **Protected Scope**:
  - `frontend/`
  - `backend/main.py`
  - 기타 지정되지 않은 소스 파일

## 2. 회귀 위험도 (Regression Risks)
- DB 마이그레이션 시 `ALTER TABLE monitor_settings ADD COLUMN ...` 방식을 사용하여 기존 DB 레코드 및 설정 데이터와의 하위 호환성을 100% 보장함.
- 신규 컬럼에 대해 DEFAULT 값(`transparent`, `0`, `normal`, `1.0`)을 지정하므로 기존 데이터 읽기 시 예외 발생 없음.
