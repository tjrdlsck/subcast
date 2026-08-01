# Change Request: CHG-034-responsive-monitor-text-overflow

## 1. 개요

- **Change ID**: `CHG-034-responsive-monitor-text-overflow`
- **대상**: 모니터링 페이지의 Current/Next 텍스트 카드
- **요청 사항**: 텍스트가 카드의 너비 또는 높이를 초과할 때 카드 밖으로 계속 렌더링되지 않고, 카드 크기에 맞춰 안전하게 줄바꿈·생략되도록 수정한다.

## 2. 확인된 현상

- 모니터 카드와 텍스트 요소에 `overflow: visible`이 적용되어 긴 텍스트가 카드 영역을 벗어난다.
- CSS의 `!important` 규칙이 JavaScript가 설정하는 `overflow: hidden`, `text-overflow: ellipsis`, `-webkit-line-clamp`를 덮어쓴다.
- `renderMonitorViewerLayout()`은 텍스트의 높이 제한과 말줄임을 해제하고 있어 카드 크기와 텍스트 표시 영역이 분리되어 있다.
- 스테이지 자체는 화면 크기에 따라 `transform: scale()`로 반응형 축소되지만, 카드 내부 텍스트의 오버플로우 경계는 반응형으로 제한되지 않는다.

## 3. 목표

1. Current/Next 텍스트가 카드의 실제 너비와 높이를 넘지 않도록 한다.
2. 긴 텍스트는 카드 안에서 줄바꿈되고, 표시 한계를 넘는 부분은 말줄임표로 처리한다.
3. 화면 크기와 카드 크기가 달라져도 동일한 오버플로우 정책을 유지한다.
4. 기존의 일반 1~2줄 텍스트 수직 정합성과 하단 글자 표시를 유지한다.
5. 모니터 페이지의 기존 레이아웃·색상·폰트 설정 및 Fabric 캔버스 동작에는 영향을 주지 않는다.

## 4. 대상 화면

- `frontend/monitor.html`
- `frontend/viewer.html`의 모니터 뷰어 영역
- `frontend/css/viewer.css`
- `frontend/js/viewer.js`의 모니터 레이아웃 및 텍스트 렌더링 로직

## 5. 제외 범위

- 백엔드 API 및 데이터 저장 구조
- 에디터의 텍스트 데이터 모델
- 프레젠터 송출 로직
- 의존성 추가 및 외부 서비스 변경
