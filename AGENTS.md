# Agent Development Rules (Existing Application Workflow)

## Source of truth

다음 문서를 우선순위대로 따른다.

1. 사용자의 가장 최근 명시적 지시
2. 승인된 docs/changes/current/design.md
3. 승인된 docs/changes/current/impact-analysis.md
4. 승인된 docs/current/ 현행 시스템 문서들 (`system-overview.md`, `module-map.md`, `test-baseline.md` 등)
5. 기존 코드와 테스트

승인되지 않은 문서는 확정된 요구사항으로 취급하지 않는다.

## Legacy Application Workflow

이미 소스 코드가 존재하는 프로젝트이므로 신규 프로젝트용 문서 흐름을 사용하지 않는다.

### 1. 현행 시스템 기준선 확보 (Discovery & Baseline)
새로운 기능 수정 전, `docs/current/` 디렉터리에 현행 시스템 문서가 작성 및 승인되어야 한다.
- `docs/current/system-overview.md` (기술 스택, 엔트리포인트, 주요 도메인, 외부 연동)
- `docs/current/module-map.md` (모듈 구조, 레이어 경계, 의존 방향)
- `docs/current/test-baseline.md` (기존 검증 명령, 통과/실패 기준선)

### 2. 변경 관리 워크플로 (`docs/changes/current/`)
기능 추가/수정 요청 시 다음 순서로 문서를 생성하고 단계별 사용자 승인을 받는다.
1. `request.md` (변경 요청 정리)
2. `impact-analysis.md` (영향 분석, Allowed/Protected scope 정의)
3. `design.md` (기술 변경 설계)
4. `tasks.md` (작고 검증 가능한 단위의 태스크 분해)
5. `testing.md` (검증 계획 및 회귀 테스트 전략)
6. `Implementation` (태스크별 단계적 구현 및 검증)

현재 전체 상태는 `docs/project-state.md`를 기준으로 판단한다.

## Scope & Safety Control

- **Allowed Scope & Protected Scope**: `impact-analysis.md` 및 `project-state.md`에 명시된 `Allowed scope` 외의 파일(특히 `Protected scope`)은 승인 없이 수정할 수 없다.
- **Test Baseline**: 구현 전 `test-baseline.md`에 기록된 기존 테스트 결과(성공/실패)와 변경 후 결과를 비교하여 새로운 회귀 실패(Regression Failure)를 유발하지 않아야 한다.
- **Diff Budget**: 한 번에 하나의 태스크만 최소한의 변경으로 구현하며, 관련 없는 포맷팅 변경이나 무분별한 리팩터링을 금지한다.

## Approval Gate

사용자의 명시적 승인 없이 다음을 수행하지 않는다.

* 다음 문서 단계 진입
* 소스 코드 수정
* 의존성 설치 / 패키지 추가
* 데이터베이스 마이그레이션
* 외부 서비스 생성 및 배포

## Implementation Gate

다음 문서가 모두 사용자에게 승인(APPROVED)되기 전에는 소스 코드를 수정하지 않는다.

* `docs/changes/current/impact-analysis.md`
* `docs/changes/current/design.md`
* `docs/changes/current/tasks.md`
* `docs/changes/current/testing.md`

## Commit & Push Gate

작업 완료 후 다음 조건을 모두 만족하면 현재 작업 브랜치에 커밋하고 푸쉬한다.

- 활성 작업 문서는 `docs/changes/current/` 아래의 `request.md`, `impact-analysis.md`, `design.md`, `tasks.md`, `testing.md`를 재사용한다.
- 이전 작업의 커밋과 푸쉬가 확인되기 전에는 활성 문서를 덮어쓰지 않는다.
- 테스트·문서·범위 검증 결과를 확인하고, 기존 기준선 실패와 새로운 회귀를 구분한다.
- 현재 브랜치가 `main` 또는 `master`가 아니고 detached HEAD가 아니며 upstream이 연결되어 있어야 한다.
- 커밋 제목은 변경 목적을 요약하며 코드나 문서 전문을 제목에 넣지 않는다.
- 강제 푸쉬와 원격 브랜치 삭제는 수행하지 않는다.
- 기존 사용자 소유 미커밋 변경과 Protected Scope 파일은 커밋에 포함하지 않는다.
- 외부 상태를 변경하는 커밋·푸쉬는 현재 승인 정책과 실행기 권한을 따른다.

조건을 만족하지 못하면 푸쉬하지 않고 차단 사유와 현재 상태를 보고한다.

