# Change Request: CHG-040-fix-permission-error-appdata-path

## 1. 변경 요청 배경 및 목적
- **PermissionError [WinError 5] 해결**: Inno Setup 설치 후 `C:\Program Files (x86)\Subcast` 디렉터리에서 앱 실행 시, `backend/main.py` 라인 69의 상대 경로 `Path("data/backgrounds")` 생성 시도로 인한 권한 에러를 해결합니다.
- **AppData 사용자 디렉터리 참조 일관성 확보**: `SUBCAST_DATA_DIR` 환경 변수(`%APPDATA%\Subcast`)를 참조하도록 수정하여, 모든 애플리케이션 데이터(DB, 프로젝트 JSON, 배경 파일 등)가 일반 사용자 쓰기 권한이 보장되는 위치에 저장되도록 개선합니다.
- **GitHub Release v1.3.13 자산 갱신**: 해당 핫픽스를 반영하여 릴리즈 바이너리(`Subcast_Setup_v1.3.13.exe` 및 `subcast-v1.3.13-windows.zip`)를 재빌드하고 GitHub Release 자산을 덮어써서 업데이트합니다.

## 2. 주요 변경 요청 사항
1. `backend/main.py`의 `backgrounds_dir` 경로 정의를 `Path(os.environ.get("SUBCAST_DATA_DIR", ".")) / "data" / "backgrounds"`로 수정
2. `build_all.py` 빌드 파이프라인 재실행
3. GitHub Release `v1.3.13` 릴리즈 자산 교체 재업로드 (`rtk gh release upload --clobber`)
