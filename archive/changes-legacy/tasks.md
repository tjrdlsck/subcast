# Tasks Breakdown: CHG-045 무대 모니터 및 텍스트 속성 설정 창 줄간격(Line Height) 기능 개편

## 태스크 분해 개요

---

### Task 1: 우측 속성 설정 패널 HTML 줄간격 입력 필드 구성
- **대상 파일**: `frontend/editor.html`
- **세부 작업**:
  1. `#inspector-text-section` 내 '서체 및 크기' Row 부분에 `줄간격(행간)` 조절용 `input[type=number]` (`#text-lineheight`, min: 0.8, max: 3.0, step: 0.05, value: 1.35) 요소 추가.
  2. `panel-monitor` 패널 내 이전 슬라이더 UI 영역 깔끔하게 정돈.
- **성공 및 검증 기준**:
  - 에디터 페이지 우측 속성 창 텍스트 서식 섹션에 줄간격 입력 상자가 정상 레이아웃으로 표시됨.

---

### Task 2: 텍스트 객체 선택 UI 바인딩 및 줄간격 수정 연동
- **대상 파일**: `frontend/js/modules/editor-ui.js`, `frontend/js/modules/editor-monitor.js`
- **세부 작업**:
  1. `frontend/js/modules/editor-ui.js`: `updateInspectorUI()`에서 텍스트 객체 선택 시 `activeObj.lineHeight` 값을 읽어 `#text-lineheight` 필드에 바인딩 및 활성화.
  2. `#text-lineheight` 이벤트 수신기 등록: 입력 시 `activeObj.set({ lineHeight: val })`, `canvas.renderAll()`, 및 무대 모니터 모드인 경우 `notifyMonitorChanged()` 실행.
  3. `frontend/js/modules/editor-monitor.js`: 캔버스 가이드박스와 monitorSettings 간 `lineHeight` 동기화 보장.
- **성공 및 검증 기준**:
  - 캔버스에서 무대 모니터 CURRENT/NEXT 가이드박스 또는 일반 텍스트 클릭 시 우측 창 줄간격 값이 세팅되고, 숫자를 조절하면 캔버스 및 무대 모니터에 실시간 반영됨.

---

### Task 3: 무대 프롬프터 뷰어 및 백엔드 검증
- **대상 파일**: `frontend/js/viewer.js`, `tests/test_monitor_line_height.py`
- **세부 작업**:
  1. `pytest tests/test_monitor_line_height.py` 실행하여 백엔드 API & DB 저장 기능 연동 재확인.
  2. 프롬프터 뷰어 화면에서 `style.lineHeight` 적용 상태 검증.
- **성공 및 검증 기준**:
  - 백엔드 테스트 100% 통과 및 프롬프터 뷰어 줄간격 적용 확인.
