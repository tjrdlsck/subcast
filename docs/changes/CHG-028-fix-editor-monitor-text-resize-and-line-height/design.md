# Change Design: CHG-028-fix-editor-monitor-text-resize-and-line-height

## 1. 개요 (Overview)
에디터 무대 모니터 탭의 캔버스 텍스트 박스 리사이즈 버그 수정 및 모니터링 페이지 multiline text line-height/padding 보정을 통한 하단 텍스트 잘림 현상 해결 설계입니다.

## 2. 세부 설계 (Detailed Specification)

### A. 에디터 무대 모니터 탭 리사이즈 조작 보정 (`editor-monitor.js`)
1. **실시간 조작 분리 (`syncCanvasToMonitorSettings`)**:
   - `syncCanvasToMonitorSettings(isModifiedEnd = false)` 형태 또는 조건문 처리를 통해, 드래그 진행 중(`scaling`, `resizing`, `moving`)일 때는 `scaleX: 1`, `scaleY: 1` 정규화를 캔버스 객체에 직접 실행하지 않고 bounds 계산 및 `monitorSettings` 동기화/미리보기 방송만 수행합니다.
   - 드래그 완료 시점(`object:modified`)에서만 `boxObj.set({ width: targetPixelWidth, scaleX: 1, scaleY: 1 })` 정규화를 진행합니다.
2. **이벤트 바인딩 추가**:
   - `canvas.on('object:resizing', handleGuideMoving);`를 추가하여 Textbox 좌우 핸들 드래그 시 실시간 반영.

### B. 모니터링 페이지 글자 하단 잘림 해결 (`viewer.css`, `monitor.html`, `viewer.html`, `viewer.js`)
1. **원인 분석**:
   - CSS `-webkit-line-clamp` 및 `overflow: hidden` 사용 시, `line-height: 1.35;`가 좁아 글자의 하단 디센더(Descender: g, p, q, y, j 및 한글 받침 아래 획) 렌더링 영역을 깎아 먹는 증상이 발생함.
2. **해결 방법**:
   - `line-height: 1.4` (또는 `1.42`)로 줄 간격 행간을 상향 조정.
   - `padding-bottom: 4px` (또는 `padding: 2px 0 6px 0`)을 추가하여 하단 획 잘림 현상을 완전히 방지함.
