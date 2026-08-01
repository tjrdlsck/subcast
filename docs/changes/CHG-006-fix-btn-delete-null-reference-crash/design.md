# Technical Design: CHG-006-fix-btn-delete-null-reference-crash

## 1. 세부 수정 설계
1. **`editor-init.js`**:
   ```javascript
   const btnDelete = document.getElementById("btn-delete");
   if (btnDelete) btnDelete.onclick = deleteElement;
   ```
2. **`editor-canvas.js`**:
   ```javascript
   ['btn-layer-up', 'btn-layer-down', 'btn-layer-front', 'btn-layer-back', 'btn-delete'].forEach(id => {
       const el = document.getElementById(id);
       if (el) el.disabled = false;
   });
   ```
