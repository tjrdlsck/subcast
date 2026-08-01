# Change Request: CHG-027-monitor-text-truncation

## 요청 배경 (Background)
무대 프롬프터/성경 및 찬양 모니터링 화면(`monitor.html`, `viewer.js`)에서 표시되는 텍스트 양이 많은 경우(특히 성경 구절이나 긴 찬양 가사), 카드 및 레이아웃 상자 영역을 초과하여 레이아웃이 깨지거나 범위를 벗어나는 현상이 발생합니다.

## 요청 상세 (Requirements)
1. **텍스트 자동 축약 (Text Truncation)**:
   - 모니터링 화면의 Current (현재 슬라이드) 및 Next (다음 슬라이드) 카드에 긴 텍스트가 수신될 경우, 지정된 카드 틀/상자를 초과하지 않도록 자동으로 앞부분만 보여주고 `...` (생략 부호, Ellipsis) 처리를 적용합니다.
2. **레이아웃 보존 (Layout Preservation)**:
   - 멀티라인 말줄임표 (CSS `-webkit-line-clamp` 및 `overflow: hidden`, `text-overflow: ellipsis`) 또는 적절한 JS 축약 로직을 통해 텍스트 양에 구애받지 않고 모니터 템플릿 카드의 위치와 형태가 항상 정돈되도록 보장합니다.
3. **가독성 및 디자인 유지 (Readability & Design Integrity)**:
   - 글자 크기와 라인 높이(line-height)를 유지하되 영역을 넘치는 경우 깔끔하게 `...`으로 맺어 가독성을 높입니다.
