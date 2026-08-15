# Change Request: CHG-045 무대 모니터 및 텍스트 속성 설정 창 줄간격(Line Height) 기능 개선 (재조정)

## 1. 피드백 및 조정 요청 개요
- **사용자 피드백**: 좌측 사이드바 무대 모니터 패널이 아닌, 캔버스 텍스트 객체 선택 시 우측에 열리는 **'속성 설정 패널(Text Inspector)'** 내부로 줄간격 조절 컨트롤 배치 변경.
- **수정 목표**:
  1. 우측 텍스트 속성 설정 패널(`inspector-text-section`)에 `줄간격(Line Height)` 조절 필드(넘버/슬라이더) 추가.
  2. 캔버스에서 무대 모니터 가이드박스(CURRENT/NEXT) 또는 일반 슬라이드 텍스트 객체 선택 시 우측 속성 패널에 해당 텍스트의 현재 `lineHeight` 값이 동기화되어 표출.
  3. 속성 패널에서 줄간격 변경 시 캔버스 텍스트박스 `lineHeight`가 실시간 변경되고, 무대 모니터 설정(`monitorSettings`) 및 프롬프터 뷰어에 반영되도록 개편.

## 2. 주요 변경 대상
- `frontend/editor.html`: `#inspector-text-section` 텍스트 서식 섹션에 줄간격(`text-lineheight`) 입력 컨트롤 추가.
- `frontend/js/modules/editor-ui.js` / `frontend/js/modules/editor-monitor.js`: 텍스트 객체 선택 시 우측 속성 패널 값 바인딩 및 줄간격 수정 이벤트 연동.
- `frontend/js/viewer.js` & 백엔드: 기존과 동일하게 `lineHeight` 저장 및 뷰어 렌더링 유지.

## 3. 다음 단계
- 본 수정 요청(`request.md`) 승인 후 Phase 2 영향 분석(`impact-analysis.md`)을 작성합니다.
