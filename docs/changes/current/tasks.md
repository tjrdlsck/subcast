# Tasks Breakdown: CHG-039-enterprise-installer-and-release-packaging

## 1. 구현 태스크 목록

- [x] **Task 1: 버전 1.3.13 업데이트 및 사전 검증**
  - `version.txt`를 `1.3.13`으로 수정
  - `setup.iss` 및 `build_all.py` 버전 호환성 검증

- [x] **Task 2: 패키징 파이프라인 수행 (PyInstaller + Inno Setup)**
  - `python build_all.py` 실행
  - `dist/Subcast_Setup_v1.3.13.exe` 생성 확인
  - `dist/subcast-v1.3.13-windows.zip` 생성 확인

- [x] **Task 3: 패키징 검증 및 데이터 격리 확인**
  - 생성된 산출물 크기 및 구성 요소 점검
  - 개발자 임시/테스트 데이터 포함 여부 점검

- [x] **Task 4: GitHub Release 생성 및 업로드**
  - `rtk gh release create v1.3.13` 실행
  - GitHub Release에 파일 2종 정상 등재 확인
