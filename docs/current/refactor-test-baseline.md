# 리팩터링 전후 동작 검증

확인 날짜: 2026-10-05. 대상은 사용자가 선택한 리팩터링 1~5번이다. 아래에는 적용 후 결과와 프로그램 수정 전의 계약 테스트 기록을 함께 보관한다.

## 1~5번 적용 후 최종 검증, 2026-10-05

리팩토링은 완료했다. 추가 저장 순서/전환 테스트 3개와 backend 초기화/IO/복구 사례 4개를 더했다. 최종 결과는 **Python 전체 192 passed / Node 전체 64 passed**, exit 0이다. Python은 기존 multipart 경고 1건이 있다. 자세한 변경·검토는 `docs/refactor-ledger.md`의 최신 적용 기록을 참고한다.

```powershell
$env:APPDATA = 'C:/cli-develop/subcast/test_results/final-ref-app'
$env:SUBCAST_DATA_DIR = 'C:/cli-develop/subcast/test_results/final-ref-data'
$env:PYTHONDONTWRITEBYTECODE = '1'
New-Item -ItemType Directory -Force -Path $env:APPDATA,$env:SUBCAST_DATA_DIR | Out-Null
venv/Scripts/python.exe -m pytest tests/ --basetemp test_results/final-ref-tmp -p no:cacheprovider -q --tb=short
node --test tests/*.js
```

실제 브라우저 smoke는 `tests/browser/refactor_smoke.js`의 Playwright `async (page) => ...` 함수를 실행한다. Node test glob에 포함되지 않는다. `SUBCAST_DATA_DIR=test_results/browser-ref`를 지정한 uvicorn 서버를 `127.0.0.1:8817`에서 실행하고 Playwright run-code 도구에 파일을 전달했다. 실행할 때마다 격리 서버에 새 테스트 프로젝트를 만든다. 원본 사용자 데이터를 사용하는 서버에 실행하지 않는다.

변경 전후 동일한 8개 시나리오와 결과를 확인했다. 자동·수동 저장 실제 디스크 반영, 선택과 zoom, 실제 Fabric 송출 렌더, 현장 서식 분리, 모니터 설정 HTTP/storage/BroadcastChannel, preview 격리, 새로고침 데이터 복원이 포함된다. page error는 0이다. 다만 모니터 최초 DOM 스타일은 원래 다음 이벤트에 의해 반영되는 경우가 있어, reload 시에는 저장된 설정 상태의 복원을 확인한다. 이 기존 동작을 수정하거나 정상 동작으로 보증하지 않았다.

효율 테스트는 이전 HEAD 소스를 subprocess 메모리에서만 실행하면 정상 요청 초기화 3회와 태그 원본 읽기 2회를 탐지해 예상대로 실패한다. 현재 코드에서는 초기화 0회, 원본 읽기 1회로 통과한다. 초기화 삭제로 기본 profile/table 복구가 사라지지 않도록 실제 HTTP 계약도 추가했다. 전체 기능·빌드·설치·장시간 OBS 운용을 절대적으로 보증하는 검증은 아니다.

## 리팩토링 전 추가 검증 기록

| 대상 | 추가 테스트 | 검증 내용 |
|---|---|---|
| 1. 저장 절차 공통화 | test_editor_save_contracts.js, 22개 | 실제 에디터·직렬화·저장 함수, 저장 메시지/메타데이터/좌표, 선택·zoom 복원, 빈 슬라이드, 모니터 차단, 1초 debounce, 잠금·오프라인·전환 |
| 2. 미사용 요청 모델 삭제 | test_refactor_backend_contracts.py | OpenAPI의 dictionary 요청 계약, 실제 HTTP payload 전달, 부분 변경, 오류 응답과 실패 후 기존 데이터 보존 |
| 3. 모니터 DB 초기화 경계 변경 | 같은 Python 파일 | 신규·구버전 스키마, 기존 설정 보존, 초기화 반복의 안전성, 명시적 DB 경로 격리 |
| 4. 태그 조회 중복 IO 축소 | 같은 Python 파일 | legacy 발견과 등록, alias, 슬라이드·배경 중복 집계, 외부 변경 즉시 반영, 손상 프로젝트 건너뛰기 |
| 5. 설정 수신 공통 적용 | test_viewer_settings_contracts.js, 19개 | 실제 viewer 전체 파일과 이벤트 처리, WebSocket/BroadcastChannel/storage, 초기 저장값과 우선순위, 잘못된 JSON, 출력 객체·DOM 속성, preview/송출/현장 구분 |

Python 신규 파일은 9개 테스트다. 신규 합계는 **50개**, 관련 기존 테스트를 포함한 아래 명령의 최종 결과는 **Python 22 passed / Node 61 passed**, 모두 exit 0이다. Python에는 기존 python_multipart 관련 deprecation warning 1건이 있었다. 전체 테스트나 빌드 통과를 의미하지 않는다.

