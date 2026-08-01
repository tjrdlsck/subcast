# Impact Analysis: CHG-016-stage-monitor-undo-redo

- **Change ID**: `CHG-016-stage-monitor-undo-redo`
- **Date**: 2026-08-01
- **Status**: APPROVED

## 1. 변경 범위 (Scope)

### Allowed Scope
- `frontend/js/modules/editor-monitor.js`: 무대 모니터 전용 Undo/Redo 스택 관리, 히스토리 스냅샷 저장 및 복원 메소드 (`saveMonitorStateToHistory`, `undoMonitor`, `redoMonitor`) 노출
- `frontend/js/modules/editor-history.js`: 슬라이드 Undo/Redo 분기 처리 검토 및 필요시 모니터 Undo/Redo 위임 연동
- `frontend/js/modules/editor-init.js`: 키보드 단축키(`Ctrl+Z`, `Ctrl+Shift+Z`) 이벤트 발생 시 모니터 모드 여부에 따른 `undo`/`redo` 분기 연동
- `docs/changes/CHG-016-stage-monitor-undo-redo/`
- `docs/project-state.md`

### Protected Scope
- `backend/`
- `frontend/monitor.html`
- `frontend/viewer.html`
- `frontend/js/viewer.js`
- `run.py`
- 기타 언급되지 않은 소스 모듈

## 2. 잠재적 영향 및 위험 요소
- **슬라이드 Undo 히스토리 오염**: 무대 모니터 탭 동작 시 일반 슬라이드의 `undoStack`에 영향이 가지 않도록 완벽히 스택을 분리해야 함.
- **가이드 박스 참조 손실**: Undo/Redo 실행 후 `currentGuideBox` 및 `nextGuideBox` 객체 참조가 최신 캔버스 객체와 연결되어야 함.
- **실시간 미리보기 연동**: Undo/Redo로 레이아웃이 복원되었을 때 `syncCanvasToMonitorSettings()`, `updateInfoUI()`, `broadcastMonitorPreviewSettings()`가 자동 호출되어 반영되어야 함.

## 3. 검증 계획
- 무대 모니터 탭 진입 -> 가이드 박스 이동 및 크기 조절 -> Ctrl+Z / Ctrl+Shift+Z 검증.
- 도형/이미지 추가 후 삭제 -> Ctrl+Z / Ctrl+Shift+Z 검증.
- 일반 슬라이드 탭으로 전환 후 일반 슬라이드 Ctrl+Z / Ctrl+Shift+Z 영향 없음 확인.
