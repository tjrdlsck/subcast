# 📋 [frontend/js/editor.js] 3차 모듈화 및 최종 리팩토링 수행 지침서 (Phase 3 - Final)

> 본 문서는 `REFACTOR_PROMPT_TEMPLATE.md` 표준 규격에 맞추어 작성된 **`frontend/js/editor.js` (남은 1,573 라인)** 3차 최종 분리 계획서입니다.  
> 2단계 실행 AI(Codex CLI, Claude Code, AGY CLI 등)가 본 지침서를 바탕으로 작업을 수행할 경우, **`editor.js`를 200 라인 미만의 완전한 최경량 진입점(Entrypoint)**으로 축소하고 바이브 코딩 최적화를 달성합니다.

---

## 🏗️ 3차 최종 분리 아키텍처 요약 (Architecture Overview Phase 3)

| 모듈 파일명 | 담당 기능 및 영역 | 주요 이관 함수 |
| :--- | :--- | :--- |
| **`frontend/js/modules/editor-slides.js`** | 슬라이드 목록 CRUD, 썸네일 자동 생성 및 편집 슬라이드 선택 | `renderSlides()`, `selectSlideForEdit()`, `saveSlideData()`, `addSlide()`, `autoGenerateThumbnail()` |
| **`frontend/js/modules/editor-ui.js`** | 좌측 탭 전환, 체크박스 이벤트, 커스텀 폰트 및 UI 인터랙션 | `switchLeftTab()`, `handleCheckboxClick()`, `addCustomFont()` |
| **`frontend/js/modules/editor-utils.js`** | 색상 포맷 변환(Hex, Opacity, RGBA) 공통 유틸리티 | `colorToHex()`, `colorToOpacity()`, `hexAndOpacityToRgba()` |
| **`frontend/js/modules/editor-init.js`** | DOMContentLoaded 이벤트 바인딩 및 메인 앱 초기화 루틴 | `initApp()`, `bindGlobalEvents()` |

---

## 📌 [모듈 1] 슬라이드 CRUD & 렌더링 모듈 지침서

### 1. 작업 개요 (Overview)
- 원본 파일 (Source): `frontend/js/editor.js`
- 신규 모듈 파일 (Destination): `frontend/js/modules/editor-slides.js`

### 2. 모듈 이관 대상 (Extraction Targets)
`editor.js`에서 다음 슬라이드 관련 함수군을 신규 모듈로 추출할 것:
1. `renderSlides()`
2. `selectSlideForEdit(slideId)`
3. `saveSlideData()`
4. `addSlide()`
5. `autoGenerateThumbnail(slide)`

### 3. 동반 이관 의존성 (Included Dependencies)
- Required Imports / External References: `projectData`, `activeSlideId`, `selectedSlideIds`, `canvas`
- Global Variables / Constants: `slideDOMList`
- Helper Functions: `loadSlideToCanvas()`, `setSlideDirty()`, `triggerAutoSave()`

### 4. 아키텍처 및 인터페이스 규칙 (Strict Rules)
1. **[인터페이스 유지]**: 슬라이드 선택 및 렌더링 함수의 서명과 매개변수를 엄격 보존할 것.
2. **[순환 참조 금지]**: `editor-slides.js` 내부에서 전역 상태(`projectData`, `activeSlideId`)를 안전하게 참조/갱신할 것.
3. **[코드 생략 금지]**: 생략 주석 없이 실행 가능한 Full Code로 작성할 것.

### 5. 실행 결과 검증 (Verification)
- 슬라이드 썸네일 리스트 렌더링, 클릭 시 캔버스 로드, 슬라이드 추가/삭제 동작 검증.

---

## 📌 [모듈 2] UI 인터랙션 & 폰트 모듈 지침서

### 1. 작업 개요 (Overview)
- 원본 파일 (Source): `frontend/js/editor.js`
- 신규 모듈 파일 (Destination): `frontend/js/modules/editor-ui.js`

### 2. 모듈 이관 대상 (Extraction Targets)
`editor.js`에서 다음 UI 바인딩 함수군을 신규 모듈로 추출할 것:
1. `switchLeftTab(tabId)`
2. `handleCheckboxClick(e)`
3. `addCustomFont(fontName, fontUrl)`

### 3. 동반 이관 의존성 (Included Dependencies)
- Required Imports / External References: DOM 패널 요소 (`#panel-slides`, `#panel-templates` 등), `@font-face` CSS 헬퍼
- Global Variables / Constants: `activeTabId`, `customFontsList`

