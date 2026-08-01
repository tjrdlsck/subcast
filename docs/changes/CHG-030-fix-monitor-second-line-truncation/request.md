# Change Request: CHG-030-fix-monitor-second-line-truncation

## 1. 요청 배경 (Background)
무대 모니터링 페이지(`monitor.html`, `viewer.html`) 및 에디터 무대 모니터 탭 미리보기(`pip-monitor-iframe`)에서 2번째 줄 글씨가 아래쪽으로 짤리거나 잘려나가는 현상이 발생함.
이전 CHG-029 수정(`padding-bottom: 8px`, `line-height: 1.5`)이 적용되면서 `box-sizing: border-box`로 인해 내부 수용 높이가 도리어 감소하고 2줄 수직 높이가 커져 2번째 줄 글씨 잘림이 심화됨.

## 2. 요청 상세 (Requirements)
1. **2번째 줄 텍스트 잘림 현상 근본 해결**:
   - `line-height`를 `1.25~1.3`으로 조정하여 2~3줄 이상 렌더링 시 수직 높이 소모를 줄임.
   - `padding-bottom: 8px`과 `box-sizing: border-box`로 인한 내부 수용 공간 감소 문제를 해결 (`box-sizing: content-box` 전환 또는 패딩/마진 재설정).
2. **캔버스(Canvas)와의 렌더링 일치성 보장**:
   - 캔버스에서 잘리지 않고 보이는 텍스트 배율/높이 균형을 DOM 미리보기 및 모니터 페이지에서도 1:1에 가깝게 일치시킴.
3. **`-webkit-line-clamp` 및 오버플로 안정성 확보**:
   - 2줄 텍스트 입력 시 말줄임표나 자름 현상이 부자연스럽게 발생하지 않도록 CSS 및 JS 렌더링 스타일 보정.
