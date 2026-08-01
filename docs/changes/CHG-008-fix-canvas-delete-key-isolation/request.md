# Change Request: CHG-008-fix-canvas-delete-key-isolation

## 1. 개요 (Overview)
캔버스 배경(빈 영역)을 클릭하거나 무대 모니터 모드에서 `Delete` 키를 눌렀을 때, 슬라이드 삭제 팝업("선택한 N개의 슬라이드를 삭제하시겠습니까?")이 의도치 않게 발생하는 문제를 개선합니다.

## 2. 변경 요청 내역 (Request Details)
- 무대 모니터 모드(`isMonitorMode()`) 또는 무대 모니터 탭(`panel-monitor`)이 활성화되어 있는 경우, `Delete` 키 입력 및 삭제 버튼 클릭 시 슬라이드가 삭제되지 않도록 전면 차단 및 독립적으로 분리.
- 무대 모니터 모드에서 객체가 선택되지 않았거나 캔버스 배경 클릭 상태일 경우 `Delete` 키 입력 시 슬라이드 삭제 팝업 없이 안전하게 무반응 처리.
