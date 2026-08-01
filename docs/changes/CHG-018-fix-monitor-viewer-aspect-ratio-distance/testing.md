# Testing Strategy: CHG-018-fix-monitor-viewer-aspect-ratio-distance

- **Change ID**: `CHG-018-fix-monitor-viewer-aspect-ratio-distance`
- **Date**: 2026-08-01
- **Status**: APPROVED

## 1. 단위 및 통합 테스트 계획
- `tests/test_monitor_aspect_ratio.py`를 신규 생성하여 16:9 Aspect Fit 스테이지 계산 로직 및 viewer.js 연동 수식의 정확성 검증.

## 2. 수동 테스트 시나리오
1. 모니터링 출력 페이지(`monitor.html`) 접속.
2. 브라우저 창을 16:9, 16:10, 4:3, 창모드 등 다양한 비례로 조절.
3. 에디터 캔버스/미리보기 팝업과 비교하여 요소들의 상대적 위치, 크기, 글자 크기, 거리감이 100% 일치하는지 확인.

## 3. 회귀 테스트 명령어
```bash
$env:PYTHONPATH='.'; .\venv\Scripts\pytest.exe tests/
```
