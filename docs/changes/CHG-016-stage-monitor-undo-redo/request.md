# Change Request: 무대 모니터 편집 시 Ctrl+Z / Ctrl+Shift+Z 되돌리기/다시실행 지원

- **Change ID**: `CHG-016-stage-monitor-undo-redo`
- **Request Date**: 2026-08-01
- **Status**: APPROVED

## 1. 개요 및 배경
에디터 페이지에서 무대 모니터 탭(`panel-monitor`)을 선택하고 가이드 박스(🔴 CURRENT / 🔵 NEXT)의 위치/크기/폰트 속성을 변경하거나, 커스텀 도형/이미지를 추가/이동/삭제할 때, 단축키 `Ctrl+Z` (Undo) 및 `Ctrl+Shift+Z` (Redo) 기능이 무대 모니터 편집 상태에 대해 동작하지 않는 문제가 발생하고 있습니다.

## 2. 요구사항
1. 무대 모니터 편집 모드(`isMonitorMode` 활성화 상태)에서 캔버스 요소(가이드 박스, 커스텀 요소 등) 변형, 추가, 삭제 시 무대 모니터 전용 Undo/Redo 이력이 히스토리 스택에 저장되어야 합니다.
2. `Ctrl+Z` (또는 `Cmd+Z`) 입력 시 무대 모니터 편집의 이전 상태로 되돌리기(Undo)가 정상 실행되어 캔버스 객체 상태, `monitorSettings`, 미리보기 및 인스펙터 UI가 업데이트되어야 합니다.
3. `Ctrl+Shift+Z` (또는 `Cmd+Shift+Z`) 입력 시 무대 모니터 편집의 다시실행(Redo)이 정상 실행되어야 합니다.
4. 무대 모니터 탭 이탈 시 히스토리 상태가 섞이지 않도록 모니터 모드 전용 undo/redo 스택 및 가드를 격리 관리해야 합니다.

## 3. 성공 기준
- 무대 모니터 탭에서 객체 이동/크기조절/도형추가/삭제 후 `Ctrl+Z` 누르면 직전 상태로 복원됨.
- `Ctrl+Shift+Z` 누르면 되돌렸던 조작이 다시 적용됨.
- 기존 슬라이드 편집 캔버스의 Undo/Redo 기능에 오작동이나 영향을 주지 않음.
