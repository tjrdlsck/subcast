# Design Document: CHG-026-fix-monitor-text-occlusion-and-editor-live-sync

## 1. 기술 변경 설계 (Technical Design)

### Issue 1: 모니터 페이지 다음 슬라이드 텍스트 가림 버그
- **원인**: `viewer.js`의 `renderMonitorViewerLayout()` 및 `renderMonitorCustomElements()`에서 `#monitor-custom-elements-layer`에 `z-index: 5`가 부여되는 반면, `#monitor-current-card`와 `#monitor-next-card`에는 `z-index`가 설정되어 있지 않아 `customLayer`가 텍스트 박스를 덮는 현상 발생.
- **해결 방안**:
  1. `monitor.html` 및 `viewer.js`:
     - `#monitor-current-card`와 `#monitor-next-card`에 `z-index: 10` 및 `position: absolute`를 지정하여 텍스트 박스를 항상 레이어 상위에 위치시킴.
     - `customLayer` (`#monitor-custom-elements-layer`)의 `z-index`를 `1`로 설정하여 커스텀 도형/배경 상자가 텍스트 박스 뒤에 배치되도록 수정.
  2. `editor-monitor.js`:
     - 에디터 캔버스 렌더링 시 `currentGuideBox`와 `nextGuideBox`를 캔버스 레이어 상단으로 유지(`bringToFront()`)하거나, 커스텀 오브젝트가 추가될 때 가이드 박스가 가려지지 않도록 조치.

### Issue 2: 에디터 슬라이드 클릭 시 모니터 화면 동기화 차단
- **원인**: `editor-slides.js`의 `selectSlideForEdit()`에서 슬라이드 선택 시 `notifyMonitorSlideChange(idx)`가 실행되어 `subcast_monitor_channel` BroadcastChannel로 `SLIDE_CHANGE` 이벤트를 전송함.
- **해결 방안**:
  1. `editor-slides.js`의 `selectSlideForEdit()`에서 `notifyMonitorSlideChange(idx)` 호출 로직 제거.
  2. 모니터링 출력 화면은 프레젠터(`presenter.js`)에서 웹소켓으로 보내는 라이브 `SLIDE_CHANGE` 메시지를 받아 `viewer.js`가 `updateMonitorFromProjectData()`를 통해 동기화하도록 유제.
  3. 에디터에서의 슬라이드 선택/편집 작업이 라이브 모니터 화면에 일절 영향을 주지 않도록 격리.

## 2. 데이터 흐름 (Data Flow)
- **프레젠터 라이브 송출 (정상)**:
  `Presenter` -> `WebSocket (SLIDE_CHANGE)` -> `Backend Broadcast` -> `Viewer/Monitor (viewer.js)` -> `updateMonitorFromProjectData()`
- **에디터 슬라이드 클릭 (수정후)**:
  `Editor (selectSlideForEdit)` -> 캔버스 에디터에만 로드 (모니터 브로드캐스트 전송 방지)
