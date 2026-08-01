# Tasks Breakdown: CHG-022-fix-backend-monitor-settings-persistence

## Task 1: 백엔드 DB Schema & Migration 확장
- [x] `backend/database.py`: `CREATE_MONITOR_SETTINGS_TABLE` 및 `init_monitor_db()` 마이그레이션에 strokeColor, strokeWidth, fontStyle, opacity (current/next) 컬럼 추가

## Task 2: 백엔드 Repository & Router Schema 업데이트
- [x] `backend/monitor_repository.py`: `get_settings()` 및 `update_settings()` SQL 바인딩 및 매핑 확장
- [x] `backend/routers/monitor.py`: `MonitorBoxSchema` Pydantic 모델 필드 확장

## Task 3: 종합 백엔드 및 통합 테스트 검증
- [x] `tests/test_monitor_backend_persistence.py` 작성 및 테스트 구동 (16개 백엔드/프론트엔드 통합 테스트 100% 통과)
- [x] `docs/project-state.md` 갱신
