# Current System Overview

## 확인 정보

- 조사한 디렉터리: `backend/`, `frontend/`, `tests/`
- 확인 날짜: 2026-08-01

## 기술 스택

- **Backend**: Python 3, FastAPI (v0.111.0), Uvicorn (v0.30.1), Pydantic (v2.7.4), SQLite (`GAE_Bible.db`)
- **Frontend**: HTML5, CSS3, Vanilla JavaScript (HTML: `editor.html`, `index.html`, `presenter.html`, `viewer.html`, `monitor.html`)
- **Test Framework**: Pytest (v8.2.2), HTTPX
- **Utility / External**: yt-dlp, pystray, Pillow, imageio-ffmpeg

## 애플리케이션 엔트리포인트

| 영역 | 파일 | 역할 |
|---|---|---|
| Main Launcher | `run.py` | FastAPI 서버 및 시스템 트레이/앱 통합 실행 |
| Backend API | `backend/main.py` | FastAPI 메인 라우터 및 비즈니스 로직 |
| Build Script | `build_all.py` | PyInstaller 패키징 및 빌드 자동화 |
| Web Frontend | `frontend/index.html`, `frontend/editor.html` | UI 메인 뷰 및 에디터 웹 인터페이스 |

## 주요 도메인

| 도메인 | 주요 경로 | 주요 책임 |
|---|---|---|
| Database & Repository | `backend/database.py`, `backend/monitor_repository.py` | SQLite DB 조작 및 모니터링 데이터 리포지토리 |
| Storage & File Management | `backend/storage.py` | 미디어 및 자산 파일 저장소 관리 |
| API Routers | `backend/routers/` | 기능별 API 엔드포인트 세분화 |
| Domain Services | `backend/services/` | 핵심 도메인 로직 및 비동기 처리 |

## 주요 실행 흐름

1. `run.py` 실행 시 FastAPI 백엔드 서버(uvicorn)가 비동기로 구동됩니다.
2. 프론트엔드 Web UI(`frontend/*.html`)가 백엔드 API REST/WebSocket 엔드포인트를 호출합니다.
3. 서비스 계층 및 리포지토리를 거쳐 SQLite(`GAE_Bible.db`) 및 로컬 파일 시스템(`backend/storage.py`)과 인터랙션합니다.

## 확인된 사실

- FastAPI 및 HTML/JS 기반의 데스크톱/웹 통합 방송/자막/프레젠테이션 관련 시스템 구조임.
- 단위/통합 테스트는 `tests/` 디렉터리에 분리되어 있음.

## 추정 또는 미확인 사항

- 트레이 아이콘(`pystray`) 및 멀티 모니터 출력 제어 흐름 상세 분석 필요.

## 주요 위험

- `backend/main.py` 파일의 크기가 8만 바이트 이상으로 큼 (리팩토링 및 모듈화 진행 중).
