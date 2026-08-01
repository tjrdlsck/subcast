# Change Design: CHG-024-fix-bible-results-hover-preview

## 1. 변경 요약
`frontend/js/modules/editor-bible.js`의 `showBibleLivePreview` 및 `hideBibleLivePreview` 함수를 수정하여, 성경 메인 표 뷰어 오버레이(`#bible-main-viewer-overlay`) 또는 찬양 뷰어 등 메인 슬라이드 오버레이가 열려 있을 때 실시간 미리보기 팝업이 성경 메인 표 뷰어 위로 겹쳐서 검은 박스로 나타나는 현상을 방지합니다.

## 2. 세부 설계 (Implementation Detail)

### 2.1 `editor-bible.js` 수정
1. `showBibleLivePreview(item)` 함수 내 조건 추가:
   ```javascript
   function showBibleLivePreview(item) {
       if (previewEl) hideBibleLivePreview();

       // 성경 메인 표 뷰어가 활성화(display !== 'none') 상태이면 미니 미리보기 팝업 생성을 억제함
       const viewerOverlay = document.getElementById("bible-main-viewer-overlay");
       if (viewerOverlay && window.getComputedStyle(viewerOverlay).display !== "none") {
           return;
       }

       const workspace = document.querySelector(".workspace");
       if (!workspace) return;
       ...
   }
   ```
2. `hideBibleMainViewer()` 및 `showBibleMainViewer()` 실행 시 남아있는 `previewEl`이 있을 경우 `hideBibleLivePreview()`를 호출하여 완전히 정리(cleanup).

### 2.2 `editor.css` 수정
1. `.bible-preview-overlay` 스타일 개선:
   - 과도하게 어두운 `#000000` 대신 가독성이 좋고 세련된 반투명 다크 배경 (`background: rgba(18, 18, 20, 0.95)`, `backdrop-filter: blur(8px)`) 적용.
   - 은은한 그림자 및 경계선 보정.

## 3. 회귀 검증 및 안전 조치
- 성경 메인 표 뷰어가 닫힌 상태에서 좌측 검색 목록 호버 시 미리보기가 정상 표시되는지 검증.
- 성경 메인 표 뷰어가 열린 상태에서는 좌측 검색 목록 호버 시 팝업이 노출되지 않는지 검증.
