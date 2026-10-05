# Karpathy Refactor Report / Ledger

## 2026-10-05: 커밋 전 Karpathy Diff Review

**Task:** 기존 동작을 유지한 1~5번 리팩토링과 회귀 테스트를 검토하고 현재 `feat/#25` 브랜치에 커밋·푸시한다.

**Change:** 12 files, +1428/-127 lines. production 6개 파일 +109/-127줄, 신규 테스트·브라우저·검증 문서 6개 파일이다.

**Traceability:** production 19/19 hunk와 신규 파일 6/6 구간이 요청에 연결된다. 기존 AGENTS.md, product-orchestrator, .codex/config.toml 삭제, setup.iss, 릴리스 산출물, 사용자 프로젝트 JSON은 이번 커밋에서 제외한다.

**Findings:** 최종 0 (critical 0, warning 0, nit 0). 스테이징 검사에서 발견한 browser smoke 말미의 불필요한 빈 줄은 제거했다.

### Findings

발견 사항 없음.

### What's clean

캡처 순서·선택·zoom·JPEG 설정, 부분 업데이트와 Dict 요청 계약, startup/직접 호출/누락 설정 복구, alias·중복 집계·최신 태그 조회, 채널별 초기화·preview 제한을 유지한다. 원본 자료 공유 외에 새 cache/factory 계층을 만들지 않았다. 새 테스트는 실제 프로그램 함수·라우터를 호출하며 기존 conftest의 격리 fixture를 사용한다. 브라우저 smoke는 별도 격리 서버를 사용하는 절차가 문서화되어 있다.

커밋 전 전체 Python 192 passed, exit 0 (기존 multipart 경고 1건, 14.10초), JavaScript 64 passed, 0 failed, exit 0. production diff check 통과. 이전 브라우저 8개 시나리오 검증과 사용자 수동 확인도 유지 근거다. 빌드·설치·장시간 OBS 검증을 추가로 주장하지 않는다.

### Proposed fixes

없음. 요청한 커밋·푸시를 진행하며 다른 브랜치 이동, PR 생성, 병합은 수행하지 않는다.

## 2026-10-05: 1~5번 적용 완료

**Mode:** autonomous. 사용자 요청 “보증할 준비까지 해서 리팩토링 진행해봐”에 따라 R1/R3/R4/R5/R6을 적용했다. 기존 동작을 먼저 고정하고 작은 변경마다 관련 테스트를 실행했다. 커밋은 하지 않았다.

**Scope:** production 6개 파일, +109/-127줄. 추가 계약 테스트 7개와 실제 브라우저 smoke 1개 파일, 검증 문서. 기존 사용자 변경과 프로젝트 파일은 수정하지 않았다.

**Baseline:** Python 전체 중 undo 제외 187 passed, undo 단독 1 passed, Node 전체 61 passed. 실제 Chromium/Fabric/WebSocket/HTTP 브라우저 8개 시나리오 통과. 모두 production 편집 전 기록했다. Windows asyncio 검증은 격리 데이터 경로를 사용한 샌드박스 밖 실행으로 완료했다.

**History / Architecture / Evidence:** 아래 최초 감사의 90일·374개 non-merge 커밋과 파일별 근거를 재사용했다. 진입점, router/service/repository 경계, DB/JSON 형식, WebSocket/잠금 소유권은 유지했다. 독립된 프런트엔드·백엔드 general_worker(gpt-6.1-sol) 두 명이 파일을 나눠 작업하고 조정자가 diff와 전체 통합을 검증했다.

### Applied

