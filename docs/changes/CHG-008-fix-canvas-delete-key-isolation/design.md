# Change Design: CHG-008-fix-canvas-delete-key-isolation

## 1. 기술적 해결 방안 (Technical Solution)

### 1.1 무대 모니터 모드 및 탭 분리 판별
- `window.subcastMonitorEditor && window.subcastMonitorEditor.isMonitorMode && window.subcastMonitorEditor.isMonitorMode()` 또는 `document.getElementById('panel-monitor')?.classList.contains('active')` 조건으로 무대 모니터 상태 감지.

### 1.2 `editor-init.js` `keydown` 이벤트 수정
```javascript
if (e.key === 'Delete') {
    const isMonitorMode = window.subcastMonitorEditor && window.subcastMonitorEditor.isMonitorMode && window.subcastMonitorEditor.isMonitorMode();
    const isMonitorTabActive = document.getElementById('panel-monitor')?.classList.contains('active');

    if (isMonitorMode || isMonitorTabActive) {
        if (activeObj || currentEditingElement) {
            deleteElement();
        }
        return; // 무대 모니터 모드에서는 슬라이드 삭제 로직으로 분기하지 않고 리턴
    }
    ...
}
```

### 1.3 `editor-clipboard.js` `deleteBtn.onclick` 이벤트 수정
- 삭제 버튼 클릭 시에도 무대 모니터 모드/탭인 경우에는 객체 삭제만 수행하며, 선택된 객체가 없는 경우 슬라이드 삭제로 진입하지 않도록 guard clause 작성.
