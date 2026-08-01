# Change Design: CHG-030-fix-monitor-second-line-truncation

## 1. 개요 (Overview)
무대 모니터링 페이지 및 에디터 무대 모니터 미리보기에서 2번째 줄 텍스트가 절단/짤림되는 현상을 방지하기 위해 CSS 박스 모델, 행간(Line-Height), 패딩 버퍼 및 수직 높이 제한 규칙을 재설계합니다.

## 2. 세부 설계 (Detailed Specification)

### A. CSS 박스 모델 및 수직 공간 수용 재계산
1. `line-height`: `1.5` -> `1.28` 로 축소하여 2줄 이상 문장 렌더링 시 수직 높이 팽창을 억제.
2. `padding`: 상하 패딩(`padding-top: 2px`, `padding-bottom: 8px`)이 `box-sizing: border-box`에서 내부 수용 높이를 깎아먹지 않도록 `padding: 2px 0`으로 슬림화하거나 `box-sizing: content-box`로 전환.
3. `max-height`: `calc(100% - 6px)` -> `100%` 로 확대하여 카드의 전체 높이를 텍스트 영역이 온전히 활용하도록 개선.

```css
/* frontend/css/viewer.css */
.monitor-card div[id$="-text"],
#monitor-current-text,
#monitor-next-text {
    display: -webkit-box !important;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    word-break: break-word !important;
    overflow-wrap: anywhere !important;
    max-height: 100% !important;
    line-height: 1.28 !important;
    padding: 2px 0 !important;
    margin: auto 0 !important;
    box-sizing: border-box !important;
}
```

### B. DOM 인라인 스타일 및 JS 동기화
- `frontend/js/viewer.js` 내 `renderMonitorViewerLayout`의 `curText` 및 `nxtText` 인라인 스타일을 위 디자인 사양과 동기화.
- `frontend/monitor.html` 및 `frontend/viewer.html` 내 인라인 CSS 속성 동기화.