## 재실행

저장소 루트의 PowerShell에서 실행한다. 테스트 import 시 사용자 데이터 경로를 참조하므로 Python 환경변수 설정과 디렉터리 생성은 생략하지 않는다.

```powershell
$verifyRoot = 'C:/cli-develop/subcast/test_results/refcontracts'
New-Item -ItemType Directory -Path $verifyRoot -Force | Out-Null
$env:SUBCAST_DATA_DIR = $verifyRoot
$env:APPDATA = $verifyRoot
$env:PYTHONDONTWRITEBYTECODE = '1'
venv/Scripts/python.exe -m pytest tests/test_refactor_backend_contracts.py tests/test_monitor_repository.py tests/test_mood_matching.py -q --basetemp C:/cli-develop/subcast/test_results/refcontracts-tmp -p no:cacheprovider
node --test tests/test_editor_save_contracts.js tests/test_viewer_settings_contracts.js tests/test_viewer_stage_bg_transition.js tests/test_stage_bible_backdrop.js tests/test_monitor_blank_labels.js tests/test_praise_bg_js_matching.js tests/test_praise_lyrics_parser.js tests/test_bible_trailing_blank.js
```

Python HTTP 테스트는 이 실행 환경의 샌드박스에서 Windows asyncio event loop의 로컬 socketpair 초기화가 차단됐다. 격리 데이터 경로를 유지한 승인된 실행에서는 실제 ASGI HTTP 왕복을 포함해 통과했다. 테스트를 건너뛰거나 프로그램 코드를 바꿔 우회하지 않았다. 짧은 basetemp 경로를 사용해 Windows 경로 길이 문제도 피한다. pytest는 지정한 basetemp를 다시 만들므로 다른 데이터가 있는 경로를 지정하지 않는다.

## 해석과 한계

- 기존 구현을 Python으로 복제하거나 소스 문자열 존재만 확인하는 방식 대신 실제 프로그램 함수·라우터를 호출한다.
- Node의 DOM·Fabric·WebSocket·storage·타이머는 제한된 test double이다. 실제 브라우저 픽셀, 실시간 네트워크, 재연결·애니메이션은 검증하지 않는다.
- 선택한 출력 좌표·메타데이터·설정 필드·오류 계약은 유지 조건이다. 파일 읽기 두 번이나 요청마다 schema init 같은 제거 대상 내부 절차를 테스트의 고정 조건으로 삼지 않았다.
- 메모리에서만 autosave 지연을 1초에서 0으로 바꿨을 때 지연 테스트가 실패했다. monitor preview gate를 없앴을 때 실제 monitor와 mode=monitor의 2개 테스트가 실패했다. 이 실험은 소스 파일을 수정하지 않았다.
- 현재 수동 저장은 socket 단절에도 로컬 모델을 갱신하고 저장 완료를 표시한다. 자동 저장은 모델/dirty를 유지하고 오류를 표시한다. 두 동작을 무심코 통일하지 않도록 별도로 검증한다.
- boolean dirty를 function으로 검사하는 알려진 불일치도 현재 동작으로 명시했다. 이를 정상 동작의 보증으로 해석하지 않는다. 별도 버그 수정 시 해당 계약 테스트를 의도적으로 바꾸고 원하는 전환 저장 회귀를 추가해야 한다.
- 효율 개선 수치나 초기화 횟수 감소는 리팩터링 구현 후 별도 측정 대상이다. 현 테스트가 리팩터링 이후 전체 기능 유지까지 이미 증명하는 것은 아니다.

## Karpathy Diff Review

**Task:** 프로그램 변경 없이 리팩터링 1~5번의 부족한 기존 동작 검증을 보강한다.

**Change:** 신규 테스트 3개 파일, +764/-0줄. 이 기준선·검토 문서 1개 추가. 기존 미커밋 사용자 변경과 이전 감사 원장은 이번 작업의 변경이 아니다.

**Traceability:** 신규 파일별 1개 구간, 총 4/4 구간이 요청과 검증 기록에 연결된다. 신규 파일을 포함해 확인했다.

**Findings:** 0 (critical 0, warning 0, nit 0).

### Findings

요청 밖 프로그램 변경, 기존 테스트 약화, 불필요한 의존성·테스트 프레임워크 추가를 발견하지 못했다.

### What's clean

저장 22개·viewer 19개·백엔드 9개는 현재 실제 함수의 관찰 결과를 확인한다. 모든 DB/프로젝트 fixture는 격리되며 타이머는 결정적으로 실행한다. 실제 HTTP 검증을 유지했고 실행 제한의 원인과 검증 범위를 기록했다. `backend/`, `frontend/`, `run.py`, `build_all.py`의 diff는 비어 있었다.

### Proposed fixes

없음. 기존 사용자 변경은 보존했다. 리팩터링이나 발견된 버그 수정은 수행하지 않았다.
