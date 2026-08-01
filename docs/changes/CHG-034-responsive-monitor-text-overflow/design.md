# Technical Design: CHG-034-responsive-monitor-text-overflow

## 1. 설계 개요

모니터 카드 내부 텍스트를 카드의 콘텐츠 영역 안에 제한하고, 카드 크기에 따라 줄바꿈 및 말줄임이 동작하도록 CSS와 JavaScript의 스타일 정책을 통일한다. 스테이지의 반응형 `transform: scale()` 구조는 유지한다.

## 2. CSS 설계 (`frontend/css/viewer.css`)

- `.monitor-card`는 카드 경계 밖으로 자식 콘텐츠가 확장되지 않도록 `overflow: hidden`을 사용한다.
- Current/Next 텍스트 요소는 다음 속성을 공통 적용한다.
  - `display: -webkit-box`
  - `-webkit-box-orient: vertical`
  - `overflow: hidden`
  - `text-overflow: ellipsis`
  - `white-space: pre-wrap`
  - `word-break` 및 `overflow-wrap`
  - `max-width: 100%`, `max-height: 100%`
- 기존 line-height와 수직 여백은 일반 텍스트의 하단 글자 잘림을 유발하지 않는 범위에서 유지한다.

## 3. HTML 설계 (`frontend/monitor.html`, `frontend/viewer.html`)

- 두 페이지의 Current/Next 텍스트 초기 인라인 스타일을 CSS 정책과 일치시킨다.
- 카드 내부 텍스트가 초기 렌더링부터 카드 경계를 벗어나지 않도록 한다.

## 4. JavaScript 설계 (`frontend/js/viewer.js`)

- `renderMonitorViewerLayout()`에서 카드와 텍스트의 오버플로우를 visible/unset으로 되돌리는 설정을 제거한다.
- 카드 크기 변경 또는 모니터 설정 갱신 시 텍스트의 너비·높이 제약이 함께 유지되도록 한다.
- `updateMonitorViewerTexts()`의 말줄임 설정을 레이아웃 렌더링 설정과 동일한 정책으로 통합한다.
- `scrollHeight` 기반 반복 폰트 축소는 기본 설계로 사용하지 않는다. 먼저 카드 경계와 CSS 말줄임을 보장하고, 필요성이 검증된 경우에만 별도 변경으로 다룬다.

## 5. 호환성 및 보존 사항

- Fabric.js 캔버스 및 에디터 데이터 구조는 변경하지 않는다.
- 카드 위치·크기 계산 방식과 768x432 스테이지 스케일링은 유지한다.
- 긴 텍스트는 생략하되, 짧은 텍스트의 기존 정렬·폰트·색상·투명도 설정은 보존한다.
