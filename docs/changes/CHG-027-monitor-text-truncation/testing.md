# Testing Strategy: CHG-027-monitor-text-truncation

## 1. 테스트 목적 (Objective)
모니터링 화면(`monitor.html`, `viewer.html`, `viewer.js`)에서 대량의 성경/가사 텍스트가 수신되었을 때, 텍스트가 레이아웃 상자를 이탈하거나 파관되지 않고 `-webkit-line-clamp` 및 `text-overflow: ellipsis`를 통해 `...`으로 자동 축약되는지 검증합니다.

## 2. 테스트 항목 (Test Cases)

### TC-1: CSS 텍스트 축약 속성 존재 검증
- `frontend/css/viewer.css` 및 모니터링 HTML 파일들에 `display: -webkit-box`, `-webkit-line-clamp`, `overflow: hidden`, `text-overflow: ellipsis` 등 텍스트 축약 필수 CSS 속성이 명시되어 있는지 확인.

### TC-2: `viewer.js` 모니터 텍스트 업데이트 검증
- `updateMonitorViewerTexts`가 긴 성경/가사 텍스트를 카드 요소에 전달할 때 정상 작동하고, 레이아웃 깨짐 없이 렌더링 요소를 유지하는지 확인.

### TC-3: 회귀 테스트 (Regression Test)
- 기존 테스트 스위트(`pytest tests/`)를 실행하여 이전 기능에 부작용이 없는지 확인.
