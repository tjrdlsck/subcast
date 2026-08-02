# Project Workflow State (Legacy Application Mode)

## Baseline Status

| Baseline Document | Status | Approved At |
|---|---|---|
| system-overview.md | APPROVED | 2026-08-01 |
| module-map.md | APPROVED | 2026-08-01 |
| test-baseline.md | APPROVED | 2026-08-01 |

## Active Change Unit

- Change ID: `CHG-036-push-and-reusable-change-docs`
- Target Feature: 고정 작업 문서 재사용과 검증 후 브랜치 커밋·푸쉬 절차

## Change Workflow State

| Phase | Status | Approved At |
|---|---|---|
| Change Request | APPROVED | 2026-08-02 |
| Impact Analysis | APPROVED | 2026-08-02 |
| Change Design | APPROVED | 2026-08-02 |
| Tasks Breakdown | APPROVED | 2026-08-02 |
| Testing Strategy | APPROVED | 2026-08-02 |
| Implementation | IN PROGRESS | 2026-08-02 |

## Scope Boundaries

- **Allowed Scope**:
  - `docs/project-state.md`
  - `docs/changes/current/`
  - `docs/current/system-overview.md`
  - `docs/current/module-map.md`
  - `docs/current/test-baseline.md`
  - `AGENTS.md`
  - `.antigravity/rules.md`
  - `.agent/agents/product-orchestrator/agent.md`
  - `.codex/config.toml`
- **Protected Scope**:
  - `backend/`
  - `frontend/`
  - `tests/`
  - `run.py`
  - `requirements.txt`
  - `build_all.py`
  - `.antigravity/rules.md`
  - `.agent/agents/product-orchestrator/agent.md`
  - 기존 변경 단위 문서
  - 기타 지정되지 않은 파일

## Existing Baseline Failures

- `tests/test_template_undo.py`: 웹소켓 메시지 대기 블로킹 이슈 (수동 검증 대상)
- 기준선 재실행 결과: 123개 수집, 97개 통과, 26개 실패
- 모니터 프론트엔드 관련 26개 테스트: 현재 파일과 기존 테스트 기대치 불일치

## Confirmed Decisions

- CHG-001 ~ CHG-034 완료된 변경 기록으로 취급
- CHG-035는 작업 기준 문서 정리 변경으로 완료

## Open Questions

- 현재 문서에 기록되지 않은 과거 변경의 세부 내용은 복원하지 않고, 확인 가능한 사실만 유지한다.

## Change History

- 2026-08-01: CHG-001 ~ CHG-013 완료
- 2026-08-01: CHG-014-fix-stage-bg-tag-matching 완료 (현장 배경 분위기 태그 정규화/매칭 고도화 및 한 곡 전체 슬라이드 동일 배경 유지 보장)
- 2026-08-02: CHG-020 ~ CHG-025 완료 (텍스트 Stroke paintFirst 적용, 모니터 속성 동기화/렌더링, 백엔드 영속화, 실시간 미리보기 브로드캐스트, 성경 호버 미리보기 버그 수정, 찬양 배경 중복방지 알고리즘)
- 2026-08-02: CHG-026 ~ CHG-034 완료된 변경 기록으로 확인
- 2026-08-02: CHG-035 작업 기준 문서와 변경 기록 정리 완료 (코드 변경 없음, 기준선 97 passed / 26 failed)
