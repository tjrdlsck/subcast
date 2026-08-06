# Design Specification: CHG-043-fix-editor-stage-bg-update-yt-status-error

## 1. Goal
`editor-stage-bg.js` 내 `handleLocalFileUpload` 함수에서 호출 중인 `updateYtStatus` 함수를 작성하여 `ReferenceError`를 방지하고 업로드 상태를 안전하게 나타냄.

## 2. Technical Design

### `updateYtStatus` 함수 설계
```javascript
function updateYtStatus(msg, color) {
    console.log(`[Stage BG Upload] ${msg}`);
    const statusEl = document.getElementById('stage-bg-upload-status');
    if (statusEl) {
        statusEl.textContent = msg;
        if (color) statusEl.style.color = color;
    }
}
```

### 위치
`editor-stage-bg.js` 내 `handleLocalFileUpload` 함수 직전에 `updateYtStatus` 선언.

## 3. Backward Compatibility & Side Effects
- 기존 백엔드 업로드 API(`/api/backgrounds/upload`) 인터페이스 변경 없음.
- 기존 배경 선택/불투명도/블러 등 타 연출 효과 조절 기능 영향 없음.
