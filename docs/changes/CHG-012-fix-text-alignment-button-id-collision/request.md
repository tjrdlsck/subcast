# Change Request: CHG-012-fix-text-alignment-button-id-collision

## 1. 개요 (Overview)
속성 설정 패널 내 "스타일 및 정렬" 섹션의 글자 정렬 버튼(L/C/R)과 "정렬 및 배치" 섹션의 캔버스 요소 정렬 버튼 간 HTML `id` 중복(`btn-align-left`, `btn-align-right`)으로 인해, 글씨 정렬 버튼 클릭 시 텍스트 박스 자체가 캔버스 좌/우측으로 이동하는 버그를 수정합니다.

## 2. 변경 요청 내역 (Request Details)
1. **요소 정렬 버튼 ID 변경**:
   - "정렬 및 배치" 캔버스 요소 배치 버튼의 ID를 `btn-align-element-left`, `btn-align-element-right`로 변경하여 글씨 정렬 버튼 ID(`btn-align-left`, `btn-align-right`)와의 충돌 제거.
2. **이벤트 핸들러 격리**:
   - `editor-init.js` 및 `editor-canvas.js`에서 캔버스 요소 위치 정렬 버튼과 텍스트 내 글자 정렬(`textAlign`) 버튼의 클릭 이벤트 및 활성화 상태 바인딩을 분리.
3. **텍스트 박스 글자 정렬 정상 동작 보장**:
   - "스타일 및 정렬"의 L/C/R 버튼 클릭 시 텍스트 박스 내부 텍스트 정렬(`textAlign: 'left' | 'center' | 'right'`)만 정상 갱신되도록 보장.
