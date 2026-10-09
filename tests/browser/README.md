# Subcast 실제 브라우저 회귀 검증

실제 앱 서버와 Edge를 실행해 클릭·입력·드래그·키보드 동작을 검사한다. 화면 표시뿐 아니라 저장 데이터와 여러 출력 화면을 비교한다.

## 최초 준비

프로젝트 루트에서 실행한다. Node.js 20 이상, Python 3.12, Microsoft Edge가 필요하다.

```powershell
python -m venv venv
venv/Scripts/python.exe -m pip install -r requirements.txt
npm ci --ignore-scripts
npm run test:browser:setup
```

기존 `venv`가 준비되어 있으면 Python 준비는 생략한다. 다른 Python 환경은 `$env:SUBCAST_TEST_PYTHON = '실제 Python 경로'`로 지정한다. Edge가 없다면 `npx playwright install msedge`를 실행한다.

준비 명령은 앱이 사용하는 Fabric.js 5.3.0을 시험 캐시에 받고 SHA-256을 확인한다. 앱 코드를 다른 라이브러리로 대체하지 않는다. 검증 중에는 Google Fonts CSS를 비워 외부 웹폰트 연결에 의존하지 않는다. 외부 글꼴의 정확한 시각 검증은 별도 대상이다.

## 실행

```powershell
# 브라우저 창을 보면서 순서대로 실행
npm run test:browser:visible

# 창 없이 실제 브라우저로 전체 실행
npm run test:browser

# 저장 관련 사례만 실행
npm run test:browser -- --grep SC-05

# 테스트 목록 확인
npm run test:browser -- --list

# 마지막 결과 보고서를 브라우저로 열기
npm run test:browser:report
```

서버/브라우저의 로컬 소켓 접속이 차단된 실행 샌드박스에서는 실행 권한이 필요하다. 준비 실패는 앱 회귀로 판정하지 않는다.

## 격리와 기록

- 테스트마다 고유 데이터 폴더·빈 사용자 DB·소량 시험 성경 DB·복사한 정적 파일·별도 로컬 서버를 사용한다. 다른 실행도 고유 폴더를 사용한다.
- 실제 AppData, 저장 프로젝트, 기존 서버, 실제 성경 DB를 사용하거나 초기화하지 않는다. 서버 재시작 검사만 같은 시험 데이터와 포트를 재사용한다.
- 시험 영상은 설치된 imageio-ffmpeg로 만든 2초 파란 MP4다. 성경 문구는 자체 시험 문구다.
- 기본 실행은 작업자 1개로 모든 파일을 순서대로 검사한다. 캔버스와 찬양 복사·붙여넣기가 OS 클립보드를 공유하므로 병렬 실행하지 않는다. 다른 앱이나 별도 테스트 실행의 클립보드 사용도 실행 중 피한다.
- 설치 실행 API는 시험 서버와 브라우저에서 차단한다. 자동 업데이트 조회는 UI 시험에서 새 버전 없음으로 고정한다. 실제 업데이트 성공 검증으로 집계하지 않는다.
- UI 조작에 앱 내부 함수를 직접 호출하지 않는다. `evaluate`는 캔버스·선택·저장 상태 등 읽기 검증에 사용한다. API 및 파일 준비는 테스트의 전제 조건을 만드는 용도다.
- 실패 테스트는 0이 아닌 종료 코드를 반환한다. 기본 자동 재시도는 없으며 실패를 통과로 바꾸거나 `skip` 처리하지 않는다.
- uncaught JavaScript 오류도 실패로 판정한다. 기대한 서버 오류/콘솔 오류는 진단 기록에 남겨 실패 주입과 구분한다.

결과는 `test_results/browser/runs/<실행 ID>/`에 보존된다. `last-run.json`이 마지막 실행 결과를 가리킨다.

- `report/index.html`: 실제 테스트 결과와 첨부 파일.
- `results.json`: 기계 판독 결과 및 종료 상태.
- `coverage.md`: 125개 명세와 실제 테스트 ID의 연결 및 미연결 항목.
- `artifacts/`: 실패 캡처·추적(trace.zip)·브라우저 진단·서버 로그·시험 저장 데이터.

단일 테스트가 여러 화면을 열면 실패 시 열린 화면별 캡처를 남긴다. 추적은 `npx playwright show-trace '실제 trace.zip 경로'`로 연다.

## 커버리지와 한계

[사용자 시나리오 명세](../../docs/current/user-scenario-test-spec.md)의 번호를 테스트 이름에 붙인다. 한 ID가 연결됐다는 것은 그 명세의 일부 흐름을 자동화했다는 뜻이며 모든 조건·변형을 검사했다는 뜻은 아니다. `coverage.md`의 미연결 항목은 검증 완료가 아니다.

프로젝트/편집, 찬양/성경/배경/태그, 송출/방송 레이아웃/모니터, 저장 실패/편집 잠금 등을 포함한다. 실제 설치·트레이·Windows 계정 이전·다중 디스플레이 위치·OBS 합성·BX-100 출력은 이 브라우저 묶음의 통과로 보장하지 않는다. 명세의 미확정 정책도 별도 확인이 필요하다.

`.github/workflows/ci.yml`은 기존 main/develop push 및 PR 조건에서 브라우저 작업을 추가 실행한다. `release.yml`은 태그 배포의 패키징 전에 같은 검증을 실행한다. 실패하면 해당 브라우저 작업 또는 패키징이 실패하고 증거를 7일 보존한다. 이 변경은 로컬 파일이며 아직 커밋·푸시하지 않았다. GitHub 실행 자체는 로컬 실행 결과로 검증했다고 주장하지 않는다.
