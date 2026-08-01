# Project Workflow State (Legacy Application Mode)

## Baseline Status

| Baseline Document | Status | Approved At |
|---|---|---|
| system-overview.md | APPROVED | 2026-08-01 |
| module-map.md | APPROVED | 2026-08-01 |
| test-baseline.md | APPROVED | 2026-08-01 |

## Active Change Unit

- Change ID: `CHG-014-fix-stage-bg-tag-matching`
- Target Feature: 현장 배경 분위기 태그 정규화/매칭 고도화 및 한 곡 전체 슬라이드 동일 배경 유지 보장

## Change Workflow State

| Phase | Status | Approved At |
|---|---|---|
| Change Request | APPROVED | 2026-08-01 |
| Impact Analysis | APPROVED | 2026-08-01 |
| Change Design | APPROVED | 2026-08-01 |
| Tasks Breakdown | APPROVED | 2026-08-01 |
| Testing Strategy | APPROVED | 2026-08-01 |
| Implementation | COMPLETED | 2026-08-01 |

## Scope Boundaries

- **Allowed Scope**:
  - `backend/services/mood_matching.py`
  - `backend/main.py`
  - `frontend/js/modules/editor-praise.js`
  - `frontend/js/modules/editor-stage-bg.js`
  - `frontend/js/presenter.js`
  - `tests/test_mood_matching.py`
  - `tests/test_praise_fixed_background.py`
  - `docs/changes/CHG-014-fix-stage-bg-tag-matching/`
  - `docs/project-state.md`
- **Protected Scope**:
  - `backend/`
  - `frontend/editor.html`
  - `frontend/js/modules/editor-elements.js`
  - `frontend/js/modules/editor-monitor.js`
  - `run.py`
  - 기타 지정되지 않은 소스 파일

## Existing Baseline Failures

- `tests/test_template_undo.py`: 웹소켓 메시지 대기 블로킹 이슈 (수동 검증 대상)

## Confirmed Decisions

- CHG-001 ~ CHG-014 완료

## Open Questions

- 없음

## Change History

- 2026-08-01: CHG-001 ~ CHG-013 완료
- 2026-08-01: CHG-014-fix-stage-bg-tag-matching 완료 (현장 배경 분위기 태그 정규화/매칭 고도화 및 한 곡 전체 슬라이드 동일 배경 유지 보장)