# Change Request: CHG-032-fix-monitor-text-clipping-and-dom-alignment

## 1. 요청 배경 (Background)
무대 모니터링 페이지(`monitor.html`, `viewer.html`) 및 에디터 페이지의 무대 모니터 탭 미리보기 화면(`pip-monitor-iframe`)에서 2번째 줄 글씨 하단부(Descender 및 받침 획)가 잘리는 현상 해결과 더불어, 대량 텍스트(4줄 초과) 입력 시 뒷부분 글씨가 `...`으로 자동 축약 생략(Truncation / Ellipsis)되는 로직이 함께 보장되어야 함.

## 2. 요청 상세 (Requirements)
1. **대량 텍스트(4줄 초과) 입력 시 `-webkit-line-clamp: 4` 및 `text-overflow: ellipsis` 생략 처리 복원**:
   - 성경 구절이나 긴 찬양 가사 수신 시 카드 박스를 뚫고 나가지 않고 4번째 줄 끝에서 `...`으로 자동 생략되도록 복원.
2. **2~3줄 텍스트 하단 획 잘림 방지 밸런스 보정**:
   - `line-height: 1.30` 및 `padding: 2px 0 4px 0`, `max-height: 100%` 수직 안심 패딩을 부여하여 `overflow: hidden` 처리 시에도 2번째 줄 글자 하단 획(한글 받침, descender)이 짤리지 않고 온전히 표출되도록 조율.
3. **Fabric.js 캔버스와 DOM 미리보기 간의 렌더링 규격 통일**:
   - Fabric Textbox 및 DOM 텍스트 속성의 `line-height`를 `1.30`으로 명시하고 줄바꿈을 `word-break: break-word; overflow-wrap: break-word;`로 통일.
