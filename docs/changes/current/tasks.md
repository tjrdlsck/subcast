# Tasks: CHG-036-push-and-reusable-change-docs

## Task 1: 현재 문서 이관

- CHG-036의 승인 내용을 `docs/changes/current/` 다섯 파일에 반영한다.
- 검증: 파일 수가 정확히 5개인지 확인한다.

## Task 2: 경로 규칙 정렬

- Codex, Antigravity, 오케스트레이터 규칙을 `docs/changes/current/` 기준으로 수정한다.
- 검증: 활성 문서를 `docs/changes/current/`에서 찾도록 요구하는지 확인한다.

## Task 3: 이력 인덱스 정렬

- 완료 변경은 Git 커밋 이력으로 보존한다는 정책을 `archive-index.md`에 기록한다.
- 검증: 현재 작업 문서와 과거 이력의 역할이 구분되는지 확인한다.

## Task 4: 기존 폴더 삭제

- `docs/changes/CHG-*` 폴더만 삭제한다.
- 검증: `current/`, `archive-index.md`, 보호 범위는 남아 있는지 확인한다.

## Task 5: 최종 검증

- 문서 링크·경로·Git 상태를 확인한다.
- 코드, DB, 테스트, 캐시 외 설정 파일은 삭제하지 않았는지 확인한다.

## 태스크 작성 양식

태스크는 의존성 순서에 따라 작고 검증 가능한 단위로 나눈다.

### 마일스톤

- Phase 1: 기반 및 데이터 구조
- Phase 2: 백엔드/API
- Phase 3: 프론트엔드/UI 및 통합

### 태스크 형식

#### Task N: [작업명]

- 상세 내용:
- 변경 파일:
- 의존 태스크:
- 검증 방법:
