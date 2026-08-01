# Change Design: CHG-027-monitor-text-truncation

## 1. 개요 (Overview)
스테이지 모니터링 화면(`monitor.html`, `viewer.html` 및 `viewer.js`)에서 성경 구절이나 긴 가사 등 대량의 텍스트가 전달될 때 모니터 카드 영역을 넘치지 않고 깔끔하게 `...`으로 자동 축약(Truncation / Ellipsis)하는 디자인 사양입니다.

## 2. 세부 설계 (Detailed Specification)

### A. CSS 기반 멀티라인 축약 (Multiline Line Clamp)
`frontend/css/viewer.css` 및 `monitor.html`, `viewer.html` 내 `#monitor-current-text`와 `#monitor-next-text` 요소에 멀티라인 말줄임표 CSS 속성을 지정합니다.

```css
.monitor-card .monitor-text,
#monitor-current-text,
#monitor-next-text {
    display: -webkit-box;
    -webkit-line-clamp: 4; /* 모니터 카드 높이에 따라 적절한 최대 줄 수 제한 */
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    word-break: break-word;
    overflow-wrap: anywhere;
    max-height: 100%;
}
```

### B. JavaScript 보조 축약 처리 (`viewer.js`)
텍스트가 너무 긴 경우(예: 문자 수 150자 초과 또는 개행 수 초과), CSS clamp와 더불어 안정적인 축약을 지원하도록 `viewer.js` 내 `updateMonitorViewerTexts` 및 텍스트 렌더링에 적절한 인라인 스타일 보완 및 필요시 최대 길이 헬퍼 함수를 적용합니다.

```javascript
// viewer.js
function truncateTextForMonitor(text, maxLength = 160) {
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + "...";
}
```
> 주: 사용자 경험(UX)상 CSS `-webkit-line-clamp` 및 `overflow: hidden` 기반의 자동 축약을 최우선 적용하고, 컨테이너 높이에 맞춰 유동적으로 잘리도록 구성합니다.

## 3. UI/UX 개선 효과
- 성경 구절과 같이 길고 긴 구절이 들어오더라도 모니터 상자 크기를 깨뜨리지 않고 일정 줄 수 까지만 보이고 끝부분에 `...`이 표시됨.
- 찬양/성경 모드 전환 시 깔끔하고 통일된 카드 레이아웃 구조 유지.
