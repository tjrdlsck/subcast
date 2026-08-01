# Change Request: CHG-020-fix-text-stroke-paint-first

## 요청 정보
- **요청자**: 사용자
- **작성일**: 2026-08-01
- **상태**: PROPOSED

## 요청 내용
에디터 페이지 및 무대 모니터 탭의 속성 설정에서 글자 테두리(Stroke) 색상 및 두께 설정 시, 글자 외곽 바깥에만 테두리가 생기는 것이 아니라 글자 안쪽에도 선이 생성되어 폰트 내부 영역을 가리고 글자가 찌그러지거나 얇아지는 현상을 개선 및 수정.

## 현상 및 원인
1. **현상**: 텍스트 테두리(stroke)를 적용할 때 글자 외곽선 안쪽 영역으로 테두리가 침범하여 글자 색상이 묻히거나 왜곡됨.
2. **원인**: Fabric.js Canvas의 Text/Textbox 객체의 기본 `paintFirst` 렌더링 순서가 `'fill'`로 설정되어 있음.
   - `paintFirst = 'fill'`일 경우, `fill`(글꼴 채우기)을 그린 후 `stroke`(테두리)를 그 위에 덮어 그림.
   - Stroke는 폰트 외곽 경계선의 중앙(Center)을 기준으로 안쪽/바깥쪽으로 50%씩 분산되어 렌더링되므로, fill 위에 그려지면 안쪽 50%가 글자 내부를 덮음.

## 해결 방향
1. Fabric.js 텍스트 객체(`Textbox`, `Text`) 생성 및 변경 시 `paintFirst: 'stroke'`를 적용함.
2. `paintFirst: 'stroke'` 적용 시 stroke를 먼저 그린 후 fill을 나중에 덮어서 그리므로, 글자 안쪽 50%의 stroke는 fill에 가려지고 글꼴 바깥쪽 50%의 stroke만 외곽 테두리로 정상 노출됨.
3. `editor-init.js` 내 `text-strokewidth` 이벤트 핸들러 추가 및 `updateTextStrokeColor` 등 stroke 관련 조작 함수에서 `paintFirst: 'stroke'` 설정 보장.
