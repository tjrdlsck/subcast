# Impact Analysis: CHG-018-fix-monitor-viewer-aspect-ratio-distance

- **Change ID**: `CHG-018-fix-monitor-viewer-aspect-ratio-distance`
- **Date**: 2026-08-01
- **Status**: APPROVED

## 1. 변경 범위 (Scope)

### Allowed Scope
- `frontend/js/viewer.js`: `renderMonitorViewerLayout()` 및 `renderMonitorCustomElements()` 16:9 Aspect-Fit 스테이지 투영 수식 적용
- `docs/changes/CHG-018-fix-monitor-viewer-aspect-ratio-distance/`
- `docs/project-state.md`

### Protected Scope
- `backend/`
- `frontend/editor.html`
- `frontend/monitor.html`
- `frontend/js/modules/editor-monitor.js`
- `run.py`
- 기타 지정되지 않은 모든 모듈

## 2. 잠재적 영향 및 위험 요소
- **레터박싱 배경색**: 16:9 스테이지 영역 바깥의 잉여 공간(Pillarbox / Letterbox)은 깔끔하게 검은색(#000000)으로 배경 유지되어야 함.
- **폰트 스케일 균일성**: 폰트 크기 계산 시 가로폭 단일 기준이 아닌 16:9 스테이지 비율 스케일(`scale = stageW / 768`)을 적용하여 글자 이격감 제거.

## 3. 검증 계획
- 모니터링 페이지(`monitor.html`) 접속 테스트.
- 브라우저 창 크기를 16:9, 16:10, 창모드 등으로 변경하여 에디터 캔버스와 렌더링 결과(위치, 비율, 폰트크기, 거리감) 1:1 비교 검증.
- 자동화 테스트 `tests/test_monitor_aspect_ratio.py` 작성 및 실행.
