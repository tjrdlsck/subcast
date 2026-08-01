# Change Request: 무대 모니터 캔버스 다중 선택(ActiveSelection)시 좌표 겹침 버그 수정

- **Change ID**: `CHG-017-fix-monitor-multiselect-position`
- **Request Date**: 2026-08-01
- **Status**: APPROVED

## 1. 개요 및 배경
에디터 무대 모니터 탭에서 가이드 박스(🔴 CURRENT, 🔵 NEXT)나 커스텀 요소들을 두 개 이상 다중 선택(`ActiveSelection`)하여 이동 또는 변형할 때, 캔버스 상에서는 두 요소가 정상적으로 떨어져 보이지만 미리보기 팝업 및 모니터링 출력 페이지(`monitor.html`)에서는 두 요소의 좌표가 하나로 겹쳐서 인식되는 현상이 발생하고 있습니다.

## 2. 원인 분석
Fabric.js에서는 객체가 `ActiveSelection` (다중 선택 그룹)에 포함되면, 개별 객체의 `left`와 `top` 속성이 캔버스 절대 좌표에서 그룹 중심점 기준의 **상대 좌표(Relative Coordinate)**로 변환됩니다.
기존 `syncCanvasToMonitorSettings()` 및 직렬화 과정에서 `boxObj.left`와 `boxObj.top`을 직접 참조하여 읽음으로써, 다중 선택 중일 때 상대 좌표가 그대로 `monitorSettings`로 계산 및 전달되어 위치 겹침 현상이 일어났습니다.

## 3. 요구사항
1. 객체가 `ActiveSelection` 그룹에 속해있는지와 무관하게, 항상 캔버스 기준의 **절대 좌표(Absolute Canvas Position: left, top)** 및 절대 스케일/크기를 도출하는 헬퍼 메소드 구현.
2. `syncCanvasToMonitorSettings()` 및 커스텀 요소 직렬화 과정에서 헬퍼 메소드를 사용하여 다중 선택 이동/변형 중에도 미리보기와 모니터링 화면에 정확한 위치가 반영되도록 수정.

## 4. 성공 기준
- 🔴 CURRENT 및 🔵 NEXT 박스를 다중 선택하여 이동/크기조절 시 미리보기 및 모니터링 화면에서 겹치지 않고 실제 캔버스 위치와 100% 일치하게 반영됨.
- 다중 선택 해제 시에도 좌표 왜곡이 발생하지 않음.
