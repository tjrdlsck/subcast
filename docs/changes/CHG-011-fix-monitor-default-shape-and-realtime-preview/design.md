# Change Design: CHG-011-fix-monitor-default-shape-and-realtime-preview

## 1. 기술적 해결 방안 (Technical Solution)

### 1.1 모니터링 기본값 원형(circle) 잔여물 제거 및 테스트 격리
- DB(`GAE_Bible.db`)의 `monitor_settings` 테이블 `custom_elements` 컬럼을 `[]`로 업데이트하여 초기 진입 시 원형 도형이 나오지 않도록 초기화.
- `tests/test_monitor_custom_elements.py` 테스트 종료 후 DB의 `customElements`를 빈 배열 `[]`로 복원하여 테스트 실행 후에도 메인 DB가 오염되지 않도록 보장.

### 1.2 PIP 미리보기 박스 실시간 연동 (`editor.html`, `editor-monitor.js`)
- `frontend/editor.html`의 `#pip-monitor-iframe` `src` 속성을 `/static/monitor.html?channel=preview`로 설정.
- `editor-monitor.js`의 `handleGuideModified` 및 `handleCustomObjectChanged` 이벤트 발생 시 `broadcastMonitorPreviewSettings()` 함수를 호출하여 `MONITOR_PREVIEW_UPDATE` 메시지를 BroadcastChannel로 실시간 전송.

### 1.3 외부 송출 모니터링 뷰어와 미리보기 채널 분리 (`viewer.js`)
- `frontend/js/viewer.js`에서 URL parameter `channel`을 파악:
  - `channel === 'preview'`: `MONITOR_PREVIEW_UPDATE` 및 `MONITOR_LAYOUT_UPDATE` 메시지를 모두 수신하여 에디터 캔버스 조작 시 저장하지 않아도 PIP 박스에서 실시간으로 위치/크기 변화를 렌더링.
  - `channel === 'monitor'`: `MONITOR_PREVIEW_UPDATE` 메시지는 무시하고, 사용자가 "레이아웃 저장"을 눌렀을 때만 발생하는 `MONITOR_LAYOUT_UPDATE` 메시지 및 LocalStorage 저장 이벤트만 반영.
