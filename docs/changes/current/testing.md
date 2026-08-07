# Testing Strategy: CHG-045 무대 모니터 및 텍스트 속성 설정 창 줄간격(Line Height) 기능 개편

## 1. 검증 목표 및 방침
- **목적**: 우측 텍스트 속성 설정 창(`inspector-text-section`)을 통한 줄간격 조절 기능이 캔버스 텍스트 객체, 무대 모니터 설정, 프롬프터 뷰어에 오류 없이 완벽하게 연동되는지 검증.

---

## 2. 테스트 항목 및 시나리오

### A. 우측 속성 설정 패널 UI & 바인딩 테스트
1. **텍스트 객체 선택 바인딩**:
   - 무대 모니터 가이드박스(CURRENT/NEXT) 또는 일반 슬라이드 텍스트 선택 시 우측 창의 `#text-lineheight` 필드에 객체의 `lineHeight` (기본 1.35)가 정확히 표출 및 활성화되는지 확인.
2. **줄간격 변경 및 캔버스 갱신**:
   - `#text-lineheight` 값을 `1.80`으로 변경 시 캔버스 상의 텍스트 행간이 실시간으로 넓어지는지 확인.
   - `0.80` ~ `3.00` 유효 범위 제한 동작 확인.
3. **무대 모니터 설정 저장 및 뷰어 반영**:
   - 무대 모니터 가이드박스의 줄간격 변경 후 설정 저장 시 `PUT /api/v1/monitor/settings`에 해당 `lineHeight` 값이 저장되고, 프롬프터 뷰어(`monitor.html`) DOM `style.lineHeight`에 즉시 전달되어 반영되는지 확인.

### B. 백엔드 API 자동화 테스트
- `tests/test_monitor_line_height.py` 실행하여 API 저장/조회 및 유효성 검사 성공(Exit Code 0) 유지 확인.

---

## 3. 검증 실행 계획
1. `tests/test_monitor_line_height.py` pytest 실행.
2. UI 바인딩 및 이벤트 처리 코드 작성 후 정적/단위 검증.