### 4. 아키텍처 및 인터페이스 규칙 (Strict Rules)
1. **[인터페이스 유지]**: 탭 전환 및 커스텀 폰트 적용 함수 서명 보존.
2. **[코드 생략 금지]**: 실행 가능한 완전한 Full Code 작성.

### 5. 실행 결과 검증 (Verification)
- 좌측 탭(슬라이드, 템플릿, 성경, 찬양 등) 전환 및 폰트 파일 추가 동작 검증.

---

## 📌 [모듈 3] 공통 색상 유틸리티 모듈 지침서

### 1. 작업 개요 (Overview)
- 원본 파일 (Source): `frontend/js/editor.js`
- 신규 모듈 파일 (Destination): `frontend/js/modules/editor-utils.js`

### 2. 모듈 이관 대상 (Extraction Targets)
`editor.js`에서 다음 유틸리티 함수군을 신규 모듈로 추출할 것:
1. `colorToHex(color)`
2. `colorToOpacity(color)`
3. `hexAndOpacityToRgba(hex, opacity)`

### 3. 동반 이관 의존성 (Included Dependencies)
- Required Imports / External References: 순수 색상 파싱 정규식(RegEx)

### 4. 아키텍처 및 인터페이스 규칙 (Strict Rules)
1. **[인터페이스 유지]**: 색상 규격 변환 매개변수 및 16진수/RGBA 반환 포맷 보존.
2. **[독립성 보장]**: 부작용(Side-effect) 없는 Pure Utility Function으로 구성.
3. **[코드 생략 금지]**: Full Code 작성.

### 5. 실행 결과 검증 (Verification)
- Color Picker 변경 시 HEX 및 투명도(Opacity) 캔버스 적용 정상 동작 검증.

---

## 📌 [모듈 4] 메인 애플리케이션 초기화 모듈 지침서

### 1. 작업 개요 (Overview)
- 원본 파일 (Source): `frontend/js/editor.js`
- 신규 모듈 파일 (Destination): `frontend/js/modules/editor-init.js`

### 2. 모듈 이관 대상 (Extraction Targets)
`editor.js` 하단의 대형 초기화 로직 및 이벤트 등록 코드 추출:
1. `DOMContentLoaded` 이벤트 핸들러 블록
2. 전역 키보드 단축키(Shortcuts) 이벤트 바인딩
3. Window Resize 이벤트 리스너

### 3. 동반 이관 의존성 (Included Dependencies)
- Required Imports / External References: `initCanvas()`, `connectWebSocket()`, `renderSlides()`, `fitCanvasToScreen()`

### 4. 아키텍처 및 인터페이스 규칙 (Strict Rules)
1. **[독립성 보장]**: 모든 모듈이 HTML상에서 선(先) 로딩된 후 최종 초기화 실행.
2. **[코드 생략 금지]**: Full Code 작성.

### 5. 실행 결과 검증 (Verification)
- 페이지 첫 진입 시 캔버스 초기화, 템플릿/슬라이드 로드 및 단축키 정상 작동 검증.

---

## 🧪 6. 3차 최종 통합 후 스크립트 로딩 순서 (HTML Binding)

`frontend/editor.html` 내 최종 스크립트 로딩 순서:

```html
<!-- 0. 공통 유틸리티 (최우선 로딩) -->
<script src="js/modules/editor-utils.js"></script>

<!-- 1. 도메인 기능 모듈 (1차) -->
<script src="js/modules/editor-clipboard.js"></script>
<script src="js/modules/editor-bible.js"></script>
<script src="js/modules/editor-praise.js"></script>
<script src="js/modules/editor-stage-bg.js"></script>
<script src="js/modules/editor-monitor.js"></script>

<!-- 2. 코어 인프라 모듈 (2차) -->
<script src="js/modules/editor-canvas.js"></script>
<script src="js/modules/editor-history.js"></script>
<script src="js/modules/editor-sync.js"></script>
<script src="js/modules/editor-elements.js"></script>
<script src="js/modules/editor-template.js"></script>

<!-- 3. UI 및 CRUD/초기화 모듈 (3차) -->
<script src="js/modules/editor-slides.js"></script>
<script src="js/modules/editor-ui.js"></script>
<script src="js/modules/editor-init.js"></script>

<!-- ★ 메인 진입점 (200 라인 미만의 순수 전역 상태 선언 파일) -->
<script src="js/editor.js"></script>
```
