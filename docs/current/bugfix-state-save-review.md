# Karpathy Diff Review

**Task:** 재현 테스트를 추가하고 네 가지 저장·상태·초기 표시 문제를 수정한다. 현재 브랜치 feat/#25에서 검증 통과 후 이번 수정 파일만 커밋·푸시한다.
**Change:** 구현/테스트 12 files, +589 / -75 lines. 이 리뷰 문서는 집계에서 제외했다.
**Traceability:** 기존 파일 38/38 hunks와 새 테스트 파일 2/2 sections가 요청에 연결된다.
**Findings:** 최종 0 (0 critical, 0 warning, 0 nit).

## Findings

최종 미해결 발견 사항 없음. 작업 중 재연결 편집 보존을 PROJECT_SYNC에도 적용하면 명시적인 템플릿 변경이 무시됨을 회귀 테스트로 확인했다. 최종 코드는 INITIAL_SYNC에만 보존을 적용하며 PROJECT_SYNC는 기존 캔버스 갱신 동작을 유지한다.

## What's clean

- `backend/services/websocket_handler.py` 2 hunks: 요청 ID가 있는 SAVE_SLIDE의 검증/영속화 실패 응답과 변경 슬라이드 복구, 기존 broadcast 뒤 성공 응답. 요청 ID가 없는 기존 정상 요청은 broadcast 계약을 유지한다.
- `frontend/js/editor.js` 1 hunk: window 접근자를 lexical projectData/activeSlideId에 연결한다. 복제 상태나 새 상태 저장소를 추가하지 않는다.
- `frontend/js/modules/editor-slides.js` 3 hunks: boolean dirty 확인, 저장 확인 뒤 전환/잠금 해제, 실패 시 이전 캔버스 유지, 삭제된 슬라이드 저장 차단, 수동 저장을 확인 응답 경로에 연결한다.
- `frontend/js/modules/editor-sync.js` 7 hunks: 수동/자동/전환 저장의 요청 추적과 10초 응답 제한, 편집 버전 및 프로젝트 일치 확인, 이전 요청의 늦은 실패 표시 차단, ACK 처리, 같은 프로젝트 INITIAL_SYNC의 편집 보존, 자기 잠금 재획득 후 도구 활성화, 대기/dirty 상태의 늦은 broadcast 차단, 연결 단절 시 대기 저장 실패 처리. PROJECT_SYNC의 명시적 변경은 보존한다.
- `frontend/js/viewer.js` 1 hunk: 모니터 텍스트 컨테이너가 표시될 때 저장된 스타일을 적용한다.
- `tests/browser/refactor_smoke.js` 4 hunks: 캐시된 이전 스크립트를 피하고 dirty 전환의 디스크 저장, 공유 상태, 새로고침 직후 실제 37px DOM 스타일을 검증한다.
- `tests/test_editor_save_contracts.js` 14 hunks: WebSocket/캔버스 테스트 환경을 보완하고 저장 성공을 ACK 이후로 검사한다. 기존 버그를 고정하던 기대값을 수정하고 실패/시간 초과/늦은 응답/재연결/프로젝트 변경/명시적 템플릿 적용을 검증한다. 좌표·메타데이터·줌·선택 복원 검증은 유지한다.
- `tests/test_monitor_blank_labels.js` 1 hunk: 부분 함수 추출 테스트에 새 렌더 호출의 스텁을 제공한다. 빈 슬라이드 기대값은 유지한다.
- `tests/test_slide_tab_hardening.py` 1 hunk: boolean을 함수처럼 호출하던 버그 및 이동된 저장 구현의 문자열 검사 3개를 제거한다. 동작 검증은 JS 저장 계약 테스트가 수행하며 나머지 기존 가드는 유지한다.
- `tests/test_viewer_settings_contracts.js` 4 hunks: 숨겨진 초기 컨테이너를 재현하고 설정/API·프로젝트 도착 순서 4조합을 검증한다.
- 새 `tests/test_editor_project_state.js` 101 lines: 실제 동기화 핸들러와 방송·모니터 소비자가 같은 프로젝트/선택 상태를 읽고 쓰는지 5개 테스트로 확인한다.
- 새 `tests/test_slide_save_result.py` 121 lines: 저장 뒤 broadcast/ACK 순서, live 여부, 디스크 실패 복구와 재시도, 잘못된 데이터, 프로젝트 부재, 기존 요청 호환을 9개 테스트로 확인한다.

