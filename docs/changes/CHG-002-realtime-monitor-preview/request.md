# Change Request: CHG-002-realtime-monitor-preview

## 1. 개요
무대 모니터 레이아웃 캔버스에서 가이드 박스(🔴 CURRENT, 🔵 NEXT) 이동/리사이즈 시, 미리보기 및 무대 모니터 화면(`#pip-monitor-iframe`)에 실시간 배치 변경사항을 반영합니다. 설정 저장 버튼을 누를 때만 백엔드 서버 DB 및 LocalStorage에 최종 저장됩니다.

## 2. 요청 내역
1. 캔버스에서 가이드 박스 drag/resize 등 조작 시 `BroadcastChannel`을 통해 실시간 `MONITOR_LAYOUT_UPDATE` 이벤트 방송
2. 미리보기 iframe 및 모니터링 창에 저장 버튼 누르기 전 미리보기 형태 실시간 연동
3. [💾 설정 저장] 버튼 클릭 시 백엔드 API 저장 및 LocalStorage 최종 영구 저장
