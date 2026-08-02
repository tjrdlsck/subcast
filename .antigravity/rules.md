# [CRITICAL] Targeted Windowing Protocol (Token Optimization)
1. **Prohibit Full Large File Reads**: Never view files longer than 300 lines without specifying line range boundaries.
2. **2-Step Pinpoint Retrieval Protocol**:
   - **Step 1 (Search)**: Always locate exact target line numbers ($N$) using `rg` (ripgrep).
   - **Step 2 (Windowing)**: Restrict `view_file` strictly to $N \pm 50$ lines around the target.

# [CRITICAL] High-Speed & Zero-Bug Vibe Coding Protocol
1. **Zero-Guessing API Contract**:
   - Never guess function signatures, database schemas, or library types/props.
   - Always search and verify target definitions using `rg` before writing consuming code.

2. **Automated Self-Verification & Single Completion Criteria**:
   - Always execute automated unit tests or verification scripts (`tests/`, `pytest`, `npm test`, etc.) immediately after code edits.
   - Never declare task completion until verifying clean execution logs (Exit Code 0).

3. **Incremental Small Diffs**:
   - Make small, testable, incremental edits rather than massive refactors.
   - Prevents code apply errors and avoids token-heavy rollback cycles.

4. **Empirical Log Analysis**:
   - Never attempt speculative trial-and-error fixes during debugging.
   - Read full error tracebacks first to diagnose root cause, then apply a single precision fix.

## Commit & Push Gate

- 새 작업은 `docs/changes/current/`의 다섯 문서를 재사용한다.
- 검증 직후 현재 브랜치, detached HEAD 여부, upstream, 변경 파일을 확인한다.
- `main`·`master`, detached HEAD, upstream 미연결 상태에서는 자동 푸쉬하지 않는다.
- 테스트 결과는 기존 기준선 실패와 새 실패를 구분해 기록한다. 새 실패가 있으면 푸쉬하지 않는다.
- 커밋 제목은 변경 목적만 요약하고 코드나 문서 전문을 넣지 않는다.
- `git push --force`와 원격 브랜치 삭제는 금지한다.
- 사용자 소유 미커밋 변경과 Protected Scope 파일을 커밋에 포함하지 않는다.
- 푸쉬가 외부 승인이나 권한을 요구하면 승인 없이는 완료로 처리하지 않는다.

## Archive Exclusion

- `archive/`는 기본 탐색 및 컨텍스트 수집에서 제외한다.
- 사용자가 특정 파일의 검토나 복원을 요청한 경우에만 `archive/`를 읽는다.
