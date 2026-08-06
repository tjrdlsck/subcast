# Tasks Breakdown: CHG-040-fix-permission-error-appdata-path

## 1. 구현 태스크 목록

- [x] **Task 1: backend/main.py 경로 수정**
  - `backgrounds_dir`을 `Path(os.environ.get("SUBCAST_DATA_DIR", ".")) / "data" / "backgrounds"`로 수정

- [x] **Task 2: 패키징 파이프라인 재실행**
  - `python build_all.py` 실행하여 바이너리 및 패키지 갱신

- [x] **Task 3: GitHub Release v1.3.13 자산 덮어쓰기 교체**
  - `rtk gh release upload v1.3.13` 실행 (`--clobber`)
