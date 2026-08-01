# Change Request: CHG-022-fix-backend-monitor-settings-persistence

## 요청 정보
- **요청자**: 사용자
- **작성일**: 2026-08-01
- **상태**: PROPOSED

## 요청 내용
무대 모니터 탭에서 텍스트 색상, 테두리 색상, 테두리 두께, 글꼴 스타일, 투명도 등의 속성을 변경하고 저장 버튼을 눌렀을 때, 백엔드 데이터베이스 및 API 영속화 저장 로직이 누락되어 있어 모니터 페이지 열기나 새로고침 시 변경한 속성 정보가 완전히 초기화/증발하는 버그 수정.

## 현상 및 원인
1. **현상**: 에디터에서 속성 변경 후 조작 시 메모리 상 및 임시 미리보기로는 표시되나, "저장" 버튼 클릭 후 새로고침하거나 모니터링 페이지(`monitor.html`)를 열면 설정했던 색상/테두리/두께 정보가 지워지고 사라짐.
2. **원인**:
   - 백엔드 DB 테이블 (`backend/database.py`): `monitor_settings` 테이블 컬럼 및 `init_monitor_db()` 마이그레이션에 `stroke_color`, `stroke_width`, `font_style`, `opacity` (current/next 각각) 컬럼이 아예 존재하지 않음.
   - 백엔드 리포지토리 (`backend/monitor_repository.py`): `get_settings()`와 `update_settings()`에서 `strokeColor`, `strokeWidth`, `fontStyle`, `opacity` 항목을 읽거나 DB UPDATE에 포함시키지 않고 쳐냄.
   - 백엔드 Pydantic 스키마 (`backend/routers/monitor.py`): `MonitorBoxSchema` 모델에 해당 필드들이 선언되어 있지 않음.

## 해결 방향
1. `backend/database.py`: `monitor_settings` 테이블 생성 쿼리 및 `init_monitor_db()`에 `current_stroke_color`, `current_stroke_width`, `current_font_style`, `current_opacity`, `next_stroke_color`, `next_stroke_width`, `next_font_style`, `next_opacity` DB 컬럼 및 마이그레이션 추가.
2. `backend/monitor_repository.py`: `get_settings()` 읽기 쿼리 및 `update_settings()` UPDATE 쿼리에 신규 컬럼들을 포함시켜 백엔드 SQLite DB에 완벽히 영속 저장.
3. `backend/routers/monitor.py`: `MonitorBoxSchema`에 `strokeColor`, `strokeWidth`, `fontStyle`, `opacity` 필드 추가.