## Verification

- 기존 코드에서 실패를 확인한 뒤 수정했다: 저장/전환 계약 14 failures, 공유 상태 5 failures, 초기 모니터 2 failures, 서버 응답 신규 7 failures. 추가 경계 조건도 개별 실패 후 통과를 확인했다.
- 전체 Python: `venv/Scripts/python.exe -m pytest tests/ --basetemp test_results/bugfix-final-tmp -p no:cacheprovider -q --tb=short`, **201 passed**, exit 0, 14.21s. 기존 python_multipart PendingDeprecationWarning 1개. APPDATA/SUBCAST_DATA_DIR를 workspace 테스트 경로로 격리했다.
- 전체 JavaScript: `node --test tests/*.js`, **89 passed, 0 failed**, exit 0. Python 마지막 실행 이후 수정한 코드는 JS 저장 처리 및 해당 JS 회귀 테스트이며 이 최종 JS 실행과 브라우저 실행에서 검증했다.
- 실제 브라우저: `tests/browser/refactor_smoke.js`, **10 checks**, pageErrors **0**. 로컬 격리 서버에서 자동/수동 저장, 줌/선택, dirty 전환의 디스크 저장, 방송/현장 격리, 모니터 설정/preview 격리, 새로고침 초기 DOM, 공유 상태를 확인했다.
- 설치 파일 빌드 및 장시간 OBS 운용은 검증 범위에 포함하지 않았다.

## Proposed fixes

없음. 기존 사용자 변경 `.agents/skills/product-orchestrator/SKILL.md`, `.codex/config.toml`, `AGENTS.md`, `setup.iss`, release 출력 및 프로젝트 JSON은 이번 변경에서 제외하고 그대로 보존했다. 커밋·푸시 대상은 이번 구현·테스트와 이 리뷰 문서뿐이다.

## Review ownership

general_worker 세 명이 상태 공유, 초기 모니터, 서버 ACK를 분담했고 coordinator가 통합/회귀 실행 및 모든 hunk를 검토했다. 추가 deep_expert 리뷰는 사용량 제한으로 실행되지 않았으며 독립 전문가 검토 완료를 주장하지 않는다.

## 커밋 전 재검토

사용자의 Karpathy diff 재검토 및 현재 브랜치 커밋·푸시 요청에 따라 동일 최종 변경을 다시 검토했다. 38개 기존 hunk와 새 테스트 2개 및 리뷰 문서가 모두 네 문제의 수정·검증에 연결된다. 최종 미해결 findings 0개.

새 인터페이스·팩토리·상태 저장소·캐시·의존성은 추가하지 않았다. 수동/자동/전환 저장은 기존 editor-sync 모듈의 단일 전송/응답 경로를 공유한다. 요청 ID와 편집 버전, 10초 응답 제한은 실패와 늦은 응답을 구별하기 위한 실제 요구에 해당한다. 공유 프로젝트 접근자 8줄과 모니터 초기 렌더 1줄로 상태 복제 및 별도 초기화 계층을 피했다. 실행 속도 개선을 측정했다고 주장하지 않는다.

커밋 직전 새 실행: Python 전체 **201 passed**, exit 0, 13.09s, 기존 경고 1개. JavaScript 전체 **89 passed, 0 failed**, exit 0. 앞선 최종 코드의 브라우저 **10 checks / pageErrors 0** 결과는 구현이 변하지 않아 그대로 유효하다. Scoped git diff --check exit 0. 관련 없는 기존 사용자 변경은 스테이징하지 않는다.
