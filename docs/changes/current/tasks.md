# Tasks Breakdown: CHG-041-fix-root-url-redirect-to-static-index

## 1. 구현 태스크 목록

- [x] **Task 1: backend/main.py 및 run.py 리다이렉트 경로 수정**
  - `backend/main.py` 내 `@app.get("/")`에서 `RedirectResponse(url="/static/index.html")` 리턴
  - `run.py` 내 `webbrowser.open` URL을 `/static/index.html`로 업데이트

- [x] **Task 2: 패키징 파이프라인 재실행**
  - `python build_all.py` 실행

- [x] **Task 3: GitHub Release v1.3.13 자산 교체 업로드**
  - `rtk gh release upload v1.3.13` 실행 (`--clobber`)
