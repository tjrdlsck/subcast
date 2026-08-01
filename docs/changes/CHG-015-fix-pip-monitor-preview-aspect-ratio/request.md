# Change Request: PIP 미리보기 박스 비율 계산 및 줄바꿈 일치 수정 (CHG-015)

## 1. 개요
에디터 페이지의 무대 모니터 탭에 위치한 PIP 미리보기 박스(`pip-monitor-preview-box`)에서 메인 캔버스에 줄바꿈이 없는 텍스트가 미리보기 상에서 예기치 않게 줄바꿈(Word Wrapping)되는 비율 계산 및 렌더링 불일치 현상을 수정합니다.

## 2. 세부 요구사항
1. **소수점 폰트 스케일 적용 (Font Scale Precision)**:
   - `viewer.js`의 `renderMonitorViewerLayout()` 및 `renderMonitorCustomElements()`에서 폰트 크기 계산 시 사용하던 `Math.round` 반올림을 제거하고, `screenW / 768` 비율을 소수점 픽셀 크기(`px`)로 정밀하게 부여합니다.
2. **글자 단위 줄바꿈 동기화 (Word Break Rule Alignment)**:
   - 메인 캔버스(Fabric.js `Textbox`)의 `splitByGrapheme: true` 속성과 100% 동일하게 렌더링되도록, `viewer.js` 내 모니터 텍스트 요소들(`monitor-current-text`, `monitor-next-text`, 커스텀 텍스트 요소)의 CSS 줄바꿈 속성을 `word-break: break-all;` (또는 `overflow-wrap: anywhere;`)로 개선합니다.
3. **PIP 미리보기 렌더링 검증 (Visual Consistency)**:
   - 다양한 뷰포트 너비 환경에서 메인 캔버스 가이드 박스의 줄바꿈 상태와 PIP 미리보기 iframe의 줄바꿈 상태가 완벽하게 일치하도록 보장합니다.
