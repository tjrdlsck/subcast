# Technical Design: CHG-022-fix-backend-monitor-settings-persistence

## 1. 개요 및 목적
무대 모니터 탭에서 설정한 글자/테두리 색상, 두께, 글꼴 스타일, 투명도 등의 속성이 백엔드 SQLite DB 및 REST API를 거쳐 영구적으로 저장되고, 새로고침 및 외부 모니터링 페이지(`monitor.html`) 로드 시 100% 원본 그대로 복원되도록 영속화(Persistence) 스키마 및 리포지토리 로직을 수정함.

## 2. 세부 설계 (Technical Detail)

### A. DB Schema 및 Migration (`backend/database.py`)
- `CREATE_MONITOR_SETTINGS_TABLE` 및 `init_monitor_db()` 컬럼 확장:
  - `current_stroke_color`: `TEXT DEFAULT 'transparent'`
  - `current_stroke_width`: `INTEGER DEFAULT 0`
  - `current_font_style`: `TEXT DEFAULT 'normal'`
  - `current_opacity`: `REAL DEFAULT 1.0`
  - `next_stroke_color`: `TEXT DEFAULT 'transparent'`
  - `next_stroke_width`: `INTEGER DEFAULT 0`
  - `next_font_style`: `TEXT DEFAULT 'normal'`
  - `next_opacity`: `REAL DEFAULT 1.0`
- `init_monitor_db()` 내 `PRAGMA table_info` 마이그레이션 테이블에 위 8개 필드를 추가하여 기존 설치 환경에서도 자동으로 컬럼이 추가되도록 작성.

### B. Repository 저장/조회 연결 (`backend/monitor_repository.py`)
- `get_settings()`: DB 행에서 `strokeColor`, `strokeWidth`, `fontStyle`, `opacity` 값을 읽어 `currentBox` 및 `nextBox` 딕셔너리에 매핑 반환.
- `update_settings()`: `UPDATE monitor_settings SET ...` 바인딩 파라미터에 `strokeColor`, `strokeWidth`, `fontStyle`, `opacity` 추가 및 저장.

### C. FastAPI Router Schema 확장 (`backend/routers/monitor.py`)
- `MonitorBoxSchema` Pydantic 모델:
  ```python
  class MonitorBoxSchema(BaseModel):
      leftPct: Optional[float] = 5.0
      topPct: Optional[float] = 5.0
      widthPct: Optional[float] = 90.0
      heightPct: Optional[float] = 42.0
      fontSize: Optional[int] = 28
      textColor: Optional[str] = "#FFFFFF"
      strokeColor: Optional[str] = "transparent"
      strokeWidth: Optional[int] = 0
      bgColor: Optional[str] = "transparent"
      isTransparentBg: Optional[bool] = True
      fontWeight: Optional[str] = "bold"
      fontStyle: Optional[str] = "normal"
      fontFamily: Optional[str] = "Inter"
      textAlign: Optional[str] = "center"
      opacity: Optional[float] = 1.0
  ```

## 3. 검증 계획
- `tests/test_monitor_backend_persistence.py` 작성:
  - 백엔드 `update_monitor_settings` 호출 후 `get_monitor_settings`를 통해 `strokeColor`, `strokeWidth`, `fontStyle`, `opacity` 속성이 DB에 저장되고 정상 반환되는지 백엔드 단위/통합 테스트 검증.
