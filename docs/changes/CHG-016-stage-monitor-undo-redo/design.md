# Technical Design: CHG-016-stage-monitor-undo-redo

- **Change ID**: `CHG-016-stage-monitor-undo-redo`
- **Date**: 2026-08-01
- **Status**: APPROVED

## 1. 설계를 위한 현황 분석
- 현재 `editor-history.js`의 `saveStateToHistory()`에서는 `isMonitorMode`일 경우 작성을 건너뜁니다.
- 무대 모니터 모드(`editor-monitor.js`)는 `currentBox`, `nextBox`, `customElements` 등의 설정을 `monitorSettings` 객체 및 캔버스 객체로 유지하고 있습니다.
- 따라서 모니터 모드 전용 히스토리 스택(`monitorUndoStack`, `monitorRedoStack`)을 `editor-monitor.js`에 구축하고, 캔버스 수정 이벤트 발생 시 스냅샷을 저장하며, Undo/Redo 실행 시 캔버스 및 `monitorSettings` 상태를 복원하는 구조가 가장 안전하고 명확합니다.

## 2. 세부 설계 및 인터페이스

### 2.1 `editor-monitor.js` 히스토리 상태 관리
```javascript
let monitorUndoStack = [];
let monitorRedoStack = [];
let isMonitorUndoingRedoing = false;

function getMonitorStateSnapshot() {
    return JSON.stringify(monitorSettings);
}

function saveMonitorStateToHistory() {
    if (!isMonitorMode || isMonitorUndoingRedoing) return;
    syncCanvasToMonitorSettings();
    const snapshotStr = getMonitorStateSnapshot();
    if (monitorUndoStack.length > 0 && monitorUndoStack[monitorUndoStack.length - 1] === snapshotStr) {
        return;
    }
    monitorUndoStack.push(snapshotStr);
    monitorRedoStack = [];
}
```

### 2.2 Undo / Redo 적용 메소드 (`applyMonitorSnapshot`)
```javascript
function applyMonitorSnapshot(snapshotStr) {
    isMonitorUndoingRedoing = true;
    try {
        monitorSettings = JSON.parse(snapshotStr);
        // 가이드 박스(🔴 CURRENT / 🔵 NEXT) 및 커스텀 객체 캔버스 재배치
        rebuildMonitorCanvasFromSettings();
        updateInfoUI();
        broadcastMonitorPreviewSettings();
    } finally {
        isMonitorUndoingRedoing = false;
    }
}

function undoMonitor() {
    if (!isMonitorMode || monitorUndoStack.length <= 1) return;
    const currentSnap = monitorUndoStack.pop();
    monitorRedoStack.push(currentSnap);
    const prevSnap = monitorUndoStack[monitorUndoStack.length - 1];
    applyMonitorSnapshot(prevSnap);
}

function redoMonitor() {
    if (!isMonitorMode || monitorRedoStack.length === 0) return;
    const nextSnap = monitorRedoStack.pop();
    monitorUndoStack.push(nextSnap);
    applyMonitorSnapshot(nextSnap);
}
```

### 2.3 `editor-history.js` 연동
`undo()` 및 `redo()`에 모니터 모드 활성화 여부 체킹 분기 추가:
```javascript
function undo() {
    if (window.subcastMonitorEditor && window.subcastMonitorEditor.isMonitorMode && window.subcastMonitorEditor.isMonitorMode()) {
        if (typeof window.subcastMonitorEditor.undoMonitor === 'function') {
            window.subcastMonitorEditor.undoMonitor();
        }
        return;
    }
    // 기존 슬라이드 undo 로직
}

function redo() {
    if (window.subcastMonitorEditor && window.subcastMonitorEditor.isMonitorMode && window.subcastMonitorEditor.isMonitorMode()) {
        if (typeof window.subcastMonitorEditor.redoMonitor === 'function') {
            window.subcastMonitorEditor.redoMonitor();
        }
        return;
    }
    // 기존 슬라이드 redo 로직
}
```

### 2.4 공개 API (`window.subcastMonitorEditor`) 확장
- `undoMonitor`, `redoMonitor`, `saveMonitorStateToHistory` 포함.
