# Change Request: CHG-011-fix-monitor-default-shape-and-realtime-preview

## 1. 개요 (Overview)
무대 모니터 에디터 탭 진입 시 불필요하게 나타나던 원형(circle) 도형 기본값 잔여 요소를 제거하고, 에디터 내 PIP 미리보기 박스(`pip-monitor-preview-box`)는 저장하지 않아도 캔버스 이동/리사이즈를 실시간 반영하도록 개선하며, 실제 외부 송출 모니터링 페이지(`monitor.html?channel=monitor`)는 저장된 레이아웃으로만 출력되도록 분리합니다.

## 2. 변경 요청 내역 (Request Details)
1. **기본값 동그라미 잔여물 제거 및 테스트 데이터 오염 방지**:
   - 기존 DB(`GAE_Bible.db`)의 `custom_elements`에 저장되어 있던 테스트용 원형(circle) 데이터를 제거하여 기본 상태에서 원이 표시되지 않게 수정.
   - `test_monitor_custom_elements.py` 실행 시 메인 DB 오염을 방지하도록 테스트 후 원복(Cleanup) 로직 추가.
2. **PIP 미리보기 박스 실시간 연동 (`pip-monitor-preview-box`)**:
   - 에디터 내 PIP iframe(`channel=preview`)은 캔버스에서 가이드 박스나 요소를 드래그/리사이즈할 때 저장 버튼을 누르지 않아도 움직임을 실시간으로 쫓아가도록 개선.
3. **외부 송출 모니터링 페이지 분리 (`monitor.html?channel=monitor`)**:
   - 외부 송출 화면(`channel=monitor`)은 캔버스 실시간 드래그 중인 미완성 데이터를 수신하지 않고, 오직 사용자가 "레이아웃 저장" 버튼을 눌렀을 때 전달되는 `MONITOR_LAYOUT_UPDATE`만 반영.
