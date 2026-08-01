# Change Request: CHG-033-fix-monitor-text-overflow-truncation

## 1. 개요 (Overview)
- **Change ID**: `CHG-033-fix-monitor-text-overflow-truncation`
- **요청 사항**: 모니터링 페이지(`monitor.html`)에서 자막/성경/찬양 등의 텍스트 글자수가 박스 영역을 초과할 경우, 글자가 하단으로 밀려 가려지거나(clipping) 무너지는 대신 안전하고 매끄럽게 생략(`...` 말줄임표 또는 Auto-fit font scaling)되도록 수정.
- **목적**: 텍스트가 박스를 넘칠 때 발생하는 가려짐 현상을 방지하고, 이전에 텍스트 잘림 수정을 시도할 때 발생했던 레이아웃 깨짐/렌더링 오류를 근본적으로 해소함.

## 2. 현상 및 원인 요약 (Symptom & Root Cause)
1. **CSS Text Overflow & Line Clamp 충돌**: `flex` 컨테이너(`monitor-card`) 내부의 자식 요소(`monitor-current-text`)에 `overflow: visible` 및 `-webkit-line-clamp: unset`이 지정되어 있어, 텍스트가 영역을 벗어날 때 생략되지 않고 하단으로 넘쳐 무대 모니터 래퍼(`monitor-stage-wrapper`) 경계에서 가려짐.
2. **개행 문자와 Multi-line Truncation 간 호환성 오차**: `white-space: pre-wrap`과 `-webkit-line-clamp`가 같이 쓰일 때, 텍스트 stroke 및 line-height(1.20)와의 수직 높이 계산 불일치로 생략표시 대신 텍스트 잘림 현상 또는 브라우저 렌더링 오류 발생.
3. **scrollHeight / clientHeight 동적 스크립트 계산 루프**: 텍스트 오버플로우를 감지하여 폰트를 자동 축소하거나 말줄임을 처리할 때, 자식 요소의 `max-height` 및 `overflow` 설정 오류로 스크립트 오계산 및 성능 저하/오류 유발.

## 3. 해결 목표 (Goals)
- `monitor.html` 및 `viewer.js` 내의 모니터 텍스트 카드가 영역을 넘어설 때 말줄임표(`...`) 또는 안전한 폰트 스케일링으로 처리되어 글자가 가려지지 않음.
- 기존 Fabric.js 캔버스와의 1:1 수직 위치 정합성 및 line-height(1.20) 렌더링을 100% 유지함.
