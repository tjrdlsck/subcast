# 📋 모듈화 및 리팩토링 표준 계획 프롬프트 템플릿 (REFACTOR_PROMPT_TEMPLATE.md)

> 이 템플릿은 1단계 AI(Gemini Flash 등)가 코드베이스를 스캔한 후, 2단계 실행 AI(Codex CLI, Claude Code 등)에게 모듈화 및 코드 수정을 지시할 때 사용하는 **성공률 100% 보장형 계획 프롬프트 표준 규격**입니다.

---

## 📄 [템플릿] 2단계 AI 전달용 리팩토링 지침서

```markdown
# 📋 모듈화 및 리팩토링 수행 지침서 (Refactoring Specification)

## 1. 작업 개요 (Overview)
- 원본 파일 (Source): `[예: backend/main.py]`
- 신규 모듈 파일 (Destination): `[예: backend/routers/projects.py]`

## 2. 모듈 이관 대상 (Extraction Targets)
- 원본 파일에서 다음 함수/클래스를 신규 모듈로 온전히 추출하여 이동할 것:
  1. `[함수/클래스명 1]`
  2. `[함수/클래스명 2]`

## 3. 동반 이관 의존성 (Included Dependencies)
- 추출 대상 로직이 정상 작동하기 위해 필요한 다음 요소들도 신규 모듈 상단에 포함할 것:
  - Required Imports: `[예: import os, from fastapi import APIRouter ...]`
  - Global Variables / Constants: `[예: DB_PATH, ALLOWED_EXTENSIONS ...]`
  - Helper Functions: `[예: validate_project_id() ...]`

## 4. 아키텍처 및 인터페이스 규칙 (Strict Rules)
1. [인터페이스 유지]: 이관되는 함수의 이름, 매개변수 타입, 반환값 구조를 절대 변경하지 말 것.
2. [순환 참조 금지]: 신규 모듈(`destination`)에서 원본 파일(`source`)을 역으로 `import`하지 말 것.
3. [원본 파일 갱신]: 원본 파일에서는 이동된 함수 코드를 제거하고, 신규 모듈을 `import`하여 기존 호출부가 정상 작동하도록 연동할 것.
4. [코드 생략 금지]: `...`이나 `# 기존 로직 유지` 같은 생략 주석을 절대 사용하지 말고, 실행 가능한 완전한 Full Code로 작성할 것.

## 5. 실행 결과 검증 (Verification)
- 작성 완료 후 구문 오류(SyntaxError) 및 참조 오류(NameError)가 없는지 검증할 것.
```

---

## 💡 실전 사용 예시 (`backend/main.py` ➔ `projects.py` 분리 시)

```markdown
# 📋 [실전 예시] 프로젝트 관리 API 모듈화 지침서

## 1. 작업 개요
- 원본 파일: `backend/main.py`
- 신규 모듈: `backend/routers/projects.py`

## 2. 모듈 이관 대상
- `main.py` 내의 다음 FastAPI 엔드포인트를 `projects.py`로 이동:
  1. `get_projects()`
  2. `create_project()`
  3. `delete_project()`

## 3. 동반 이관 의존성
- `projects.py` 상단에 다음 필수 요소를 포함할 것:
  - `from fastapi import APIRouter, HTTPException, Depends`
  - `from backend.schemas import ProjectCreate, ProjectResponse`
  - `from backend.storage import get_db_connection`
  - Router 객체 선언: `router = APIRouter(prefix="/api/projects", tags=["projects"])`

## 4. 아키텍처 규칙
- `projects.py`는 `main.py`를 참조해서는 안 됨.
- `main.py`에서는 `from backend.routers.projects import router as projects_router`를 추가하고 `app.include_router(projects_router)`로 연동할 것.
- 모든 코드는 생략 없이 완전하게(Full Code) 작성할 것.
```
