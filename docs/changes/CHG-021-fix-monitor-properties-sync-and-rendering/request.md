# Change Request: CHG-021-fix-monitor-properties-sync-and-rendering

## 요청 정보
- **요청자**: 사용자
- **작성일**: 2026-08-01
- **상태**: PROPOSED

## 요청 내용
무대 모니터 탭에서 속성 설정(글자 색상, 테두리 색상, 테두리 두께, 글꼴 스타일, 투명도 등)을 변경하였을 때, 실시간 미리보기(Preview) 및 외부 모니터링 페이지(`monitor.html` / `viewer.html?channel=monitor`)에 즉시 반영되지 않거나 일부 속성이 누락되어 표출되는 버그 수정. 속성 설정의 모든 요소가 미리보기와 모니터링 페이지에 100% 동일하게 보이도록 동기화 및 렌더링 개선.

## 현상 및 원인
1. **`editor-history.js`**:
   - `saveStateToHistory()` 호출 시 무대 모니터 모드(`isMonitorMode()`)일 때 단순 `return;` 처리되어, 속성 설정 바에서 값을 변경하더라도 무대 모니터 설정 동기화(`syncCanvasToMonitorSettings`) 및 실시간 방송(`broadcastMonitorPreviewSettings`)이 실행되지 않음.
2. **`editor-monitor.js`**:
   - 캔버스 상태를 `monitorSettings`로 직렬화하는 `syncCanvasToMonitorSettings()`에서 `strokeColor`, `strokeWidth`, `fontStyle`, `opacity` 항목이 누락되어 저장이 안 됨.
   - 가이드 텍스트박스 생성/복원 시 해당 속성들이 `fabric.Textbox` 생성 옵션에 누락됨.
3. **`viewer.js`**:
   - 모니터링 뷰어 렌더링 함수(`renderMonitorViewerLayout`)에서 CURRENT / NEXT 텍스트에 `color`, `fontWeight`, `fontFamily`, `textAlign`만 적용하고, 글자 테두리(`-webkit-text-stroke`, `paint-order`), `fontStyle`, `opacity` 등을 CSS로 적용하지 않음.

## 해결 방향
1. `editor-history.js`: 무대 모니터 모드일 때 `saveStateToHistory()` 내부에서 `saveMonitorStateToHistory()`를 호출하여 속성 변경 즉시 미리보기 및 모니터 설정이 동기화되도록 수정.
2. `editor-monitor.js`: `syncCanvasToMonitorSettings()`에서 `strokeColor`, `strokeWidth`, `fontStyle`, `opacity` 등을 `monitorSettings.currentBox` 및 `nextBox`에 포함하고, 복원 시 `fabric.Textbox` 옵션에 올바르게 적용.
3. `viewer.js`: `renderMonitorViewerLayout()`에서 `-webkit-text-stroke`, `paint-order: stroke fill;`, `fontStyle`, `opacity` 등의 CSS 파이프라인을 구축하여 외부 모니터링 뷰어에서도 에디터와 동일하게 렌더링.
