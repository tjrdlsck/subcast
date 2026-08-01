# Module Map

## 주요 모듈 목록

| 모듈 | 진입점 | 책임 | 의존 대상 |
|---|---|---|---|
| Main App Launcher | `run.py` | 서버 구동, 시스템 트레이 및 통합 프로세스 관리 | `backend/main.py` |
| API Layer | `backend/main.py`, `backend/routers/` | HTTP REST 및 WebSocket 엔드포인트 수신 | `services`, `storage`, `database` |
| Domain Services | `backend/services/` | 비즈니스 로직 및 미디어/자막 처리 | `database`, `storage` |
| Data Layer | `backend/database.py`, `backend/monitor_repository.py` | SQLite DB 쿼리 및 리포지토리 패턴 | `sqlite3`, `GAE_Bible.db` |
| Frontend UI | `frontend/js/`, `frontend/*.html` | 사용자 인터페이스 뷰 및 이벤트 처리 | API Layer |

## 의존 방향

```text
frontend (UI Layer)
  ↓ HTTP / WebSocket
backend/routers & main.py (Controller/API Layer)
  ↓
backend/services (Service Layer)
  ↓
backend/database.py & repository (Data Access Layer)
  ↓
SQLite DB (GAE_Bible.db) & File Storage
```

## 변경 위험이 높은 모듈

| 모듈 | 이유 |
|---|---|
| `backend/main.py` | 로직 집중도가 매우 높아 개별 엔드포인트 수정 시 사이드 이펙트 유의 필요 |
| `backend/storage.py` | 미디어 파일 경로 및 저장소 리소스 동시 접근 유의 |
