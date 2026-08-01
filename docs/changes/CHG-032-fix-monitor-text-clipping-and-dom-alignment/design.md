# Change Design: CHG-032-fix-monitor-text-clipping-and-dom-alignment

## 1. 개요 (Overview)
대량 텍스트 입력 시 4줄 초과분을 `...`으로 생략하는 `-webkit-line-clamp: 4` 및 `text-overflow: ellipsis` 축약 로직을 복원하면서, `line-height: 1.30` 및 `padding: 2px 0 4px 0` 수직 안심 여유 공간을 적용하여 2~3줄 일반 문장의 하단 획 잘림을 동시에 방지합니다.

## 2. 세부 설계 (Detailed Design)

### A. CSS 스타일 구조 개편 (`frontend/css/viewer.css`, `monitor.html`, `viewer.html`)
1. 카드(`.monitor-card`) 구조:
   ```css
   .monitor-card {
       overflow: hidden !important;
       padding: 4px 8px !important;
       box-sizing: border-box !important;
   }
   ```
2. 텍스트 요소(`#monitor-current-text`, `#monitor-next-text`, `.monitor-card-text`)의 4줄 생략 및 수직 안심 패딩:
   ```css
   .monitor-card-text,
   #monitor-current-text,
   #monitor-next-text {
       display: -webkit-box !important;
       -webkit-line-clamp: 4 !important;
       -webkit-box-orient: vertical !important;
       overflow: hidden !important;
       text-overflow: ellipsis !important;
       word-break: break-word !important;
       overflow-wrap: break-word !important;
       white-space: pre-wrap !important;
       max-height: 100% !important;
       line-height: 1.30 !important;
       padding: 2px 0 4px 0 !important;
       margin: auto 0 !important;
       box-sizing: border-box !important;
   }
   ```

### B. JavaScript 렌더링 스타일 동기화 (`frontend/js/viewer.js`)
- `renderMonitorViewerLayout()` 내 `curText` 및 `nxtText` 요소의 동적 인라인 스타일 부여 로직을 수정하여 `display: -webkit-box`, `webkitLineClamp: 4`, `webkitBoxOrient: vertical`, `overflow: hidden`, `textOverflow: ellipsis`, `lineHeight: 1.30`, `padding: 2px 0 4px 0`, `margin: auto 0`을 동기적으로 설정.
- `editor-monitor.js`의 Fabric Textbox 생성 옵션에서도 `lineHeight: 1.30`을 명시하여 캔버스와 DOM 간의 행간 기준값을 1:1로 일치시킴.
