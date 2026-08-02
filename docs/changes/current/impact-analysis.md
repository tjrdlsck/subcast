# Impact Analysis: CHG-036-push-and-reusable-change-docs

## Allowed Scope

- `docs/changes/current/`
- `docs/changes/archive-index.md`
- `docs/project-state.md`
- `AGENTS.md`
- `.antigravity/rules.md`
- `.agent/agents/product-orchestrator/agent.md`
- `.agents/skills/product-orchestrator/SKILL.md`

## Protected Scope

- `backend/`, `frontend/`, `tests/`
- `run.py`, `requirements.txt`, `build_all.py`, `GAE_Bible.db`
- 기존 사용자 소유 미커밋 변경
- `.git/` 내부 데이터
- 강제 푸쉬와 원격 브랜치 삭제

## 영향

- 런타임 코드와 테스트 동작에는 영향이 없다.
- 과거 `CHG-*` 폴더는 작업 트리에서 제거되지만, 이미 커밋된 기록은 Git 이력에 남는다.
- 현재 작업 문서와 변경 요약 인덱스는 유지한다.

## 위험과 완화

- 삭제 전 `current/`에 CHG-036의 상세 내용을 이관하고 파일 수를 검증한다.
- 기존 변경 폴더가 Git에 추적되어 있는지 확인한 뒤 삭제한다.
- 보호 범위 파일은 삭제 대상에 포함하지 않는다.
