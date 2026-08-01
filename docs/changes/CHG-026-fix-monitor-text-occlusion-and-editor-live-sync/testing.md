# Testing Strategy: CHG-026-fix-monitor-text-occlusion-and-editor-live-sync

## 1. 검증 계획 (Verification Plan)

### 수동 검증 항목
1. **모니터 페이지 텍스트 가림 테스트**: 모니터 뷰어 페이지에서 커스텀 배경 도형/박스가 추가된 경우에도 현재 슬라이드 및 다음 슬라이드 텍스트 박스가 가려지지 않고 항상 최상단에 올바르게 표시되는지 확인.
2. **에디터 슬라이드 선택 테스트**: 에디터 페이지에서 슬라이드 목록의 다른 슬라이드를 클릭/편집 선택할 때, 모니터 뷰어 및 라이브 출력 화면의 내용이 변경되지 않고 독립 유지되는지 확인.

### 자동화 테스트 (`tests/test_monitor_text_occlusion_and_live_sync.py`)
1. `monitor.html` 및 `viewer.js` 파일 내 `#monitor-current-card`, `#monitor-next-card`, `#monitor-custom-elements-layer`의 z-index 스타일 설정 검증.
2. `editor-slides.js` 파일 내 `selectSlideForEdit` 함수에서 `notifyMonitorSlideChange` 호출 제거 여부 검증.
