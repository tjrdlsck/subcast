# Tasks Breakdown: CHG-037 무대 모니터 가이드 박스 고정 더미 텍스트화 및 PiP 실시간 연동 UX 개선

## Task 1: 메인 캔버스 가이드 박스 더미 텍스트화 및 최소 규격 설정
- **목표**: `editor-monitor.js`의 `getInitialSlideTexts()` 및 `enterMonitorMode()`에서 실제 슬라이드 가변 텍스트 대신 표준 가이드 더미 텍스트를 할당하고 최소 박스 규격(`minWidth`, `minHeight`) 부여.
- **대상 파일**: `frontend/js/modules/editor-monitor.js`
- **검증**: 무대 모니터 탭 진입 시 고정 가이드 텍스트가 표시되고 박스 조작이 용이한지 확인.

## Task 2: 레이아웃 정보만 동기화 보장 및 브로드캐스트 검증
- **목표**: `syncCanvasToMonitorSettings()`에서 더미 텍스트 내용이 실제 슬라이드 데이터를 덮어쓰지 않고 위치/크기/스타일 속성만 전송함을 보장.
- **대상 파일**: `frontend/js/modules/editor-monitor.js`
- **검증**: `broadcastMonitorPreviewSettings()` 전송 페이로드 확인.

## Task 3: 단위 및 통합 테스트 작성 및 실행
- **목표**: 가이드 박스 생성, 속성 동기화, 더미 텍스트 적용 방식을 검증하는 파이썬/JS 단위 테스트 작성.
- **대상 파일**: `tests/test_stage_monitor_guide_box.py`
- **검증**: `pytest tests/test_stage_monitor_guide_box.py` 통과 확인.
