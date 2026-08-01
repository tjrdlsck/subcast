# Agent Development Rules (Existing Application Workflow)

## Source of truth

다음 문서를 우선순위대로 따른다.

1. 사용자의 가장 최근 명시적 지시
2. 승인된 docs/changes/{CHANGE_ID}/design.md
3. 승인된 docs/changes/{CHANGE_ID}/impact-analysis.md
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

### 2. 변경 관리 워크플로 (`docs/changes/{CHANGE_ID}/`)
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

* `docs/changes/{CHANGE_ID}/impact-analysis.md`
* `docs/changes/{CHANGE_ID}/design.md`
* `docs/changes/{CHANGE_ID}/tasks.md`
* `docs/changes/{CHANGE_ID}/testing.md`
