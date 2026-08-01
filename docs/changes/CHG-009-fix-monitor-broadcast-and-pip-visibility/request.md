# Change Request: CHG-009-fix-monitor-broadcast-and-pip-visibility

## 1. 개요 (Overview)
무대 모니터링 편집 페이지에서 저장 전 레이아웃 변경 사항이 실시간 방송되는 문제와 현장 배경 PiP 모달이 타 탭으로 이동해도 잔존하는 버그를 수정합니다.

## 2. 변경 요청 내역 (Request Details)
1. **무대 모니터 탭 캔버스 방송 분리**:
   - 무대 모니터 편집 중 가이드 텍스트 및 개체 조작 시 저장 전 실시간 방송(`broadcastMonitorSettings`)이 수행되는 현상 제거.
   - 사용자가 "레이아웃 저장" 버튼을 눌렀을 때만 외부 무대 모니터로 화면 방송(Broadcast)이 이루어지도록 수정.
2. **현장 배경 PiP 모달 노출 탭 제약**:
   - 현장 배경 탭(`panel-stage-bg`) 이탈 시 PiP 프리뷰 모달 (`pip-stage-preview-container`)을 숨기도록 처리.
   - 현장 배경 탭 활성화 시에만 PiP 프리뷰 모달이 노출되도록 보완.
