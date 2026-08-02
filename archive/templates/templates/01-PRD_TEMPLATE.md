# 📋 [PROMPT] 1단계: PRD 생성 대화 & 문서화 프롬프트

사용법:
1. LLM과 자유롭게 아이디어를 대화합니다.
2. 대화가 어느 정도 정리되면 아래 프롬프트를 복사하여 LLM에게 전달합니다.

---

### 💬 LLM 전달용 프롬프트 (PRD 생성)

```text
지금까지 우리가 나눈 대화 내용을 바탕으로 빅테크 수준의 PRD(Product Requirement Document) 문서를 작성해 줘.
아래 양식 구조를 정확히 지켜서 마크다운으로 출력해 줘.

[양식 구조]
# [프로젝트명] PRD (Product Requirement Document)

## 1. 개요 및 배경 (Overview & Context)
- **목적 (Goal):** 이 프로젝트를 개발하는 주요 이유
- **해결하려는 문제 (Problem Statement):** 기존 방식의 불편함이나 한계점
- **주요 대상 사용자 (Target Audience):** 누구를 위한 시스템인가?

## 2. 핵심 기능 및 사용자 시나리오 (User Stories)
- **User Story 1:** [사용자 유형]으로서, 나는 [목적]을 위해 [기능]을 원한다.
  - **세부 요구사항:**
- **User Story 2:**

## 3. 수락 조건 (Acceptance Criteria)
- [ ] 기능 A가 정상 작동하고 조건 X를 만족해야 함 (성공 기준)
- [ ] 기능 B 실행 시 Y 예외가 발생하면 Z 메시지가 표시되어야 함

## 4. 비기능적 요구사항 (Non-Functional Requirements)
- **성능 (Performance):** 응답 속도, 처리량 등
- **보안 (Security):** 인증/인가, 데이터 암호화 등
- **사용성/디자인 (UI/UX):** 디자인 가이드라인

## 5. 범위 외 사항 (Out of Scope)
- 이번 버전에서 개발하지 않는 기능
```