1. **R1 저장 캡처 공통화, verified.** `captureCanvasThumbnail()`으로 zoom 1.0, 기본 검정 배경, JPEG quality 0.4, 기존 zoom 복원을 공유한다. 자동/수동은 캡처 후 직렬화, 전환은 직렬화 후 캡처라는 차이를 유지했다. 수동 선택 복원과 오프라인·잠금·dirty 처리는 각 경로에 남겼다. 추가 순서·전환 계약 3개를 production 변경 전에 통과시켰고, 변경 후 editor 25개가 통과했다.
2. **R3 미사용 모델 삭제, verified.** 실제 요청에서 사용하지 않는 두 Pydantic 모델과 관련 import를 삭제했다. Dict 요청, 부분 업데이트, OpenAPI와 400/500 오류 계약은 유지했다. 해당 계약 9개가 통과했다.
3. **R4 초기화 경계 정리, verified.** startup은 기존 마이그레이션이 초기화한다. 정상 API GET/PUT/GET의 초기화 횟수는 3→0이다. 직접 repository/helper 호출은 기본적으로 초기화한다. 기본 행 또는 테이블이 없을 때는 초기화 후 조회를 한 번만 재시도하여 기존 복구를 유지한다. 정확한 missing-table 오류만 처리하고 기타 SQL 오류는 전달한다. 직접 호출과 명시적 DB 경로, 부분 저장, 실제 HTTP 복구 계약을 검증했다.
4. **R5 태그 원본 조회 공유, verified.** 한 요청에서 곡 mood, 배경 메타, 프로젝트를 읽어 legacy 발견과 사용량 계산에 공유한다. 각 원본 조회는 2→1이다. 요청 간 cache를 추가하지 않아 외부 변경은 다음 요청에 반영된다. alias, 정렬, 슬라이드/배경 중복 제거, 손상 프로젝트 건너뛰기를 유지했다. 요청 동안 프로젝트 자료를 함께 보관하므로 IO 감소와 달리 최대 메모리 감소를 주장하지 않는다.
5. **R6 설정 적용 공통화, verified.** 찬양 설정 적용과 모니터 설정 적용만 공유한다. WebSocket/BroadcastChannel/storage의 수신 조건, 초기 동기화 전 처리, JSON 실패 시 초기화 순서, preview 전용 제한은 유지했다. viewer 계약 19개와 현장 전환 2개가 통과했다.

### Verification

- 최종 Python: `venv/Scripts/python.exe -m pytest tests/ --basetemp test_results/final-ref-tmp -p no:cacheprovider -q --tb=short`, **192 passed, exit 0**, 9.11초. 기존 multipart deprecation warning 1건. APPDATA와 SUBCAST_DATA_DIR은 `test_results/final-ref-*`로 격리했다.
- 최종 JavaScript: `node --test tests/*.js`, **64 passed, 0 failed, exit 0**.
- 서버를 변경된 코드로 재시작한 뒤 `tests/browser/refactor_smoke.js` 실행: **8개 시나리오 통과, page error 0**. 자동·수동 저장의 실제 디스크 반영, 선택/zoom 복원, 송출/현장 구분, 모니터 HTTP/storage/BroadcastChannel, preview 격리, 새로고침 후 데이터 복원 결과가 변경 전과 같았다.
- 효율 테스트의 탐지력: HEAD 코드를 subprocess 메모리에서만 실행하면 요청 초기화 3회와 원본 읽기 2회를 탐지해 두 테스트가 예상대로 실패한다. 최종 코드에서는 0회와 1회로 통과한다. 소스 파일을 되돌려 실험하지 않았다. 응답시간/CPU 성능 배율은 측정하지 않았다.
- `git diff --check -- backend frontend`: exit 0. 빌드·Windows 설치·OBS 장시간 운용 검증은 수행하지 않았으므로 그 범위의 보증은 아니다.

### Karpathy Diff Review

**Task:** 기존 동작을 보존하며 지정한 다섯 후보를 적용하고 회귀 검증을 보강한다.

**Change:** production 6파일 +109/-127줄, 계약 테스트 2파일의 추가, browser smoke 및 문서 2개. 기존 사용자 변경은 검토 대상에서 분리했다.

**Traceability:** production 19/19 hunk와 이번 테스트·브라우저·문서 추가 5개 구간이 요청에 연결된다.

**Findings:** 0 (critical 0, warning 0, nit 0). 캡처 helper와 두 설정 helper는 현재 중복만 공유한다. initialization 옵션과 router partial은 직접 helper의 기존 자동 초기화/테스트 호출 계약을 유지하기 위한 것이며 새 factory/cache/lifecycle 계층을 추가하지 않는다. 제거된 모델과 import는 실제 route 계약에서 사용되지 않았다. 별도 수정 제안은 없다.

### Reverted / Recovery

되돌린 slice는 없다. 최초 sandbox 임시 경로는 후속 실행에서 접근할 수 없어, 기록된 clean HEAD의 production 원본과 변경 전 테스트 구간을 접근 가능한 `C:/Users/tjrdl/AppData/Local/Temp/karpathy-refactor/subcast/20261005-164229/`에 보존했다. 최종 production binary patch, 사용자 변경 patch, untracked 목록, 계약도 함께 기록했다. 전체 checkout reset이나 stash는 사용하지 않았다. 테스트 DB·브라우저 프로젝트는 격리된 `test_results/`에 생성되며 worktree 복구 범위 밖이다.

### Do Not Refactor / Escalations

