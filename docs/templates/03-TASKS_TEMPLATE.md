# 📝 [PROMPT] 3단계: Implementation Plan & Task Breakdown 생성 프롬프트

사용법:
1. `01-PRD.md`와 `02-DESIGN.md` 생성이 완료되었을 때 호출합니다.
2. 개발 작업을 의존성 순서에 따라 분할하고 체크리스트로 만드는 문서입니다.

---

### 💬 LLM 전달용 프롬프트 (Tasks 생성)

```text
`01-PRD.md`와 `02-DESIGN.md`를 바탕으로, 한 번에 하나씩 코딩하고 테스트할 수 있도록 세부 작업 분할 문서(Implementation Plan)를 작성해 줘.
작업은 의존성(DB -> API -> UI) 순서로 나열하고, 각 작업마다 검증할 테스트 기준을 명시해 줘.

[양식 구조]
# [프로젝트명] Implementation Tasks & Checklists

## 📌 마일스톤 개요 (Milestones Summary)
- Phase 1: 기반 설정 및 데이터 모델링
- Phase 2: 코어 백엔드 API 구현
- Phase 3: 프론트엔드/UI 연동 및 통합 테스트

---

## 🛠 Phase 1: 백엔드/데이터베이스 기반 작업
- [ ] **Task 1.1: DB 모델 및 엔티티 생성**
  - **상세 내용:** `02-DESIGN.md`의 스키마를 바탕으로 ORM/테이블 작성
  - **검증 기준 (Verification):** DB 마이그레이션 정상 완료 및 테스트 DB 연결 확인 (`tests/test_models.py`)

- [ ] **Task 1.2: 기본 데이터 액세스 레이어(Repository/DAO) 작성**
  - **상세 내용:** 기본 CRUD 함수 작성
  - **검증 기준:** CRUD 유닛 테스트 통과

---

## 🛠 Phase 2: API 엔드포인트 및 비즈니스 로직
- [ ] **Task 2.1: [기능명] API 엔드포인트 구현**
  - **상세 내용:** API 명세에 맞춰 컨트롤러 및 서비스 작성
  - **검증 기준:** API 통합 테스트 (Status Code 200/400 검증)

---

## 🛠 Phase 3: 프론트엔드 연동 및 E2E 테스트
- [ ] **Task 3.1: [화면명] UI 컴포넌트 개발 및 API 연동**
  - **상세 내용:** API 연동 및 상태 관리 작성
  - **검증 기준:** 실제 화면에서 데이터 정상 출력 확인
```
