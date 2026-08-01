# Change Request: CHG-026-fix-monitor-text-occlusion-and-editor-live-sync

## 1. 개요 (Overview)
- **Change ID**: `CHG-026-fix-monitor-text-occlusion-and-editor-live-sync`
- **요청 사항**:
  1. 모니터 페이지 버그 수정: 모니터 페이지에서 커스텀 요소 레이어(배경 박스/도형 등)로 인해 다음 슬라이드 내용(텍스트 박스)이 가려지는 문제 해결.
  2. 에디터 슬라이드 선택 시 모니터 변경 차단: 에디터 페이지에서 슬라이드 목록의 슬라이드를 클릭/선택했을 때 모니터링 페이지(출력 화면) 내용이 바뀌는 문제 제거. 모니터링 출력은 프레젠터(Presenter) 라이브 송출 상태일 때만 전환되어야 함.

## 2. 배경 및 필요성 (Background)
- **모니터 텍스트 가림 버그**: `#monitor-custom-elements-layer`의 `z-index`가 5로 지정된 반면, `#monitor-current-card`와 `#monitor-next-card`에는 `z-index`가 지정되어 있지 않아, 커스텀 배경 도형/상자가 텍스트 카드 상단에 배치되어 다음 슬라이드 텍스트 내용이 가려짐.
- **에디터 슬라이드 선택 시 화면 전환 문제**: `editor-slides.js`의 `selectSlideForEdit()` 함수에서 슬라이드 클릭 시 `notifyMonitorSlideChange()`를 호출하여 BroadcastChannel로 `SLIDE_CHANGE` 이벤트를 방송함. 이로 인해 모니터링 화면이 에디터 편집용 선택에 동기화되어 라이브 방송 도중 수정 시 사고 위험이 존재함.

## 3. 목표 (Goals)
- モ니터 뷰어 및 에디터 캔버스에서 `monitor-current-card`, `monitor-next-card`의 z-index를 최상위(z-index: 10)로 높이고 커스텀 요소 레이어(`monitor-custom-elements-layer`)를 배경(z-index: 1)으로 배치하여 텍스트가 가려지는 현상 완전 방지.
- `editor-slides.js`에서 슬라이드 클릭/편집(`selectSlideForEdit`) 시 BroadcastChannel을 통한 모니터 화면 슬라이드 변경 전송(`notifyMonitorSlideChange`)을 차단하여, 프레젠터 라이브 웹소켓 송출 시에만 모니터 화면이 전환되도록 수정.
- 단위 테스트 작성으로 레이어 z-index 구조 및 에디터 선택 시 라이브 송출 비격리 문제 방지 검증.
