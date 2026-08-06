# Impact Analysis: CHG-037-fix-monitor-textbox-height-resizing

## 변경 개요

- **목적**: 모니터 에디터(`editor-monitor.js`)에서 텍스트 줄 수(1줄/빈 슬라이드 등)에 따라 Fabric.js `Textbox` 세로 높이가 자동 축소되어 `heightPct`가 쪼그라들거나 수동 세로 리사이즈가 원상복구되는 버그 해결.
- **주요 전략**: 가이드 박스 조작 시 텍스트박스 내부 `height` 수축과 무관하게 사용자가 지정한 `heightPct`를 독립적인 바운딩 영역(Bounding Box / Container Height)으로 관리하고 세로 스케일 수동 반영 및 최소 높이(minHeight) 보장.

## Scope 정의

### Allowed Scope (수정 허용 범위)
- `frontend/js/modules/editor-monitor.js` (가이드 박스 생성/조작/수직 리사이즈 핸들링 및 비율 계산 로직)
- `frontend/js/viewer.js` (뷰어 카드 영역 비율 렌더링 검증 및 조정을 위한 보조 확인)
- `tests/test_monitor_responsive_text_overflow.py` (또는 모니터 관련 신규/기존 테스트 파일)
- `docs/project-state.md` 및 `docs/changes/current/` 하위 작업 문서

### Protected Scope (수정 금지 범위)
- `backend/` 하위 백엔드 코드 (`monitor_repository.py`, `routers/monitor.py` 등 API 스키마/계약 유지)
- `frontend/js/modules/editor-canvas.js`, `editor-elements.js`, `editor-init.js` 등 메인 슬라이드 에디터 로직
- `run.py`, `build_all.py`, `requirements.txt`
- `.antigravity/rules.md`, `AGENTS.md`

## 시스템 영향 및 사이드 이펙트 분석

1. **기존 API 및 저장 구조 데이터 호환성**:
   - `currentBox` 및 `nextBox` 데이터 구조(`leftPct`, `topPct`, `widthPct`, `heightPct`, `fontSize` 등)는 기존 DB 스키마 및 REST API 계약을 100% 유지하므로 백엔드 마이그레이션이 불필요함.
2. **Fabric.js 캔버스 이벤트 동작**:
   - `handleGuideModified` 및 `updateBox` 함수에서 `scaleY` 조작 시 Fabric.js `Textbox` 높이 재계산 로직과의 충돌을 방지하고 `heightPct`를 유저가 원하는 크기로 올바르게 직렬화(Serialize).
3. **회귀 위험성**:
   - 메인 슬라이드 캔버스와 독립된 `isMonitorMode` 상태 내에서만 작동하도록 샌드박싱되어 일반 슬라이드 편집 로직에 영향을 주지 않음.

## 검증 계획

- 모니터 탭 진입 후 1줄 텍스트 상태에서 가이드 박스 세로 리사이즈 시 `heightPct`가 정상 증가 및 유지되는지 검증.
- 슬라이드를 전환하거나 재진입할 때 `heightPct`가 자동 수축(Shrink)되지 않는지 확인.
- `tests/` 하위 모니터 관련 테스트 수동/자동 실행을 통한 회귀 테스트 통과 확인.
