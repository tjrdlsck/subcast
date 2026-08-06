# Testing & Verification Strategy: CHG-039-enterprise-installer-and-release-packaging

## 1. 검증 시나리오 및 절차

### 1.1 빌드 산출물 생성 검증
- `dist/Subcast_Setup_v1.3.13.exe` 존재 및 10MB 이상의 정상 바이너리 크기 확인
- `dist/subcast-v1.3.13-windows.zip` 존재 및 압축 해제 시 무설치 파이프라인 구조 확인

### 1.2 사용자 데이터 보존 및 마이그레이션 안전성 검증
- `setup.iss` 파일 내 `GAE_Bible.db`가 `onlyifdoesntexist` 플래그로 설정되어 있는지 수동/자동 검증
- 빌드 ZIP 아티팩트 내에 `data/projects/` 등 개발 데이터가 누락(격리)되어 깔끔하게 패키징 되었는지 확인

### 1.3 Release 등재 검증
- `rtk gh release view v1.3.13` 명령어를 실행하여 GitHub Release 태그 생성 및 파일 2종 업로드 완료 여부 확인
