# Change Request: CHG-028-fix-editor-monitor-text-resize-and-line-height

## 1. 요청 배경 (Background)
1. **에디터 무대 모니터 탭 텍스트 박스 리사이즈 버그**:
   - 에디터 페이지의 무대 모니터 탭에서 캔버스 상의 텍스트 박스(Current/Next 가이드 상자 포함) 조절 손잡이(Controls)를 마우스로 드래그할 때 사이즈 조절이 제대로 되지 않고 먹통이 되는 현상이 발생함.
2. **모니터링 페이지 텍스트 하단 잘림 증상**:
   - 모니터링 화면(`monitor.html`, `viewer.js`)에서 2번째 줄(또는 줄바꿈된 텍스트 하단)의 글자 아랫부분(디센더 및 한글 받침 획)이 약간 잘려서 표시됨.

## 2. 요청 상세 (Requirements)
1. **에디터 텍스트 박스 리사이즈 수정**:
   - 마우스 드래그 중인 실시간 이벤트(`scaling`, `resizing`, `moving`)에서는 객체의 `scaleX`/`scaleY`를 즉시 1로 강제 리셋하지 않고 bounds 계산만 수행하며, 드래그 종료 시점(`object:modified`)에 스케일 정규화를 진행하여 부드럽고 정확한 리사이즈 조작을 보장.
   - `object:resizing` 이벤트 바인딩 추가.
2. **모니터링 페이지 글자 하단 잘림 보정**:
   - `line-height`를 `1.4`~`1.45`로 상향 조정하고, `padding-bottom: 4px` 및 `box-sizing: border-box`를 적용하여 `overflow: hidden` 및 `-webkit-line-clamp` 렌더링 시 디센더(g, p, q, y, j 등) 및 하단 글자가 깔끔하게 보이도록 보정.
