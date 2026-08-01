# Change Request: CHG-031-fix-monitor-viewport-transform-scaling

## 1. 요청 배경 (Background)
무대 모니터링 페이지(`monitor.html`, `viewer.html`) 및 에디터 무대 모니터 미리보기 박스(`pip-monitor-preview-box`)에서 폰트 및 요소를 개별 px로 산출하는 과정에서 서브픽셀 반올림 오차 및 브라우저 최소 폰트 크기(12px) 제한으로 인해 2번째 줄 텍스트가 미세하게 잘리는 현상이 발생함.

## 2. 요청 상세 (Requirements)
1. **고정 뷰포트 기반 CSS `transform: scale()` 벡터 스케일링 도입**:
   - 모니터 스테이지 컨테이너를 768px x 432px (또는 정비율 16:9 캔버스 기준)의 고정 해상도 100% 무결점 영역으로 내부 렌더링.
   - 브라우저 창 크기 및 미리보기 박스 크기에 맞춰 스테이지 전체를 `transform: scale(scale)`로 통합 축소/확대.
2. **미리보기 박스 및 모니터링 페이지 100% 픽셀 퍼펙트 통일**:
   - 캔버스 = 미리보기 박스 = 모니터링 전체 화면 3곳의 출력 결과물이 토씨 하나 틀리지 않고 동일하게 보이도록 보장.
