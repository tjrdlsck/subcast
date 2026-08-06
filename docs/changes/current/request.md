# Change Request: CHG-039-enterprise-installer-and-release-packaging

## 1. 변경 요청 배경 및 목적
- **기업형 단일 EXE 설치 파일 배포**: 복잡한 압축 해제 과정 없이 `Subcast_Setup_v1.3.13.exe` 단일 설치 파일 실행만으로 프로그램이 깔끔하게 설치되도록 합니다.
- **인앱 무설치 자동 업데이트 보장**: 사용자가 별도로 EXE 재설치를 진행하지 않더라도, 백엔드의 자동 업데이트 로직(`/api/system/check-update`, `/api/system/auto-update`)을 통해 `subcast-v1.3.13-windows.zip` 파일 기반으로 즉시 업데이트가 이루어지도록 릴리즈 패키지를 동시 생성합니다.
- **사용자 데이터 보존 및 마이그레이션 편의성**: Inno Setup 설치 시 기존 사용자의 성경/찬송가 및 개인 설정 데이터(`GAE_Bible.db` 등)가 덮어씌워지지 않고 보존되도록 인스톨러 규칙을 적용합니다.
- **민감/개발 데이터 제외**: 개발 작업 폴더 내의 개인 프로젝트, 임시 테스트 데이터(`data/projects/`, `data/project_data.json` 등)가 패키징에 포함되지 않도록 빌드 대상을 격리합니다.
- **GitHub Release 자동 업로드**: GitHub CLI (`gh release create`)를 활용하여 릴리즈 자산(Executable Installer 및 Update Zip)을 `v1.3.13` 태그로 자동 업로드합니다.

## 2. 주요 변경 요청 사항
1. `version.txt` 및 버전 정의 파일들의 버전을 `1.3.13`으로 업데이트
2. `build_all.py` 및 PyInstaller/Inno Setup 빌드 파이프라인 수행
3. 빌드 결과물 검증:
   - `dist/Subcast_Setup_v1.3.13.exe` (단일 EXE 인스톨러)
   - `dist/subcast-v1.3.13-windows.zip` (자동 업데이트용 무설치 패키지)
4. GitHub Release `v1.3.13` 생성 및 빌드 결과물 2종 업로드 (`rtk gh release create`)

## 3. 요구사항 출처 및 문서화 상태
- 사용자 명시적 요구사항: "기업에서 배포하듯이 exe 파일 하나로 설치 가능하게 해줘. 업데이트도 따로 exe 파일 설치 없이 진행할 수 있어야 해. 다 만들어지면 릴리즈에 업로드해줘. gh 명령어 활용해."