이번 범위에서 dirty의 boolean/function 불일치, lexical/window projectData 차이, 모니터 새로고침 직후 설정을 읽어도 다음 이벤트까지 DOM 스타일이 적용되지 않는 기존 초기화 순서는 수정하지 않았다. 마지막 항목은 브라우저 smoke에서 저장 설정 복원을 확인하며, 초기 DOM 스타일의 정상화를 주장하지 않는다. 잠금, preview/송출 분리, debounce, 업데이트 방어·데이터 마이그레이션도 유지했다. 상태 소유권 개선은 아래 R2처럼 별도 동작 수정 판단과 회귀가 필요한 후속 작업이다.

### Next

요청한 다섯 단계의 diff와 재실행 가능한 테스트를 작업 트리에 남겼다. 상세 재실행은 `docs/current/refactor-test-baseline.md`를 참고한다. 커밋·배포·후속 버그 수정은 수행하지 않았다.

## 2026-10-05: 코드베이스 과설계 검토

- Mode: **report**. 요청은 검토와 우선순위 제안이며 구현 승인이 아니다. 프로그램 소스는 수정하지 않았다.
- Scope: `backend/`, `frontend/js/`, 관련 HTML·테스트, `run.py`, `build_all.py`, 배포 설정. `archive/`와 사용자 프로젝트 JSON 내용은 탐색하지 않았다.
- Commit: `cdb31ab73d472b4206a41f50bd0ae4bba708aa42`.
- 기록 쓰기: 이 파일이 유일한 보고서/원장 변경이다. 검증 과정의 격리 데이터는 Git에서 제외되는 `test_results/ka1005*` 및 시스템 임시 디렉터리에 생성됐다.
- 기존 변경: AGENTS.md, product-orchestrator 스킬, 삭제된 .codex/config.toml, setup.iss, 릴리스 디렉터리와 프로젝트 JSON의 기존 상태를 보존했다.
- 병렬 조사: quick_scan 역할(gpt-6-luna)의 읽기 전용 프런트엔드·백엔드 조사. 최종 판단, 변경 이력 분석, 검증과 보고서는 조정자가 수행했다.
- 이전 원장과 해당 저장소의 임시 refactor 스냅샷은 발견하지 못했다.

### Result

가장 큰 비용은 인터페이스·팩토리 계층의 증식보다 **분리된 상태 소유권, 저장 절차의 중복, 동기화 경로별 중복 적용, 요청마다 반복하는 초기화**에 있다. 실제 확인한 클래스는 연결 생명주기 또는 DB 접근을 소유한다. 이들을 함수로 전면 교체하거나 서비스/라우터를 다시 합치는 근거는 부족하다.

권장 순서: **R1 저장 절차 공통화 → R3 미사용 요청 모델 제거 → R4 DB 초기화 경계 정리 → R5 태그 중복 IO 축소 → R6 설정 적용 함수 통합**. R2는 위험도가 더 큰 상태 소유권 문제이며 별도 기능 회귀 검증과 동작 수정 판단이 필요하다. R7·R8은 해당 기능을 다시 수정할 때 처리할 후순위다.

### Architecture Map

1. `run.py`: 트레이, 서버 스레드, 설치 환경의 데이터 시딩·마이그레이션·업데이트. API만 실행하는 진입점도 존재한다.
2. `backend/main.py`: 현재 83줄 정도의 앱 조립·lifespan·라우터 등록·정적 파일·WebSocket 진입점. 과거 문서의 8만 바이트 대형 파일 설명은 현재 판단 근거로 사용하지 않았다.
3. 라우터 → 기능 서비스/리포지토리 → SQLite 또는 JSON 저장. WebSocket의 `ConnectionManager`가 활성 프로젝트, 접속자, 잠금, 일괄 작업 이력을 소유한다.
4. 에디터는 여러 classic script가 전역 lexical state와 `window` 속성을 공유한다. Fabric 캔버스, 메모리 슬라이드, 서버 상태가 동기화된다.
5. viewer/presenter는 WebSocket 송출 상태와 브라우저 탭 설정 이벤트를 받는다. 방송 화면과 현장 화면, 모니터 미리보기는 역할이 다르다.
6. 보존할 불변조건: JSON/DB 형식과 API 오류 계약, 부분 설정 업데이트, 편집 잠금, 저장 타이밍, 빈 슬라이드 표시, 방송/현장 구분, 찬양 곡별 배경 일관성, 업데이트 전 백업과 설치 검증.

### Evidence

History window: 2026-07-07부터 조회한 90일 창, 현재 저장소의 non-merge 커밋 374개. 최근 30일은 2026-09-05부터 집계했다. 변경량에는 backend/frontend/tests와 두 진입 스크립트 및 requirements만 포함했다. assets/fonts/data DB·생성물·lockfile은 제외했다. 동시 변경 집계에서는 전체 변경 파일이 30개를 넘는 커밋 4개를 제외했다. 실제 마지막 커밋 날짜는 2026-09-27이다.

