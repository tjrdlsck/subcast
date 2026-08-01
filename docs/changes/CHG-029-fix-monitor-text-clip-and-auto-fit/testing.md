# Testing Strategy: CHG-029-fix-monitor-text-clip-and-auto-fit

## 1. 테스트 목적 (Objective)
한글 3단 조합 문자('밀', '빌' 등 'ㄹ' 받침)를 포함한 모니터링 텍스트가 타이트한 모니터 카드 상자 내부에서 절단되거나 잘리지 않고 `line-height: 1.5` 및 하단 안심 패딩 버퍼(Safety Buffer)를 통해 100% 온전히 출력되는지 검증합니다.

## 2. 테스트 항목 (Test Cases)

### TC-1: `viewer.css` 및 HTML 스타일 검증
- `line-height: 1.5`, `padding-bottom: 8px`, `margin: auto 0`, `box-sizing: content-box` 지정 확인.

### TC-2: `viewer.js` 렌더링 스타일 지정 검증
- `renderMonitorViewerLayout` 및 `updateMonitorViewerTexts`에서 텍스트 수신 시 안심 버퍼 스타일이 올바르게 적용되는지 확인.

### TC-3: 회귀 테스트 (Regression Test)
- 전체 pytest 수트를 구동하여 기존 109개 테스트 정상 통과 검증.
