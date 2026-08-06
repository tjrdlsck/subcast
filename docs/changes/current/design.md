# Technical Design: CHG-040-fix-permission-error-appdata-path

## 1. 코드 수정 설계

### `backend/main.py`
```python
# 기존 (상대 경로 하드코딩 - Program Files 실행 시 PermissionError 유발)
backgrounds_dir = Path("data/backgrounds")

# 변경 (SUBCAST_DATA_DIR 환경변수 참조)
app_data_dir = Path(os.environ.get("SUBCAST_DATA_DIR", "."))
backgrounds_dir = app_data_dir / "data" / "backgrounds"
```

## 2. 재빌드 및 Release Clobber 플로우
1. `backend/main.py` 경로 수정
2. `python build_all.py` 패키징 파이프라인 수행
3. `rtk gh release upload v1.3.13 dist/Subcast_Setup_v1.3.13.exe dist/subcast-v1.3.13-windows.zip --clobber`로 릴리즈 자산 교체
