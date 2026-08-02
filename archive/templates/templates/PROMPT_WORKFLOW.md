# 🚀 바이브 코딩(Vibe Coding) 문서 자동 생성 및 실행 가이드

이 문서 모음은 **LLM과 자유롭게 대화한 후, 대화 내용을 기반으로 빅테크 수준의 개발 문서를 자동 생성**할 수 있도록 설계된 프롬프트 템플릿 세트입니다.

---

## 🔄 워크플로우 3단계 요약

```text
[1. 아이디어 대화] ➔ [PRD 프롬프트 실행] ➔ docs/01-PRD.md 생성
       ↓
[2. 기술 구조 대화] ➔ [Design 프롬프트 실행] ➔ docs/02-DESIGN.md 생성
       ↓
[3. 작업 분할 요청] ➔ [Task 프롬프트 실행] ➔ docs/03-TASKS.md 생성
       ↓
[4. 바이브 코딩 시작!] ➔ "docs/03-TASKS.md의 Task 1.1을 구현하고 tests/로 검증해줘"
```

---

## 📂 템플릿 파일 목록 및 링크

1. [`01-PRD_TEMPLATE.md`](file:///C:/cli-develop/subcast/docs/templates/01-PRD_TEMPLATE.md)
   - **사용 시점:** 서비스 기능/목적/사용자 시나리오를 대화로 정리한 직후
2. [`02-DESIGN_TEMPLATE.md`](file:///C:/cli-develop/subcast/docs/templates/02-DESIGN_TEMPLATE.md)
   - **사용 시점:** DB 구조, API 방식, 기술 스택을 논의한 직후
3. [`03-TASKS_TEMPLATE.md`](file:///C:/cli-develop/subcast/docs/templates/03-TASKS_TEMPLATE.md)
   - **사용 시점:** PRD와 Design Doc 완성 후 코딩 진입 직전

---

## 💡 바이브 코딩 실전 팁 (Best Practices)

1. **대화 후 즉시 문서화:**
   - 대화가 5~10분 정도 진행되고 방향성이 정해지면 해당 프롬프트를 던져 마크다운 파일로 저장하세요.
2. **LLM 메모리 리셋 방지:**
   - 대화가 길어져 context window가 차면, 미리 작성해 둔 `docs/01-PRD.md`와 `docs/02-DESIGN.md`를 LLM에게 파일로 읽히면 단번에 전체 context가 복원됩니다.
3. **Task 단위 코딩:**
   - "전체 다 구현해 줘"가 아니라, "`docs/03-TASKS.md`의 Task 1.1만 구현하고 단위 테스트를 돌려줘"라고 지시해야 버그 없는 실전 코딩이 가능합니다.
