# Change Request: CHG-043-fix-editor-stage-bg-update-yt-status-error

## 1. Request Details
- **Change ID**: `CHG-043-fix-editor-stage-bg-update-yt-status-error`
- **Request Date**: 2026-08-06
- **Requester**: User
- **Status**: IN_PROGRESS

## 2. Problem Statement
에디터 페이지의 찬양 배경(현장 모니터 배경 연출) 탭에서 로컬 동영상 파일 업로드 시 `Uncaught (in promise) ReferenceError: updateYtStatus is not defined at handleLocalFileUpload (editor-stage-bg.js:870:9)` 오류가 발생함.
이로 인해 비디오 파일 업로드가 정상적으로 완료되지 않거나 상태 업데이트 도중 실행이 중단됨.

## 3. Objective & Scope
- **목표**: `editor-stage-bg.js` 내 `updateYtStatus` 함수 정의를 구현하여 `ReferenceError`를 해소하고, 파일 업로드 진행률 및 상태 메시지 출력이 정상 작동하도록 함.
- **Allowed Scope**:
  - `docs/project-state.md`
  - `docs/changes/current/*`
  - `frontend/js/modules/editor-stage-bg.js`
- **Protected Scope**:
  - `backend/`
  - `frontend/editor.html`
  - `tests/`

## 4. Proposed Solution Overview
- `updateYtStatus(message, color)` 헬퍼 함수를 `editor-stage-bg.js` 내부 스코프에 추가 작성함.
- 콘솔 출력과 함께 필요 시 업로드 버튼 주변 및 상태 엘리먼트가 존재할 때 텍스트를 업데이트하도록 안전하게 로직 구현.
