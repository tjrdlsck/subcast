# Testing Strategy: CHG-024-fix-bible-results-hover-preview

## 1. 검증 세부 항목
1. **성경 메인 표 뷰어 열림 상태에서의 미리보기 팝업 억제**:
   - `bible-main-viewer-overlay`가 열려 있을 때 `showBibleLivePreview`를 호출해도 `.workspace` 내에 `bible-preview-overlay` 요소가 생성되지 않는지 검증.
2. **성경 메인 표 뷰어 닫힘 상태에서의 미리보기 팝업 정상 작동**:
   - `bible-main-viewer-overlay`가 `display: none`일 때는 `showBibleLivePreview` 호출 시 `bible-preview-overlay` 요소가 정상 생성 및 표시되는지 검증.
3. **`hideBibleLivePreview` cleanup 기능**:
   - `hideBibleLivePreview` 호출 시 생성된 `bible-preview-overlay` 요소가 DOM에서 깔끔하게 제거되는지 검증.

## 2. 자동화 테스트 계획
- `tests/test_bible_live_preview.py` 작성 후 `pytest`로 검증 수행.
