# Tasks Breakdown: CHG-024-fix-bible-results-hover-preview

## Task List

- [x] **Task 1: `editor-bible.js` 실시간 미리보기 팝업 노출 조건 및 cleanup 로직 보완**
  - `showBibleLivePreview`에서 `#bible-main-viewer-overlay` 열림 상태 확인 후 팝업 억제 logic 추가.
  - `showBibleMainViewer` 및 `hideBibleMainViewer`에서 `hideBibleLivePreview()` 호출을 통한 팝업 제거 잔여물 정리.

- [x] **Task 2: `editor.css` `.bible-preview-overlay` 스타일 시각적 개선**
  - 반투명 다크 스타일, blur 효과 및 패딩/가독성 다듬기.

- [x] **Task 3: 회귀 테스트 작성 및 실행 (`tests/test_bible_live_preview.py`)**
  - 성경 메인 표 뷰어 열림/닫힘 상태별 실시간 미리보기 팝업 노출 동작 자동화 검증.