## Archive Exclusion

- `archive/`는 과거 계획과 일회성 스크립트 보관 영역이다.
- 일반적인 코드 탐색, 리팩터링, 변경 영향 분석에서 `archive/`를 읽지 않는다.
- 사용자가 특정 아카이브 파일의 복원·검토를 명시한 경우에만 읽는다.

## Antigravity-only Automated Codex CLI Debugging Pipeline

이 절차는 Antigravity/Gemini가 외부 실행기로 Codex CLI를 호출해야 할 때만 적용한다. Codex가 현재 Codex 세션에서 작업할 때는 자신을 다시 `codex exec`로 호출하지 않는다.

사용자가 Antigravity에서 Codex 교차 검증을 명시적으로 요청한 경우에만 다음 자동화 프로토콜을 수행한다.

1. **컨텍스트 추출 (Context Extraction)**:
   - `ripgrep`으로 관련 파일 및 $N \pm 50$줄 소스코드 위치 파악.
   - 에러 로그 및 Stack Trace 핵심 내용 수집.
2. **Codex CLI 자동 실행 (Auto-Execution)**:
   - `run_command`를 사용하여 인라인 프롬프트를 `codex exec`로 전달.
   - PowerShell 인라인 처리: `@'<Prompt>'@ | codex exec -s read-only`
3. **2차 교차 검증 및 원인 제공 (Cross-Critique & Solution)**:
   - `codex exec`의 출력 결과(STDOUT)를 수신하여 사이드 이펙트 및 환각(Hallucination) 여부 2차 검증.
   - 최종적으로 검증된 원인과 최소 수정안을 사용자에게 보고.

## Codex Workflow Integration

Codex에서도 사용자의 자연어 요구사항을 받으면 `.agents/skills/product-orchestrator/SKILL.md`의 단계별 워크플로를 따른다.

- 작업 시작 시 `docs/project-state.md`, 승인된 `docs/current/` 기준선, 현재 변경 단위 문서를 확인한다.
- 현재 단계의 문서 하나만 작성하거나 수정하고, 사용자의 명시적 승인 전에는 다음 단계로 이동하지 않는다.
- 구현 전 `impact-analysis.md`, `design.md`, `tasks.md`, `testing.md`의 승인 상태를 모두 확인한다.
- 대용량 파일은 `rg`로 대상 위치를 먼저 찾고 필요한 줄 범위만 읽는다. API·스키마·시그니처는 정의를 확인한 후 사용한다.
- 태스크별로 최소 diff를 만들고 관련 검증을 즉시 실행한다. 검증하지 못한 결과를 완료로 선언하지 않는다.
- `.antigravity/rules.md`와 `.agent/agents/product-orchestrator/agent.md`는 Antigravity의 보호 대상이다. Codex 작업에서 삭제·이름 변경·자동 덮어쓰기를 하지 않는다.
- 현재 작업 폴더의 기존 미커밋 변경은 사용자 소유로 간주하고, 이번 변경 범위와 무관하면 수정·정리하지 않는다.

## Codex Workflow Integration

Codex에서도 사용자의 자연어 요구사항을 받으면 `.agents/skills/product-orchestrator/SKILL.md`의 단계별 워크플로를 따른다.

- 작업 시작 시 `docs/project-state.md`, 승인된 `docs/current/` 기준선, 현재 변경 단위 문서를 확인한다.
- 현재 단계의 문서 하나만 작성하거나 수정하고, 사용자의 명시적 승인 전에는 다음 단계로 이동하지 않는다.
- 구현 전 `impact-analysis.md`, `design.md`, `tasks.md`, `testing.md`의 승인 상태를 모두 확인한다.
- 대용량 파일은 `rg`로 대상 위치를 먼저 찾고 필요한 줄 범위만 읽는다. API·스키마·시그니처는 정의를 확인한 후 사용한다.
- 태스크별로 최소 diff를 만들고 관련 검증을 즉시 실행한다. 검증하지 못한 결과를 완료로 선언하지 않는다.
- `.antigravity/rules.md`와 `.agent/agents/product-orchestrator/agent.md`는 Antigravity의 보호 대상이다. Codex 작업에서 삭제·이름 변경·자동 덮어쓰기를 하지 않는다.
- 현재 작업 폴더의 기존 미커밋 변경은 사용자 소유로 간주하고, 이번 변경 범위와 무관하면 수정·정리하지 않는다.

