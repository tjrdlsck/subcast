# Project Workflow State (Legacy Application Mode)

## Baseline Status

| Baseline Document | Status | Approved At |
|---|---|---|
| system-overview.md | APPROVED | 2026-08-01 |
| module-map.md | APPROVED | 2026-08-01 |
| test-baseline.md | APPROVED | 2026-08-01 |

## Active Change Unit

- Change ID: `CHG-013-fix-text-shadow-and-clipboard-selection-copy`
- Target Feature: 글자 그림자 효과 체크박스/컨트롤 연동 및 화면 텍스트 선택 복사(Ctrl+C) 정상화

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
  - `frontend/js/modules/editor-init.js`
  - `frontend/js/modules/editor-history.js`
  - `frontend/js/presenter.js`
  - `frontend/js/viewer.js`
  - `docs/changes/CHG-013-fix-text-shadow-and-clipboard-selection-copy/`
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

- CHG-001 ~ CHG-013 완료

## Open Questions

- 없음

## Change History

- 2026-08-01: CHG-001 ~ CHG-012 완료
- 2026-08-01: CHG-013-fix-text-shadow-and-clipboard-selection-copy 완료 (글자 그림자 효과 적용 체크박스/컨트롤 연동 및 화면 드래그 텍스트 선택 복사(Ctrl+C) 정상화)