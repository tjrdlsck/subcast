# Design Document: CHG-019-fix-monitor-multiselect-position

## 1. 설계 목표 (Design Goals)
Fabric.js 다중 선택(`ActiveSelection`) 그룹 드래그 중에도 개별 무대 모니터 가이드 박스(`currentGuideBox`, `nextGuideBox`)의 정확한 캔버스 상 글로벌 절대 위치(Top-Left Left/Top) 및 크기를 도출하여 미리보기 동기화 겹침 버그를 완전 해결한다.

## 2. 세부 연산 설계 (Detailed Math & Logic Design)

### 기존 연산의 한계 (`getAbsoluteObjectBounds`)
```javascript
if (obj.group) {
    const rect = obj.getBoundingRect(true, true);
    return { left: rect.left, top: rect.top, ... };
}
```
- Fabric.js에서 `ActiveSelection` 이동 (`object:moving`) 도중 자식 객체의 `getBoundingRect()`는 그룹 전체 바운딩 박스나 갱신되지 않은 위치를 리턴함.

### 신규 개선 연산 설계 (`getAbsoluteObjectBounds`)
```javascript
function getAbsoluteObjectBounds(obj) {
    if (!obj) return { left: 0, top: 0, width: 0, height: 0, scaleX: 1, scaleY: 1 };

    if (obj.group) {
        // obj.group이 존재할 때, obj.calcTransformMatrix()를 통해 캔버스 글로벌 변환 행렬을 구함
        const matrix = obj.calcTransformMatrix();
        const options = (typeof fabric !== 'undefined' && fabric.util && fabric.util.qrDecompose) 
            ? fabric.util.qrDecompose(matrix) 
            : { scaleX: obj.scaleX || 1, scaleY: obj.scaleY || 1 };
        
        const scaleX = options.scaleX || 1;
        const scaleY = options.scaleY || 1;
        const width = obj.width * scaleX;
        const height = obj.height * scaleY;
        
        // matrix[4]는 캔버스 기준 글로벌 Center X, matrix[5]는 Center Y
        const centerX = matrix[4];
        const centerY = matrix[5];
        
        // 캔버스 기준 절대 Left, Top (Top-Left)
        const left = centerX - (width / 2);
        const top = centerY - (height / 2);

        return {
            left: left,
            top: top,
            width: width,
            height: height,
            scaleX: scaleX,
            scaleY: scaleY
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

- **핵심 수식 구동 원리**:
  1. `obj.calcTransformMatrix()`: 그룹 변환 행렬과 객체의 자식 변환 행렬을 행렬곱하여 캔버스 기준 최종 글로벌 트랜스폼 마트릭스 `M` 생성.
  2. `M[4]` = 캔버스 절대 Center X, `M[5]` = 캔버스 절대 Center Y.
  3. `width = obj.width * scaleX`, `height = obj.height * scaleY`.
  4. Top-Left `left = M[4] - (width / 2)`, `top = M[5] - (height / 2)`.
  5. 이를 통해 `ActiveSelection`으로 드래그 중인 임의의 순간에도 두 박스의 캔버스 절대 좌표가 서로 상이하고 정확하게 도출됨.
