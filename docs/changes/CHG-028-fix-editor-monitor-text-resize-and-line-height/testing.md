# Testing Strategy: CHG-028-fix-editor-monitor-text-resize-and-line-height

## 1. 테스트 목적 (Objective)
에디터 무대 모니터 탭 캔버스에서 텍스트 박스/가이드 상자의 리사이즈 조작이 막힘 없이 원활하게 작동하는지 검증하고, 모니터링 페이지의 line-height 및 하단 패딩 적용으로 글자 아래쪽 잘림 현상이 해소되었는지 검증합니다.

## 2. 테스트 항목 (Test Cases)

### TC-1: `editor-monitor.js` 이벤트 바인딩 및 정규화 분리 검증
- `object:resizing` 이벤트 추가 및 `handleGuideModified`에서만 `scaleX: 1`, `scaleY: 1` 정규화가 실행되는지 확인.

### TC-2: 모니터 텍스트 line-height 및 패딩 검증
- CSS 및 JS 렌더링 시 `line-height: 1.4` 및 `padding-bottom` 속성이 올바르게 지정되었는지 확인.

### TC-3: 회귀 테스트 (Regression Test)
- 전체 테스트 스위트(`pytest tests/`) 실행하여 기존 106개 검증 테스트 결과 보존 확인.
