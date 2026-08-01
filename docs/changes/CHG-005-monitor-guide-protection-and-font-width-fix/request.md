# Change Request: CHG-005-monitor-guide-protection-and-font-width-fix

## 1. 개요
큰 폰트 크기 조절 후 텍스트 박스 가로 폭이 캔버스 밖으로 확대되거나 변형되는 현상을 완전히 방지하고, 무대 모니터 탭의 기본 가이드 텍스트 박스 2개(🔴 CURRENT, 🔵 NEXT)의 삭제/복사/잘라내기를 금지 보호하며 속성 패널의 개체 삭제 버튼을 제거합니다.

## 2. 요청 내역
1. **폰트 크기 조절 시 너비 보정**: 큰 폰트 크기 대입 후에도 텍스트 박스 가로 폭이 캔버스 너비를 넘치지 않도록 `splitByGrapheme` 및 너비 리셋 처리.
2. **무대 모니터 텍스트 박스 2개 보호**: 가이드 박스(`isMonitorGuide: true`) 삭제(Delete/Backspace/메뉴), 복사(Ctrl+C), 잘라내기(Ctrl+X) 금지 및 보호.
3. **속성 패널 개체 삭제 버튼 제거**: `editor.html`의 개체 삭제 버튼 HTML 삭제.
