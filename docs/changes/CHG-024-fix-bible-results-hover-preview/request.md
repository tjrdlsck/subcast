# Change Request: CHG-024-fix-bible-results-hover-preview

## 1. 개요
성경 탭에서 '조회 및 본문 로드' 버튼 클릭 후 오른쪽(중앙)에 성경 메인 표 뷰어가 열린 상태에서, 좌측 `bible-results-list` 성경 구절 목록 항목 위에 마우스 호버(hover) 시 화면 우측 상단 메인 뷰어 위에 이상한 검정 화면 미니 팝업(`[송출 미리보기]`)이 떠오르는 버그를 원인 분석하고 수정합니다.

## 2. 현상 및 문제점
- 성경 탭에서 본문 로드 시 성경 메인 표 뷰어 오버레이(`#bible-main-viewer-overlay`)가 `display: flex` (z-index: 100)로 중앙 에디터 영역을 덮음.
- 이 상태에서 좌측 패널의 `#bible-results-list` 성경 목록 항목 마우스 오버 시 `showBibleLivePreview(item)`가 호출됨.
- `showBibleLivePreview`는 `.workspace` 하위에 `z-index: 1000`을 가진 검정색 미니 미리보기 박스(`div.bible-preview-overlay`, background: `#000000`)를 동적 주입함.
- 메인 표 뷰어가 화면 전체에 펼쳐져 있는 상황에서 뷰어 우측 상단 위로 검정 박스가 불필요하게 팝업으로 가려지며 이상 현상 발생.

## 3. 해결 목표
1. 성경 메인 표 뷰어 오버레이(`#bible-main-viewer-overlay`)가 활성화(`display !== "none"`)된 상태에서는 `showBibleLivePreview` 미니 미리보기 팝업 노출을 차단하여 UI 혼선 제거.
2. 미니 미리보기 오버레이(`bible-preview-overlay`)의 스타일(배경색, 텍스트 가독성)을 다듬고 mouseleave 및 뷰어 전환 시 깔끔하게 cleanup 되도록 보장.