| 파일 | 90일 변경 | 최근 30일 | 수정형 메시지 |
|---|---:|---:|---:|
| editor-slides.js | 16 | 6 | 5 |
| editor-sync.js | 9 | 4 | 4 |
| editor-monitor.js | 27 | 2 | 13 |
| viewer.js | 35 | 5 | 14 |
| run.py | 23 | 3 | 13 |
| monitor_repository.py | 7 | 0 | 1 |
| routers/monitor.py | 6 | 0 | 0 |
| services/tag_service.py | 2 | 2 | 2 |
| services/praise_service.py | 5 | 3 | 1 |
| routers/system.py | 6 | 3 | 1 |

수정형 메시지 수는 `fix/revert/bug/수정/오류/버그/보완/안정`을 찾은 휴리스틱이며 실제 결함 수가 아니다. 동시 변경: editor-slides/editor-sync 4회, monitor_repository/editor-monitor 5회, run/system router 5회, run/build_all 11회. API와 UI를 함께 수정하는 정상 기능 작업도 포함되므로 동시 변경만으로 경계가 잘못됐다고 판정하지 않았다.

과거 editor.html 207회, main.py 80회 변경은 모듈 분리 전 이력도 포함한다. 이 수치를 현재 추출 모듈의 결함 수로 전가하지 않았다.

### Verification / Baseline

- Python: `venv/Scripts/python.exe -m pytest tests/test_monitor_repository.py tests/test_mood_matching.py --basetemp C:/cli-develop/subcast/test_results/ka1005c/tmp -p no:cacheprovider -q --tb=short` → **13 passed in 0.47s**, exit 0. `SUBCAST_DATA_DIR`를 격리 디렉터리로 지정하고 bytecode 쓰기를 비활성화했다.
- JS: `node --test tests/test_viewer_stage_bg_transition.js tests/test_stage_bible_backdrop.js tests/test_monitor_blank_labels.js tests/test_praise_bg_js_matching.js tests/test_praise_lyrics_parser.js tests/test_bible_trailing_blank.js` → **20 passed, 0 failed**, exit 0. 그중 bg matching은 자체 assertion 스크립트 하나로 집계된다.
- 추가 재현: 실제 editor.js의 상태 선언과 실제 editor-broadcast.js를 Node VM에 로드했다. DOM/storage는 stub이었다. lexical `projectData`와 `window.projectData`가 분리되고, boolean dirty 상태의 function 검사가 false임을 assertion으로 확인했다. 브라우저 전체 E2E 검증은 아니다.
- 전체 Python 통과 기준선은 확보하지 못했다. 긴 sandbox TEMP 경로 실행은 tmp_path 생성 오류로 178 setup errors, exit 1이었다. 이전 시도에서는 import 시 DB 경로/마이그레이션 오류도 발생했다. 짧은 격리 경로로 바꾼 광범위 실행과 monitor API를 포함한 실행은 진행 정체로 중단했다. 원인은 확정하지 않았다. 이를 제품 테스트 178개 실패라고 해석하지 않는다.
- 알려진 `test_template_undo.py`의 수신 대기 문제 때문에 광범위 실행에서 제외했다. 빌드·설치·전체 UI 클릭 검증은 실행하지 않았다. 테스트 소스의 문자열 검사나 Python으로 복제한 JS 로직은 실제 브라우저 동작을 보증하지 않는다.
- 전역 녹색 기준선이 없으므로 모든 후보는 제안만 기록한다. 기능 유지가 이미 검증됐다고 주장하지 않는다.

### Proposed Candidates

#### R1. 세 저장 경로의 동일 절차를 한 함수로 모으기

