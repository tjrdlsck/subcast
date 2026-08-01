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
