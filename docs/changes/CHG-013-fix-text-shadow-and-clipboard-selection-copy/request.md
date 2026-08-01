# Change Request: CHG-013-fix-text-shadow-and-clipboard-selection-copy

## 1. 개요 (Overview)
속성 설정 패널에서 "글자 그림자 효과 적용" 체크박스 선택 시 텍스트 그림자 효과가 캔버스 요소에 반영되지 않는 버그를 수정하고, 속성 설정 등 에디터 화면의 텍스트를 드래그하여 복사(Ctrl+C)할 때 슬라이드 JSON/HTML 데이터가 클립보드에 작성되는 대신 실제 선택된 텍스트가 복사되도록 키보드 단축키 감지 로직을 개선합니다.

## 2. 변경 요청 내역 (Request Details)
1. **글자 그림자 효과 활성화 및 연동 (`text-shadow-enabled`)**:
   - `text-shadow-enabled` 체크박스 클릭 이벤트 핸들러(`onchange`)를 등록하여 체크 시 `fabric.Shadow` 객체를 생성해 텍스트 요소에 적용하고, 해제 시 그림자를 제거.
   - `text-shadow-blur`, `text-shadow-offsetx`, `text-shadow-offsety` 실시간 조절 핸들러 연결 및 직렬화/역직렬화(`serializeElement`, `deserializeElement`) 지원.
2. **속성 패널 및 화면 텍스트 복사(Ctrl+C) 정상화**:
   - `editor-init.js` 단축키 감지 시 화면상에 마우스 선택 텍스트(`window.getSelection()`)가 존재하거나 입력 포커스(`INPUT`, `TEXTAREA`, `isContentEditable`)가 활성화된 경우 슬라이드/요소 복사 단축키 처리를 우회(return).
   - 브라우저 기본 텍스트 복사 동작을 유지하여 사용자가 지정한 텍스트만 깔끔하게 클립보드에 복사되도록 보장.
