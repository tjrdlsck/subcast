# Impact Analysis: CHG-024-fix-bible-results-hover-preview

## 1. 영향 범위 (Scope)

### Allowed Scope (수정 허용 범위)
- `frontend/js/modules/editor-bible.js`
- `frontend/css/editor.css`
- `tests/test_bible_live_preview.py` (신규 테스트 작성)
- `docs/changes/CHG-024-fix-bible-results-hover-preview/`
- `docs/project-state.md`

### Protected Scope (수정 금지 범위)
- `backend/`
- `frontend/editor.html`
- `frontend/monitor.html`
- `frontend/presenter.html`
- `frontend/viewer.html`
- 기타 언급되지 않은 frontend JS 모듈

## 2. 영향 요소 및 사이드 이펙트 분석
- **성경 메인 표 뷰어 상태 판단**: `document.getElementById("bible-main-viewer-overlay")`의 `display` 상태를 확인하여 미니 미리보기 팝업 노출 여부를 결정함. 다른 모듈 및 뷰어 동작에는 영향을 주지 않음.
- **성경 결과 목록 마우스 오버 인터랙션**: 뷰어가 닫혀 있는 상태에서는 기존과 같이 미리보기 팝업이 동작하고, 뷰어가 열려 있는 상태에서는 팝업 출력을 억제하여 깔끔한 UX 유지.
- **CSS 스타일 개선**: `.bible-preview-overlay`의 검정 배경(`#000000`)에 테두리 및 텍스트 폰트/패딩을 정리하여 시각적 완성도 향상.

## 3. 검증 전략
- Pytest 기반 단위/UI 로직 검증 테스트 (`tests/test_bible_live_preview.py`) 생성 및 실행.
- 뷰어 표시 유무에 따른 `showBibleLivePreview` 동작 테스트.
