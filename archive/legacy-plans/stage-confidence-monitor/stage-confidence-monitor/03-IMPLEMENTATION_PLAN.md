# Subcast 무대 모니터링 시스템 Implementation Tasks & Checklists

**Document ID:** Subcast-IMP-2026-001  
**Target:** Subcast Stage Confidence Monitor Subsystem  
**Reference Docs:** [`01-PRD.md`](file:///C:/cli-develop/subcast/docs/stage-confidence-monitor/01-PRD.md), [`02-SYSTEM_DESIGN_DOC.md`](file:///C:/cli-develop/subcast/docs/stage-confidence-monitor/02-SYSTEM_DESIGN_DOC.md)  

---

## 📌 마일스톤 개요 (Milestones Summary)

- **Phase 1: 기반 설정 및 데이터 모델링 (DB & Data Layer)** - SQLite3 스키마 정의, DAO 작성, DB 유닛 테스트
- **Phase 2: 코어 백엔드 API 구현 (Backend API Layer)** - GET/PUT 모니터링 레이아웃 API 작성 및 엔드포인트 검증
- **Phase 3: 방송실 에디터 캔버스 연동 (Editor UI & Canvas Layer)** - Fabric.js 기반 🔴 CURRENT / 🔵 NEXT 박스 독립 편집 및 비례 좌표 정규화
- **Phase 4: 무대 모니터 뷰어 렌더링 및 동기화 (Stage Viewer & E2E Sync)** - `viewer.html?mode=monitor` 동적 렌더링 및 BroadcastChannel 초저지연 이벤트 동기화

---

## 🛠 Phase 1: 백엔드/데이터베이스 기반 작업

- [ ] **Task 1.1: DB 스키마 및 엔티티 마이그레이션 모듈 작성**
  - **상세 내용:** `02-SYSTEM_DESIGN_DOC.md`에 명시된 `monitor_settings` 테이블 생성 스크립트를 `backend/` 데이터베이스 초기화 로직에 반영하고 기본 레코드(`default_profile`)를 삽입합니다.
  - **검증 기준 (Verification):** DB 마이그레이션 완료 후 `tests/test_monitor_db.py`를 실행하여 테이블 생성 여부 및 초기값 조회 성공 검증.
  ```bash
  pytest tests/test_monitor_db.py
  ```

- [ ] **Task 1.2: 기본 데이터 액세스 레이어 (MonitorSettingsRepository) 작성**
  - **상세 내용:** `get_monitor_settings()` 및 `update_monitor_settings(settings)` CRUD 함수 작성. 입력값에 대한 수치 범위($0 \le leftPct \le 100$, $10 \le fontSize \le 200$) 유효성 검증(Validation) 로직 포함.
  - **검증 기준:** `tests/test_monitor_repository.py` 유닛 테스트 수행 및 100% 코드 커버리지 통과 확인.

---

## 🛠 Phase 2: API 엔드포인트 및 비즈니스 로직

- [ ] **Task 2.1: `GET /api/v1/monitor/settings` API 구현**
  - **상세 내용:** 현재 백엔드 저장소에 보관된 모니터링 레이아웃 설정을 불러와 JSON 형태로 반환하는 라우팅 컨트롤러 구현.
  - **검증 기준:** `tests/test_monitor_api.py` 실행 시 HTTP Status Code 200 및 JSON Response Schema 검증 통과.

- [ ] **Task 2.2: `PUT /api/v1/monitor/settings` API 구현**
  - **상세 내용:** 사용자가 조정한 상대 비율 좌표 및 스타일 데이터를 받아 DB에 업데이트하고, 갱신된 타임스탬프 반환.
  - **검증 기준:** 
    - 정상적인 Payload 전달 시 HTTP Status Code 200 확인.
    - 범위를 벗어난 잘못된 Payload 전달 시 HTTP Status Code 400 및 `INVALID_BOUNDS` 에러 코드 검증.

---

## 🛠 Phase 3: 프론트엔드 에디터 연동 및 UI 개발

- [ ] **Task 3.1: 에디터 모니터링 탭 캔버스 렌더러 구현 (`frontend/js/editor.js`)**
  - **상세 내용:** Fabric.js 캔버스상에 🔴 CURRENT 및 🔵 NEXT 텍스트 박스 객체를 직관적으로 생성 및 배치. 메인 슬라이드 데이터 오염을 차단하는 독립 캔버스 렌더링 함수 작성.
  - **검증 기준:** 모니터링 탭 진입 시 캔버스에 2개 가이드 박스가 올바른 초기 위치에 시각화되고, 일반 슬라이드 탭 전환 시 캔버스가 원래 상태로 복원되는지 확인.

- [ ] **Task 3.2: 캔버스 이벤트 정규화 및 설정 저장 연동**
  - **상세 내용:** 텍스트 박스 리사이즈/이동 이벤트 발생 시 상대 비율 좌표($X_{\%}, Y_{\%}, W_{\%}, H_{\%}$) 및 폰트 크기($fontSize$)를 실시간 정규화 계산하여 백엔드 API 및 LocalStorage로 저장.
  - **검증 기준:** 드래그 앤 드롭 후 페이지 새로고침 시 변경된 위치와 폰트 크기가 유지되는지 확인.

---

## 🛠 Phase 4: 무대 모니터 뷰어 연동 및 E2E 통합 테스트

- [ ] **Task 4.1: 무대 전용 모니터 뷰어 렌더링 로직 구현 (`frontend/js/viewer.js`)**
  - **상세 내용:** `viewer.html?mode=monitor` 접속 시 상대 비율 좌표를 읽어와 무대 디스플레이 크기($W_{\text{screen}}, H_{\text{screen}}$)에 맞게 렌더링 역정규화 계산 후 카드 배치.
  - **검증 기준:** 해상도를 다양하게 변경(FHD, QHD, 임의 크기)해도 모니터 카드 비율 및 폰트 크기가 깨지지 않고 비례 스케일링되는지 확인.

- [ ] **Task 4.2: BroadcastChannel 기반 초저지연 실시간 동기화 구현**
  - **상세 내용:** 방송실 슬라이드 선택 변경 시 `postMessage("SLIDE_CHANGE", ...)` 이벤트를 발행하고 무대 모니터에서 이를 수신하여 CURRENT에 $idx$, NEXT에 $idx+1$ 슬라이드 텍스트를 지연 없이 갱신.
  - **검증 기준:** 슬라이드 변경 키 입력 후 무대 화면 갱신까지 지연 시간 $\le 50\text{ms}$ 측정 및 E2E 테스트 통과 (`tests/test_e2e_monitor.py`).

---

## 📚 참고자료 (Key References)

1. **Python Pytest Framework Guide**: [https://docs.pytest.org/en/stable/](https://docs.pytest.org/en/stable/)
2. **Fabric.js Event System**: [http://fabricjs.com/fabric-events](http://fabricjs.com/fabric-events)