- Verdict: proposed. Type: Extract. Impact: high / Risk: medium / Verifiability: partial / Blast radius: subsystem / Confidence: high / Lane: report.
- Evidence: [performAutoSave](../frontend/js/modules/editor-sync.js#L72), [selectSlideForEdit](../frontend/js/modules/editor-slides.js#L398), [saveSlideData](../frontend/js/modules/editor-slides.js#L436). 세 곳이 요소 직렬화·zoom 변경·JPEG 썸네일·SAVE_SLIDE·로컬 모델 갱신을 반복한다. sync/slides는 최근에도 함께 변경됐다.
- Issue: 자동 저장은 연결이 열렸을 때 로컬 갱신·dirty 해제를 하지만 수동 저장은 연결이 없어도 실행한다. 수동 저장만 선택 객체를 잠시 해제한다. 차이를 없애는 것은 동작 변경이다.
- Proposal: 먼저 동일한 직렬화/썸네일 캡처 부분만 공통 함수로 추출하고 호출부의 선택 처리·전송·UI·dirty 정책을 보존한다. 다음 단계에서 공통인 전송/모델 갱신만 묶는다. 여러 mode 플래그가 있는 범용 SaveManager나 저장 전략 계층을 추가하지 않는다.
- Payoff: 요소/썸네일 포맷 변경을 세 군데 수정하지 않아도 되고 zoom 복원 규칙을 한 곳에서 확인할 수 있다.
- Invariant: 768×432 기준, JPEG quality 0.4, 기존 저장 메시지 구조·잠금 순서·오프라인 처리·선택 복원·1초 autosave 지연을 유지한다.
- Verification contract: 실제 JS 저장 함수에 대한 characterization tests를 먼저 확보한다. 자동/수동/전환, socket open/closed, 선택 객체 유무, 모니터 편집 차단, zoom 복원을 포함한다. 그 뒤 `node --test tests/*.js`, `pytest tests/test_slide_navigation.py tests/test_project_save_retry.py tests/test_slide_clipboard_metadata.py`를 실행한다. 기존 tests만으로 세 경로는 충분히 검증되지 않는다.

#### R2. 프로젝트 상태 소유권과 dirty 표현 정리

- Verdict: proposed. Type: Escalate / Test first. Impact: high / Risk: high / Verifiability: partial / Blast radius: cross-cutting / Confidence: high / Lane: escalate.
- Evidence: editor.js:23은 `let projectData`, :39는 boolean `let isSlideDirty`. editor-monitor.js:178과 editor-broadcast.js:29,218은 `window.projectData`를 참조한다. 전체 frontend 검색에서 lexical 상태를 window에 연결하는 대입을 찾지 못했다. editor-slides.js:399는 `typeof isSlideDirty === 'function' && isSlideDirty()`로 검사한다. 제한된 VM 재현에서도 두 상태가 다르고 dirty 검사가 false였다.
- Issue: 모듈 분할이 명시적 경계 없이 전역 공유로 이뤄졌다. 방송 레이아웃 저장은 별도 window 상태를 만들 수 있고, 전환 저장 분기는 현재 boolean 선언과 맞지 않는다. 이는 과설계 취향보다 실제 계약 불일치다.
- Proposal: 프로젝트와 편집 dirty 상태의 소유자를 하나씩 명시한다. 먼저 사용자에게 보이는 현재 증상을 실제 편집 화면에서 재현하고 회귀 테스트를 둔다. 이후 얇은 읽기/갱신 함수로 해당 접근만 통일한다. 새 상태 관리 프레임워크·범용 이벤트 버스·모듈 전체 전환은 필요하지 않다.
- Payoff: 모니터/방송 편집기가 어떤 프로젝트를 읽고 쓰는지 추적 가능하고 boolean/function 호환 검사 자체가 불필요해진다.
- Invariant: 프로젝트 전환 시 최신 프로젝트를 읽으며 미리보기 변경이 송출/저장을 침범하지 않는다. 기존 오동작을 고치는 변경은 순수 기능 유지 리팩터링과 별도 기록한다.
- Verification contract: JS 실제 함수 기반 회귀 및 브라우저 편집→프로젝트 전환→방송 설정 재열기→저장→재접속 시나리오. Python test_e2e_monitor의 mock 시뮬레이션만으로 통과를 주장하지 않는다. 이 변경은 교차 모듈 영향이 있어 한 번에 적용하지 않는다.

#### R3. 연결되지 않은 모니터 요청 모델 삭제

- Verdict: proposed. Type: Delete. Impact: low / Risk: low / Verifiability: partial / Blast radius: local / Confidence: high / Lane: report.
- Evidence: routers/monitor.py:9-33의 MonitorBoxSchema/MonitorSettingsPayload는 PUT :49의 `Dict[str, Any]` 입력에 사용되지 않는다. 정의 밖의 생산 코드·테스트 참조를 찾지 못했다.
- Issue: 실제 검증 계약과 별도의 모델/default_factory/default 값이 공존한다. 인터페이스가 있는 것처럼 보이지만 실제 요청 검증과 OpenAPI에 연결되지 않는다.
- Proposal: 두 미사용 모델과 그에만 필요한 import를 삭제한다. 기존 리포지토리 검증은 유지한다. 모델을 PUT에 연결하는 방식은 권하지 않는다. 누락 필드를 기본값으로 채워 부분 수정의 의미가 달라질 수 있다.
- Payoff: 모니터 API 수정 시 검토할 계약이 하나 줄어든다. 런타임 성능 효과는 거의 없다. 차가운 코드라 큰 정리 작업으로 확대하지 않는다.
- Invariant: 기존 부분 업데이트와 400/INVALID_BOUNDS 응답, 저장된 값 보존.
- Verification contract: `pytest tests/test_monitor_repository.py tests/test_monitor_api.py tests/test_monitor_custom_elements.py tests/test_monitor_line_height.py`; OpenAPI의 monitor PUT 요청 스키마가 기존과 같은지도 비교한다. 이번 API 기준선은 확보되지 않았다.

#### R4. 모니터 DB 초기화를 요청 처리에서 분리

- Verdict: proposed. Type: Move. Impact: medium / Risk: medium / Verifiability: partial / Blast radius: subsystem / Confidence: high / Lane: report.
- Evidence: monitor_repository.py:58-62 생성자에서 init_monitor_db를 호출하고 :224-234 두 helper가 요청마다 새 객체를 만든다. database.py:71-104는 CREATE TABLE, PRAGMA, 누락 컬럼 확인, 기본행 INSERT, commit을 수행한다. update :125-129에는 행이 없을 때 다시 초기화하며 :222에는 도달 불가능한 중복 return이 있다.
- Issue: 얇은 wrapper 자체보다 wrapper→새 repository→schema 초기화라는 수명 주기가 문제다. 업데이트 전 읽기와 업데이트 후 읽기는 현재 병합·반환 계약에 필요하므로 단순 중복이라고 삭제하지 않는다.
- Proposal: API 경로의 초기화는 lifespan/migration 완료 시점으로 이동하고 직접 repository 사용하는 테스트/도구에는 명시적 초기화 경로를 유지한다. 별도의 repository factory/DI 컨테이너/초기화 완료 전역 cache를 추가하지 않는다. DB 경로가 바뀌는 테스트도 고려한다.
- Payoff: 설정 읽기/저장 요청에서 DB 스키마 작업이 빠져 저장 흐름과 초기화 실패를 분리해 디버깅할 수 있다. 성능 수치는 측정 전 주장하지 않는다.
- Invariant: 빈 DB와 구버전 DB의 생성·컬럼 이관·default_profile 제공, 명시적 db_path 지원, 부분 업데이트 보존.
- Verification contract: `pytest tests/test_monitor_repository.py tests/test_monitor_db.py tests/test_monitor_api.py tests/test_monitor_custom_elements.py tests/test_migration.py`. 직접 API 실행과 tray 실행 양쪽의 초기화 횟수/구버전 DB fixture를 검증한다. constructor init만 삭제하는 변경은 불완전하다.

#### R5. 태그 조회의 프로젝트 파일 중복 읽기 줄이기

- Verdict: proposed. Type: Extract. Impact: medium / Risk: medium / Verifiability: partial / Blast radius: subsystem / Confidence: high / Lane: report.
- Evidence: tag_service.py:142의 get_tags는 :97의 legacy 수집 후 :227의 usage 집계를 호출한다. 두 단계가 찬양 DB·배경 메타·전체 프로젝트 JSON을 각각 순회한다. tags.py:15-21 조회와 갱신 방송에서 이 경로를 쓴다. 최근 30일 두 번 수정됐다.
- Proposal: 요청 안에서 원본 자료를 한 번 읽고 legacy 이름 수집과 usage 집계에 재사용한다. legacy 태그 등록 후 최종 id/alias로 usage를 계산하는 순서는 보존한다. 즉시 집계가 필요한데 영구 usage cache와 무효화 이벤트를 추가하면 더 복잡해진다.
- Payoff: 프로젝트가 많을 때 같은 파일을 두 번 읽지 않고, 두 순회 사이에 달라지는 스냅샷 문제도 줄인다. CPU 집계까지 반드시 한 번으로 합칠 필요는 없다.
- Invariant: legacy 태그 발견·등록, 별칭 정규화, 슬라이드당 태그 중복 제외, 배경 파일명 기준 중복 제외, 최신 usage와 삭제 제한을 유지한다.
- Verification contract: `pytest tests/test_mood_tag_management.py tests/test_mood_tag_api.py tests/test_tag_persistence_hardening.py tests/test_project_import_tag_mappings.py`. legacy 이름과 alias를 섞은 fixture 및 요청당 read 횟수 검증을 추가한다. 대형 프로젝트 fixture benchmark가 없으므로 속도 개선을 검증 완료로 표현하지 않는다.

#### R6. 설정의 여러 수신 경로를 같은 적용 함수로 모으기

- Verdict: proposed. Type: Extract. Impact: medium / Risk: medium / Verifiability: partial / Blast radius: subsystem / Confidence: medium / Lane: report.
- Evidence: viewer.js:383,1022-1042에서 찬양 레이아웃을 WebSocket, BroadcastChannel, storage 이벤트로 적용한다. editor-broadcast.js:216-245도 localStorage 저장·서버 전송·탭 전송을 함께 수행한다. 모니터 viewer :974-1001에는 BroadcastChannel/storage 양쪽 적용이 있다.
- Proposal: 전송 채널은 유지하고 상태 적용과 렌더 호출만 한 함수로 모은다. 같은 이벤트 내용이라도 preview 전용과 실제 송출은 합치지 않는다. revision/dedup 시스템은 중복 렌더 비용을 측정한 뒤에만 고려한다.
- Payoff: 레이아웃 필드가 바뀌어도 채널별 구현 누락이 줄어든다.
- Invariant: 같은 브라우저 즉시 반영, 원격 OBS/WebSocket 반영, 새 탭의 저장값 복원, preview의 송출 비침범.
- Verification contract: 세 채널 각각에 같은 설정을 주어 동일한 최종 레이아웃을 확인하는 실제 JS tests 및 방송/현장/preview 브라우저 시나리오. 기존 `test_praise_broadcast_layout.py`와 Node 빈 화면 테스트는 보조 검증이다.

#### R7. 업데이트 순수 규칙과 DB 경로 정의의 중복만 축소

- Verdict: proposed. Type: Extract. Impact: low / Risk: high(업데이트), medium(DB 경로) / Verifiability: partial / Blast radius: subsystem / Confidence: high / Lane: report.
- Evidence: run.py:323-376과 routers/system.py:46-79,108-150에 버전 파싱, trusted host, installer/checksum 이름과 검증 규칙이 반복된다. 서버가 실행 중이면 run은 API에 위임하지만 중지 상태의 직접 업데이트도 현재 지원한다. database.py:5-8와 praise_service.py:6-7는 동일 DB 환경변수 우선순위를 따로 정의한다.
- Proposal: 먼저 순수 버전/URL/asset 규칙만 부작용 없는 모듈로 공유한다. sync urllib/async httpx 다운로드를 범용 Transport/Factory로 합치지 않는다. 사용자 DB 기본 경로는 기존 database 모듈 정의를 재사용하되 동적 테스트 monkeypatch 계약을 검증한다. 전체 설정을 새 Settings 프레임워크로 옮기지 않는다.
- Payoff: 릴리스 검증 정책이나 DB 환경변수 우선순위 수정 시 서로 다른 결과를 방지한다.
- Invariant: 서버 중지 상태 업데이트, HTTPS host 제한, redirect 검증, 1,000,000,000 byte 한도, 1024 byte 최소·MZ·SHA256, 백업·설치 실패 시 보존을 유지한다. Bible의 bundle/legacy 탐색은 사용자 DB 경로와 통합하지 않는다. 버전 파일이 없을 때 서로 다른 fallback을 통일하는 것은 별도 동작 결정이다.
- Verification contract: `pytest tests/test_auto_update.py tests/test_build_and_update.py tests/test_update_data_safety.py tests/test_migration.py`. sync/async 양쪽 동일 악성 입력 tests와 Windows 설치 smoke가 필요하다. 민감한 코드라 기존 테스트의 녹색 기준선 없이 추출을 적용하지 않는다.

#### R8. 사용하지 않는 모니터 송출 함수의 잔재 정리

- Verdict: proposed. Type: Delete. Impact: low / Risk: low / Verifiability: partial / Blast radius: local / Confidence: medium / Lane: report.
- Evidence: editor-slides.js:323-386의 getMonitorBroadcastChannel/notifyMonitorSlideChange/slideNameOrFallback. 현재 생산 코드에서 notify 호출을 찾지 못했다. selectSlideForEdit는 editor-monitor의 로컬 미리보기 updateMonitorSlideTexts를 호출한다. test_monitor_text_occlusion_and_live_sync는 편집 선택이 송출하지 않아야 함을 명시한다.
- Proposal: 동적 HTML/외부 호출 계약이 없는지 확인한 뒤 고립된 코드와 해당 dead 기능 검사만 삭제한다. 남은 실제 viewer/presenter 빈 화면 검증은 유지한다.
- Payoff: 현재 쓰지 않는 송출 경로와 빈 화면 규칙을 유지보수하지 않아도 된다.
- Invariant: 에디터 선택은 송출 슬라이드를 바꾸지 않는다. 실제 송출 모니터의 빈 화면/다음 찬양 표시는 보존한다.
- Verification contract: `node --test tests/test_monitor_blank_labels.js`; `pytest tests/test_monitor_text_occlusion_and_live_sync.py tests/test_slide_tab_hardening.py tests/test_stage_monitor_conditional_split.py` 및 parity 심볼 목록 검토. 일부 테스트와 baseline_frontend.json이 존재 자체를 기대하므로 제거 시 의도에 맞게 갱신해야 한다.

### Slice Ladder

1. R1: 세 저장 경로의 현재 차이를 JS characterization으로 고정한 뒤 캡처/직렬화만 추출. dirty 오동작 수리는 같은 변경에 섞지 않는다.
2. R3: 독립된 미사용 모델 삭제. 부분 업데이트·오류 응답·OpenAPI를 비교한다.
3. R4: startup/direct-repository 초기화 경계를 검증한 뒤 요청당 DDL 제거. DB 스키마나 저장 형식은 바꾸지 않는다.

각 단계는 별도 diff와 검증으로 진행한다. R2 전체 상태 경계 개선은 작은 slice 범위를 넘으므로 먼저 회귀와 소유권 설계를 좁혀야 한다.

### DRY / SOLID / Patterns

- DRY 적용 근거가 있는 곳은 같은 slide snapshot 생성, 같은 setting 적용, 같은 릴리스 순수 규칙이다. sync/async IO 및 미리보기/송출 정책까지 플래그 많은 하나의 추상화로 합치면 복잡도가 증가한다.
- SRP의 실제 문제는 ConnectionManager라는 클래스 이름보다 browser lexical/window 상태의 소유권, 초기화가 요청 조회에 붙어 있는 경계다.
- 조사 범위에서 다중 interface/ABC/Protocol 계층·factory 체계·DI 컨테이너의 남용은 확인하지 못했다. Pydantic 요청/저장 모델을 전부 불필요한 인터페이스로 보지 않는다.
- 기존 router/service 분리는 기능별 IO·검증을 분리한다. 현재 main.py는 이미 작다. repository를 없애 직접 SQL을 router에 옮기는 것은 권하지 않는다.
- return/try-except 수나 파일 길이만으로 과설계를 판정하지 않았다.

### Do Not Refactor

- WebSocket과 역할별 session, 편집 lock, INITIAL_SYNC: 동시 편집·원격 송출의 실제 요구사항. 단일 브라우저를 가정하고 제거하지 않는다.
- 저장 debounce 0.5초와 JSON 원자 교체·project lock·Windows PermissionError 재시도: 연속 송출 쓰기와 파일 잠금에 대응한다. 프런트 autosave의 1초와 같은 목적/경계가 아니다.
- 찬양 곡 배경 cache/최근 선택 이력/현재 tag eligibility 검증: 한 곡의 배경 일관성과 slide override를 함께 지킨다. test_stage_bg_song_consistency가 해당 계약을 다룬다. 지우면 기능이 바뀐다.
- 배경 삭제 지연 재시도: 재생 중 파일 잠금에 대응한다. 무조건 동기 삭제로 바꾸지 않는다.
- 업데이트 백업·checksum·host·size·MZ 확인·마이그레이션 보존: 서로 다른 실패를 막는 방어다. 검증을 공유할 수는 있어도 항목을 줄일 근거는 없다.
- 미리보기 draft와 저장된 송출 레이아웃: 사용자가 저장하기 전 송출을 바꾸지 않는 제품 규칙. draft를 없애지 않는다.
- 동기 DB helper 자체는 SQL/연결/스키마 책임이 있다. 한 구현뿐이라는 이유로 class를 없애지 않는다.
- bible/monitor의 await 없는 async handler는 스케줄링 검토 후보이나, 현재 지연 원인을 입증하지 않았다. threadpool 전환은 실행 모델 변화이고 코드를 줄이는 효과도 작다. 별도 응답시간 증거 없이 일괄 변환하지 않는다.
- 차가운 모듈·작은 helper를 일괄 인라인하거나 JS 모듈을 다시 큰 파일로 합치지 않는다.

### Escalations / Next

R2는 상태 소유권이 여러 UI 모듈과 저장·미리보기·송출을 가로지른다. 전체 rewrite가 아니라 해당 프로젝트 참조/dirty 계약의 한정된 설계와 실제 UI 회귀가 선행돼야 한다.

다음 실행 요청 예시: **“Karpathy로 docs/refactor-ledger.md의 R1을 적용하라. 저장 경로의 현재 동작을 먼저 검증하고 캡처·직렬화 중복만 제거하라. R2 버그 수정과 상태 구조 변경은 제외하라.”** 현재 보고서의 부분 기준선만으로 자동 적용하지 말고 R1 대상 기준선을 새로 확보해야 한다.
