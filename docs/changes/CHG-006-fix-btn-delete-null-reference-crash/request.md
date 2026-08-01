# Change Request: CHG-006-fix-btn-delete-null-reference-crash

## 1. 개요
HTML에서 삭제된 `#btn-delete` 요소에 대한 JS 자바스크립트 Null 참조 에러(`TypeError: Cannot set properties of null`)를 안전하게 가드 처리하여 개체 선택 시 속성 설정 패널이 정상적으로 나타나도록 수정합니다.

## 2. 요청 내역
1. `editor-init.js` 라인 681의 `document.getElementById("btn-delete")` Null 참조 방지 처리.
2. `editor-canvas.js` 라인 284의 `document.getElementById("btn-delete")` Null 참조 방지 처리.
