# 🏗️ [PROMPT] 2단계: System Design Doc 생성 대화 & 문서화 프롬프트

사용법:
1. `01-PRD.md`가 완료된 후, LLM과 아키텍처/DB/API 관련 기술적 사안을 논의합니다.
2. 논의 후 아래 프롬프트를 복사하여 LLM에게 전달합니다.

---

### 💬 LLM 전달용 프롬프트 (Design Doc 생성)

```text
우리가 작성한 `01-PRD.md` 내용과 기술 대화 내용을 바탕으로 기술 설계 문서(System Design Doc / RFC)를 작성해 줘.
코드 구현 시 LLM이 오해하지 않도록 DB 스키마, API 스펙, 예외 처리 케이스를 구체적으로 적어 줘.

[양식 구조]
# [프로젝트명] System Design Document (RFC)

## 1. 시스템 아키텍처 (System Architecture)
- 전체 컴포넌트 구조 및 데이터 흐름 (Data Flow)
- 기술 스택 (Tech Stack): Framework, DB, 라이브러리 선정 이유

## 2. 데이터 모델 및 스키마 (Data Schema)
- DB 테이블 구조 / Entity 모델 (컬럼명, 데이터 타입, 제약조건, FK/PK)
```sql
-- 예시 스키마 코드 포함
```

## 3. API 명세 및 인터페이스 계약 (API Contracts)
- **Endpoint 1:** `METHOD /api/v1/resource`
  - **Request Body / Parameters:**
  - **Response (200 OK):**
  - **Error Response (400/500):**

## 4. 예외 처리 및 엣지 케이스 (Edge Cases & Error Handling)
- 발생 가능한 기술적 엣지 케이스 3가지 이상과 처리 로직
- 실패 시 재시도/폴백(Fallback) 전략

## 5. 보안 및 성능 고려사항 (Security & Scalability)
- 인증/인가 방식 (JWT, Session 등)
- 캐싱, 인덱싱, 쿼리 최적화 전략
```
