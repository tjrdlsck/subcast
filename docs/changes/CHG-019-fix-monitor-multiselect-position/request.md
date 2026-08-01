# Change Request: CHG-019-fix-monitor-multiselect-position

## 1. 개요 (Overview)
- **Change ID**: `CHG-019-fix-monitor-multiselect-position`
- **요구사항**: 에디터 페이지의 무대 모니터 탭에서 캔버스의 텍스트 박스 2개(현재 자막/다음 자막 가이드 박스)를 다중 선택(`ActiveSelection`)하여 이동시킬 때, 미리보기(무대 모니터) 화면에서 두 박스가 동일한 위치에 겹쳐서 표시되는 현상을 해결.

## 2. 문제 현상 및 원인 분석 (Problem & Root Cause Analysis)
- **현상**:
  - 캔버스에서 텍스트 박스 2개를 드래그하여 다중 선택한 상태로 이동(`object:moving`)시키면 미리보기 화면에서 2개의 박스가 완전히 겹쳐서 보임.
  - 다중 선택을 해제하고 하나의 박스만 잡고 살짝 움직이면 다시 원래의 캔버스 위치대로 정상 분리되어 보임.
- **원인 분석**:
  1. Fabric.js에서 2개 이상의 객체를 다중 선택하면 `fabric.ActiveSelection` 그룹 객체가 생성되고 자식 객체의 `group` 속성에 그룹이 할당됨.
  2. 그룹 조작 중 자식 객체의 `left`, `top`은 그룹 중심 기준 상대 좌표(Relative Offset)로 변경되며 `originX`, `originY`가 `'center'`로 설정됨.
  3. 기존 `getAbsoluteObjectBounds(obj)` 함수에서는 `obj.group`이 있을 때 `obj.getBoundingRect(true, true)`를 호출함.
  4. Fabric.js의 `ActiveSelection` 이동(`object:moving`) 도중에는 자식 객체의 `getBoundingRect()`가 그룹 이동량을 실시간 개별 절대 좌표로 올바르게 환산하지 못하거나 동일한 그룹 바운딩 좌표/미갱신 캐시를 반환함.
  5. 이로 인해 `syncCanvasToMonitorSettings()`에서 `currentBox`와 `nextBox`의 위치 비율(`leftPct`, `topPct`)이 완전히 동일한 값으로 수집되어 미리보기 뷰어로 전달됨.
  6. 단일 선택으로 전환 시 `ActiveSelection`이 해제(destroy)되면서 각 객체의 `left`, `top`이 다시 캔버스 절대 좌표로 복원되고 `obj.group`이 `null`이 되므로 1개 이동 시 정상 작동하였던 것임.

## 3. 해결 방안 (Solution Approach)
- `editor-monitor.js`의 `getAbsoluteObjectBounds(obj)` 함수 내에서 `obj.group`이 존재할 때:
  - `obj.calcTransformMatrix()`로 구해지는 3x3 변환 행렬 `M`을 활용.
  - `M[4]` (`e`)는 캔버스 상에서의 객체 중심 **Center X**, `M[5]` (`f`)는 **Center Y** 절대 좌표임.
  - `M`을 decompose하여 스케일(`scaleX`, `scaleY`)을 추출하고 `width = obj.width * scaleX`, `height = obj.height * scaleY`를 구함.
  - 캔버스 절대 좌상단 좌표(Top-Left)를 `left = M[4] - (width / 2)`, `top = M[5] - (height / 2)` 수식으로 정밀 산출.
  - 다중 선택 드래그 중에도 개별 객체의 정확한 글로벌 절대 위치가 실시간으로 수집되어 미리보기 및 무대 모니터 뷰어에 겹침 없이 실시간 반영되도록 수정.
