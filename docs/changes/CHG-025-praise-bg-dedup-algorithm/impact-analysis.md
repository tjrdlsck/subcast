# Impact Analysis: CHG-025-praise-bg-dedup-algorithm

## 1. Allowed Scope (수정 허용 범위)
- `frontend/js/modules/editor-praise.js`:
  - `matchStageBgForSong` 함수 파라미터 및 중복 필터링/폴백 알고리즘 개선
  - 찬양 슬라이드 템플릿 생성 및 일괄 추가 시 `usedBgIds` 집계 및 순차 차용 로직
- `tests/test_praise_bg_matching.py` (신규):
  - 찬양곡 분위기/태그 매칭 및 중복 방지 알고리즘 검증 유닛 테스트
- `docs/changes/CHG-025-praise-bg-dedup-algorithm/`: 변경 관리 문서
- `docs/project-state.md`: 프로젝트 상태 업데이트

## 2. Protected Scope (수정 불가/보호 범위)
- `backend/`: 백엔드 API 및 엔드포인트
- `frontend/editor.html`: UI 레이아웃 구조 (기존 ID 및 구조 변경 금지)
- `frontend/js/presenter.js`, `frontend/js/viewer.js`
- `frontend/js/modules/editor-canvas.js`, `frontend/js/modules/editor-bible.js`, `frontend/js/modules/editor-stage-bg.js`
- 기타 미지정 소스 파일

## 3. 회귀 위험도 분석 (Regression Risk)
- **수동 지정 배경 오버라이드 영향**: 찬양 배경 직접 지정 모달에서 수동으로 선택한 `overrideBgId`는 유지되어야 하며, 자동 할당 알고리즘 개선 시 수동 설정 기능에 영향을 주지 않아야 함.
- **배경 수 미달 상황**: 배경 라이브러리의 영상 개수가 곡 수보다 적을 때 무한 루프나 `undefined`/`null` 반환 오류가 발생하지 않도록 폴백 처리가 안전하게 작동해야 함.
