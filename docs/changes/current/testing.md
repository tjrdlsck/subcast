# Testing & Verification Strategy: CHG-040-fix-permission-error-appdata-path

## 1. 검증 시나리오 및 절차

### 1.1 소스 코드 경로 검증
- `backend/main.py` 내 `backgrounds_dir`이 `SUBCAST_DATA_DIR` 환경변수를 올바르게 참조하는지 정적 코드 검증

### 1.2 재빌드 및 Release 업로드 검증
- `dist/Subcast_Setup_v1.3.13.exe` 및 `dist/subcast-v1.3.13-windows.zip` 재생성 확인
- `rtk gh release view v1.3.13` 명령으로 갱신된 자산 타임스탬프 및 등재 여부 확인
