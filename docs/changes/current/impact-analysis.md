# Impact Analysis: CHG-045 무대 모니터 및 텍스트 속성 설정 창 줄간격(Line Height) 기능 개편

## 1. 영향 분석 요약
- **목적**: 우측 텍스트 속성 설정 패널(`inspector-text-section`)에 줄간격(Line Height) 조절 항목을 배치하여, 사용자가 무대 모니터 텍스트박스 또는 캔버스 텍스트 클릭 시 우측 창에서 직관적으로 줄간격을 조절할 수 있도록 개편.
- **영향 범위**: 우측 속성 설정 패널 HTML 구조, 텍스트 선택 시 UI 바인딩 및 이벤트 처리(`editor-ui.js`), 무대 모니터 캔버스/설정 동기화(`editor-monitor.js`), 프롬프터 뷰어 DOM 렌더링(`viewer.js`), 백엔드 API 스키마.

## 2. 모듈별 영향도 분석

### A. 우측 속성 설정 패널 (`frontend/editor.html`)
- `#inspector-text-section` 텍스트 서식 섹션에 `줄간격` 입력 필드(`text-lineheight`, step: 0.05, min: 0.8, max: 3.0) 추가.

### B. 에디터 UI 및 선택 바인딩 (`frontend/js/modules/editor-ui.js`)
- 캔버스에서 텍스트 객체(Fabric.js `Textbox`, `IText` 또는 무대 가이드박스) 선택 시, `lineHeight` 속성을 읽어 우측 속성 패널 `#text-lineheight` 입력 상자에 바인딩.
- `#text-lineheight` 입력값 변경 시 선택된 텍스트 객체의 `lineHeight` 업데이트 및 캔버스 재렌더링, 무대 모니터 모드인 경우 `notifyMonitorChanged()` 호출.

### C. 무대 모니터 연동 (`frontend/js/modules/editor-monitor.js`)
- 기존 좌측 사이드바 슬라이더 관련 무대 모니터 독립 바인딩 코드는 제거하고, 우측 속성 패널 바인딩 및 `currentGuideBox`, `nextGuideBox` `lineHeight` 동기화 중심의 통합 로직으로 정리.

### D. 뷰어 및 백엔드 API (`frontend/js/viewer.js`, `backend/routers/monitor.py`, `backend/monitor_repository.py`)
- 이미 구현된 `lineHeight` DB 저장/조회 및 뷰어 `style.lineHeight` 반영 로직 재활용 및 지속 유지.

## 3. Scope Boundaries (수정 가능 범위)

- **Allowed Scope**:
  - `docs/project-state.md`
  - `docs/changes/current/`
  - `frontend/editor.html`
  - `frontend/js/modules/editor-ui.js`
  - `frontend/js/modules/editor-monitor.js`
  - `frontend/js/viewer.js`
  - `backend/routers/monitor.py`
  - `backend/monitor_repository.py`
  - `backend/database.py`

- **Protected Scope**:
  - `backend/schemas.py`
  - `tests/`
  - `.antigravity/rules.md`
  - 기타 지정되지 않은 파일

## 4. 리스크 및 하위 호환성 (Safety Checks)
- 기존 저장된 설정 데이터의 `lineHeight` 기본값 `1.35` 유지.
- 우측 속성 패널에 기존 폰트/크기/색상/테두리/그림자와 일관된 디자인 시스템 적용으로 UX 가독성 보장.

## 5. 다음 단계
- 본 영향 분석 문서(`impact-analysis.md`) 승인 후 Phase 3 기술 설계 문서(`design.md`) 작성을 진행합니다.
