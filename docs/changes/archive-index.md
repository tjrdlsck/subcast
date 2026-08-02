# Change History Archive Index

## 현재 참조 순서

현재 작업은 다음 문서를 기준으로 한다.

1. 사용자의 최신 명시 요구
2. `docs/project-state.md`
3. 승인된 현재 변경 단위 문서
4. `docs/current/`
5. 기존 코드와 테스트

## 보존된 변경 기록

- `CHG-001` ~ `CHG-034`: 완료된 변경의 과거 상세 기록
- `CHG-035-workspace-state-and-change-history-consolidation`: 작업 기준 문서 정리 완료
- `CHG-036-push-and-reusable-change-docs`: 현재 고정 문서·푸쉬 규칙 정리 작업

완료된 변경의 상세 문서는 Git 커밋 이력에서 추적한다. 현재 요구사항이나 현재 시스템 상태는 `docs/changes/current/`와 `docs/current/`에서 확인한다.

`archive/`에는 현재 작업에 사용하지 않는 과거 계획과 일회성 스크립트를 보관한다. 기본 LLM 탐색 대상이 아니다.

## 기타 보관 영역

- `archive/templates/`: 이전 PRD·설계·태스크 프롬프트 템플릿
- `archive/legacy-docs/`: 사용하지 않는 빈 단계 문서
- `archive/legacy-plans/stage-confidence-monitor/`: 현재 작업과 분리된 기능 계획 문서
- `archive/legacy-plans/checklists/`: 이전 단계별 작업 체크리스트
- `archive/legacy-plans/`: 이전 리팩터링·기능 계획
- `archive/scripts/`: 현재 실행 흐름에서 사용하지 않는 일회성 스크립트

## 보존 정책

- 완료된 변경의 상세 내용은 Git 커밋 이력으로 보존한다.
- 작업 트리에는 활성 문서 다섯 개만 유지한다.
- 현재 시스템의 사실은 `docs/current/`에 반영한다.
- 현재 작업의 상태와 허용 범위는 `docs/project-state.md`에 반영한다.
- 중복 계획 문서의 이동 또는 삭제는 별도 승인된 변경으로 처리한다.
- 문서를 복원할 때 과거 내용을 현재 사실로 승격하지 않고, 코드와 테스트로 확인한다.
