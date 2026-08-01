# Technical Design: CHG-004-editor-fontsize-and-minimize-fix

## 1. 세부 수정 설계
1. **`editor.css`**:
   ```css
   .right-inspector-panel.collapsed {
       display: none !important;
   }
   ```
2. **`editor-init.js`**:
   - `fontsize-editor` 이벤트 처리 시 `width` 고정 대입:
     ```javascript
     const curWidth = currentEditingElement.width * (currentEditingElement.scaleX || 1);
     currentEditingElement.set({
         fontSize: pxSize,
         scaleX: 1,
         scaleY: 1,
         width: curWidth
     });
     ```
   - minimize/restore 이벤트 핸들러:
     ```javascript
     btnMinimizeInspector.onclick = (e) => {
         e.stopPropagation();
         rightInspectorPanel.classList.add("collapsed");
         btnRestoreInspector.style.display = "flex";
     };
     btnRestoreInspector.onclick = (e) => {
         e.stopPropagation();
         rightInspectorPanel.classList.remove("collapsed");
         btnRestoreInspector.style.display = "none";
     };
     ```
