# Project Workflow State (Legacy Application Mode)

## Baseline Status

| Baseline Document | Status | Approved At |
|---|---|---|
| system-overview.md | APPROVED | 2026-08-01 |
| module-map.md | APPROVED | 2026-08-01 |
| test-baseline.md | APPROVED | 2026-08-01 |

## Active Change Unit

- Change ID: `CHG-045-stage-monitor-line-height`
- Target Feature: 에디터 무대 모니터 탭 및 무대 프롬프터 뷰어의 자막 영역 줄간격(Line Height) 설정 기능 추가

## Change Workflow State

| Phase | Status | Approved At |
|---|---|---|
| Change Request | APPROVED | 2026-08-07 |
| Impact Analysis | APPROVED | 2026-08-07 |
| Change Design | APPROVED | 2026-08-07 |
| Tasks Breakdown | APPROVED | 2026-08-07 |
| Testing Strategy | APPROVED | 2026-08-07 |
| Implementation | APPROVED | 2026-08-07 |

## Scope Boundaries

- **Allowed Scope**:
  - `docs/project-state.md`
  - `docs/changes/current/`
  - `frontend/editor.html`
  - `frontend/js/modules/editor-monitor.js`
  - `frontend/js/modules/editor-ui.js`
  - `frontend/js/viewer.js`
  - `backend/routers/monitor.py`
  - `backend/monitor_repository.py`
- **Protected Scope**:
  - `backend/database.py`
  - `backend/schemas.py`
  - `tests/`
  - `.antigravity/rules.md`
  - `.agent/agents/product-orchestrator/agent.md`
  - 기타 지정되지 않은 파일

## Existing Baseline Failures

- `tests/test_template_undo.py`: 웹소켓 메시지 대기 블로킹 이슈 (수동 검증 대상)
- 기준선 재실행 결과: 123개 수집, 97개 통과, 26개 실패
- 모니터 프론트엔드 관련 26개 테스트: 현재 파일과 기존 테스트 기대치 불일치

## Confirmed Decisions

- CHG-001 ~ CHG-034 완료된 변경 기록으로 취급
- CHG-035는 작업 기준 문서 정리 변경으로 완료
- CHG-036은 고정 문서·아카이브·에이전트 workflow 정리로 완료

## Open Questions

- 현재 문서에 기록되지 않은 과거 변경의 세부 내용은 복원하지 않고, 확인 가능한 사실만 유지한다.

## Change History

- 2026-08-01: CHG-001 ~ CHG-013 완료
- 2026-08-01: CHG-014-fix-stage-bg-tag-matching 완료
- 2026-08-02: CHG-020 ~ CHG-025 완료
- 2026-08-02: CHG-026 ~ CHG-034 완료된 변경 기록으로 확인
- 2026-08-02: CHG-035 작업 기준 문서와 변경 기록 정리 완료
- 2026-08-02: CHG-036 고정 작업 문서·아카이브·커밋/푸쉬 규칙 정리 완료
- 2026-08-06: CHG-037 무대 모니터 가이드 박스 고정 더미 텍스트화 및 PiP 실시간 연동 UX 개선 완료
- 2026-08-06: CHG-038 찬양 슬라이드 2분할 레이아웃 적용 완료
- 2026-08-06: CHG-039 기업형 단일 EXE 인스톨러 배포, 인앱 자동 업데이트 패키지 동시 생성 및 GitHub Release v1.3.13 업로드 완료
- 2026-08-06: CHG-040 backend/main.py 상대 경로 backgrounds_dir을 SUBCAST_DATA_DIR APPDATA 경로로 수정
- 2026-08-06: CHG-041 backend/main.py 루트 URL / 접속 시 /static/index.html로 자동 리다이렉트 처리 및 Release v1.3.13 자산 교체 완료
- 2026-08-06: CHG-042 run.py 백엔드 서버 호스트 0.0.0.0 지정으로 LAN 외부 접속 지원, 단일 EXE 인스톨러 및 인앱 자동 업데이트 패키지 빌드 후 Release v1.3.13 배포 완료
- 2026-08-06: CHG-043 editor-stage-bg.js 내 updateYtStatus 미정의 함수 참조 오류(ReferenceError) 수정 및 비디오 파일 업로드 상태 표시 로직 정상화 완료
- 2026-08-06: CHG-044 version.txt 1.3.14 상향, 기업형 단일 EXE 인스톨러 및 인앱 자동 업데이트 패키지 빌드 완료, GitHub Release v1.3.14 업로드 및 배포 완료
- 2026-08-07: CHG-045 캔버스 텍스트 선택 시 우측 속성 설정 패널(#inspector-text-section) 내 줄간격(Line Height) 조절 필드 배치 개편, 캔버스/무대 모니터/프롬프터 뷰어 및 백엔드 API/DB 연동 완료
