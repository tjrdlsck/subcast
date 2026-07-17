# Subcast 코드베이스 분석 보고서

서브에이전트들과 교차 검증을 통해 `subcast` 프로젝트의 주요 코드베이스를 분석한 결과입니다. 잠재적 버그, 사용되지 않는 쓰레기 코드(Dead Code), 보안 및 성능 이슈를 카테고리별로 정리했습니다.

---

## 1. 백엔드 (Python) 분석 결과

### 🔴 버그 및 논리 오류 (Bugs)
- **[Critical]** `main.py` (`load_project`, `save_project` 등): 파일 경로(`file_path`)가 명시적으로 전달되지 않거나 `None`일 경우에 대한 예외 처리가 부족하여 런타임 오류(TypeError)가 발생할 우려가 있습니다.
- **[High]** `storage.py` (L45-74): `json` 파일을 읽고 쓸 때 쓰기 실패 시 데이터가 손실될 위험(atomic write 미구현)이 있습니다.
- **[High]** `main.py` (L705 등): 슬라이드 순서 변경(`UPDATE_SLIDE_ORDER`) 또는 대량 작업 시 빈 리스트가 전달될 경우에 대한 방어 로직이 부족합니다.
- **[Medium]** `main.py` (L510 주변): 자동 저장(Autosave) 타이머 및 비동기 처리 과정에서 여러 저장 요청이 겹칠 수 있는 동시성 문제(Race condition)가 발생할 가능성이 있습니다.

### ⚪ 사용되지 않는 코드 (Dead Code)
- **[Low]** `main.py` (L4): `import random` 모듈이 임포트되었으나, 전체 파일에서 실질적으로 사용되지 않고 있습니다. (고유 ID 생성 등에는 `uuid`가 사용되고 있음)
- **[Low]** `main.py` (L17): `from typing import Optional` 등이 임포트되었으나, 해당 스코프 내에서 일부 타이핑이 사용되지 않는 경우가 있습니다.
- **[Low]** `schemas.py`: 일부 레거시 스키마(예: 과거 버전의 성경 검색 결과 스키마 등)가 선언되어 있으나 `main.py`에서 적극적으로 참조되지 않는 경우가 존재합니다.

### 🔒 보안 문제 (Security)
- **[High]** `main.py` (초기화 부분): CORS 설정 시 `allow_origins=["*"]`와 같이 모든 도메인을 허용하고 있어, 운영 환경 배포 시 보안 취약점이 될 수 있습니다.
- **[Medium]** 파일 경로 처리: 로컬 폰트나 프로젝트 파일을 저장/로드할 때 경로 탐색(Path Traversal) 공격에 대한 철저한 입력값 검증이 부족할 수 있습니다.

### ⚡ 성능 문제 (Performance)
- **[Medium]** `main.py` (프로젝트 저장): 슬라이드가 많아질 경우, 전체 `ProjectData`를 매번 직렬화(JSON Dump)하여 저장하므로 디스크 I/O 오버헤드가 발생할 수 있습니다. 변경된 부분만 저장하거나, 데이터베이스(SQLite 등)로 이관하는 것을 고려해야 합니다.

---

## 2. 프론트엔드 (HTML/JS) 분석 결과

### 🔴 버그 및 논리 오류 (Bugs)
- **[Critical]** `editor.html` (슬라이드 렌더링): `updateSlidePreview` 등에서 선택된 슬라이드 객체가 `undefined`일 때 속성에 접근하려 하여 에러를 유발할 수 있는 방어 코드가 누락된 곳이 있습니다.
- **[High]** `editor.html` (이벤트 리스너): 팝업 모달(예: 템플릿 적용 모달 등)을 띄울 때 `addEventListener`가 중복으로 등록되어 클릭 이벤트가 여러 번 실행되는 메모리 누수 및 논리 오류 위험이 있습니다.
- **[High]** `presenter.html` / `viewer.html` (WebSocket): 연결 끊김 시 무한 루프로 재연결을 시도하거나, 이전 연결 객체를 명시적으로 해제하지 않아 메모리 누수가 발생할 수 있습니다.
- **[Medium]** `editor.html` (단축키 처리): 키보드 이벤트 핸들러(Backspace 등)가 `input`이나 `textarea` 뿐만 아니라 `contenteditable` 영역에서 타이핑할 때도 작동하여 글자가 지워지거나 슬라이드가 넘어가는 충돌이 발생할 수 있습니다.

### ⚪ 사용되지 않는 코드 (Dead Code)
- **[Low]** `editor.html` (L2478 등 다수): `listEl.innerHTML = "";` 와 같이 DOM을 비우는 코드들이 산재해 있으나, 일부는 렌더링 전에 불필요하게 여러 번 호출됩니다.
- **[Low]** `presenter.html` (L700 주변): 과거 버전의 전환 효과(`.old-transition-effect`) 등 사용되지 않는 CSS 클래스와 주석 처리된 레거시 함수들이 그대로 남아 있습니다.
- **[Low]** `viewer.html`: 주석 처리된 디버깅용 `console.log` 및 테스트 코드가 혼재되어 있습니다.

### 🔒 보안 문제 (Security)
- **[High]** `editor.html`: `innerHTML`을 사용하여 사용자 입력(가사, 제목 등)이나 템플릿 콘텐츠를 DOM에 직접 삽입하는 곳이 다수 발견되었습니다(L2501, L2982 등). 이는 잠재적인 XSS(크로스 사이트 스크립팅) 취약점입니다. 사용자 입력값은 `textContent`를 사용하거나 철저한 이스케이프(Escape) 처리가 필요합니다.

### ⚡ 성능 문제 (Performance)
- **[High]** `editor.html` / `presenter.html`: 슬라이드를 하나 변경할 때마다 전체 DOM 리스트를 다시 그리거나(전체 리렌더링), 무거운 Fabric.js 캔버스를 불필요하게 자주 `renderAll()` 하는 패턴이 있습니다. 대규모 슬라이드(100장 이상) 로드 시 브라우저가 버벅거릴(Freeze) 수 있습니다.
- **[Medium]** 이미지 리사이징: 이미지를 캔버스에 올릴 때 원본 이미지를 그대로 로드하여 메모리 사용량이 급증할 수 있습니다.

---

## 💡 요약 및 개선 권고 사항

1. **에러 핸들링 및 예외 처리 강화**: 백엔드의 `None` 참조 에러와 프론트엔드의 `undefined` 객체 접근 에러를 방지하기 위해 Null Check를 강화해야 합니다.
2. **XSS 방어 (프론트엔드)**: `innerHTML` 사용을 최소화하고, DOM API(`document.createElement`)나 안전한 이스케이프 함수를 사용하도록 리팩토링이 필요합니다.
3. **불필요한 코드 제거**: `import random` 등 안 쓰는 모듈과 주석 처리된 레거시 JS 함수를 정리하여 파일 크기를 줄이고 가독성을 높여야 합니다.
4. **상태 관리 및 리렌더링 최적화**: 캔버스 및 슬라이드 리스트 업데이트 시 '변경된 항목'만 업데이트(Virtual DOM 방식 유사) 하도록 최적화가 필요합니다.
