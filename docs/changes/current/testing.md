# Testing Strategy: CHG-044-version-bump-build-and-release

## 1. Build Verification
- `dist/Subcast_Setup_v1.3.14.exe` 파일 생성 및 용량 정상 확인
- `dist/subcast-v1.3.14-windows.zip` 파일 생성 및 압축 구조 확인

## 2. Release & Artifact Verification
- `gh release view v1.3.14` 실행 결과 확인
- Release 자산 목록에 EXE 인스톨러 및 ZIP 패키지 존재 확인
