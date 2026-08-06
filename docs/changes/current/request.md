# Change Request: CHG-041-fix-root-url-redirect-to-static-index

## 1. 변경 요청 배경 및 목적
- **루트 URL 접속 시 프론트엔드 미출력 해결**: 사용자가 `http://127.0.0.1:8000/` 접속 시 단순 JSON 텍스트 대신 메인 웹 애플리케이션 화면인 `http://127.0.0.1:8000/static/index.html`로 자동 이동(Redirect)되도록 수정합니다.
- **오픈 브라우저 UX 개선**: 프로그램 시작 및 트레이 아이콘 메뉴에서 브라우저 열기 실행 시 사용자에게 바로 Subcast 메인 화면이 표시되도록 보장합니다.

## 2. 주요 변경 요청 사항
1. `backend/main.py`의 `@app.get("/")` 핸들러에서 `RedirectResponse(url="/static/index.html")` 반환하도록 변경
2. `run.py`의 브라우저 오픈 URL을 `http://127.0.0.1:8000/static/index.html`로 직접 보장
3. `python build_all.py` 파이프라인을 실행하여 단일 EXE 인스톨러 및 무설치 ZIP 패키지 재빌드
4. `rtk gh release upload v1.3.13` 실행하여 릴리즈 자산 갱신
