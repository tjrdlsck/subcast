# Technical Design: CHG-017-fix-monitor-multiselect-position

- **Change ID**: `CHG-017-fix-monitor-multiselect-position`
- **Date**: 2026-08-01
- **Status**: APPROVED

## 1. 문제 분석
Fabric.js에서는 multiple objects를 drag-selection할 경우 `fabric.ActiveSelection` 객체가 생성되어 각 자식 객체(`obj.group`)로 연결됩니다.
이때 `obj.left`와 `obj.top`은 ActiveSelection 그룹 중심점(Center) 기준의 상대 위치로 변경되므로, 기존처럼 `boxObj.left`, `boxObj.top`을 그대로 사용하면 캔버스 상의 실제 절대 좌표가 반영되지 않고 두 객체의 상대 좌표가 겹치게 됩니다.

## 2. 해결 설계

### 2.1 절대 좌표 추출 헬퍼 함수 (`getAbsoluteObjectBounds`)
Fabric.js의 `getBoundingRect(true, true)`와 `calcTransformMatrix()` decomposition을 조합하여 단일 선택 및 다중 선택 그룹 상태 모두에서 캔버스 상의 절대 `left`, `top`, `width`, `height`, `effectiveFontSize`를 추출합니다.

```javascript
function getAbsoluteObjectBounds(obj) {
    if (!obj) return { left: 0, top: 0, width: 0, height: 0, scaleX: 1, scaleY: 1 };
    
    // obj가 ActiveSelection (group) 내에 있을 때
    if (obj.group) {
        const matrix = obj.calcTransformMatrix();
        const options = fabric.util.qrDecompose(matrix);
        // 회전이 없는 무대 모니터 가이드박스/도형의 exact top-left 및 크기 구하기
        const rect = obj.getBoundingRect(true, true);
        return {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            scaleX: options.scaleX,
            scaleY: options.scaleY
        };
    }

    const actualW = obj.width * (obj.scaleX || 1);
    const actualH = obj.height * (obj.scaleY || 1);
    return {
        left: obj.left,
        top: obj.top,
        width: actualW,
        height: actualH,
        scaleX: obj.scaleX || 1,
        scaleY: obj.scaleY || 1
    };
}
```

### 2.2 `syncCanvasToMonitorSettings()` 수정
`updateBox`에서 `getAbsoluteObjectBounds(boxObj)`를 사용하여 절대 좌표 및 스케일된 크기를 도출:

```javascript
const updateBox = (boxObj, boxKey) => {
    if (!boxObj) return;
    const bounds = getAbsoluteObjectBounds(boxObj);

    let leftPct = clamp((bounds.left / BASE_W) * 100, 0, 95);
    let topPct = clamp((bounds.top / BASE_H) * 100, 0, 95);
    let widthPct = clamp((bounds.width / BASE_W) * 100, 5, 100 - leftPct);
    let heightPct = clamp((bounds.height / BASE_H) * 100, 5, 100 - topPct);

    const fillColor = typeof boxObj.fill === 'string' ? boxObj.fill : '#ffffff';
    const hexColor = colorToHex(fillColor);

    const baseFontSize = boxObj.fontSize || (boxKey === 'currentBox' ? 28 : 22);
    const effectiveFontSize = Math.round(baseFontSize * bounds.scaleY);

    monitorSettings[boxKey] = {
        ...monitorSettings[boxKey],
        leftPct: parseFloat(leftPct.toFixed(2)),
        topPct: parseFloat(topPct.toFixed(2)),
        widthPct: parseFloat(widthPct.toFixed(2)),
        heightPct: parseFloat(heightPct.toFixed(2)),
        fontSize: effectiveFontSize,
        textColor: hexColor,
        fontWeight: boxObj.fontWeight || (boxKey === 'currentBox' ? "bold" : "600"),
        fontFamily: boxObj.fontFamily || "Inter",
        textAlign: boxObj.textAlign || "center"
    };
};
```
