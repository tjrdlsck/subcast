# Design Document: CHG-037 무대 모니터 가이드 박스 고정 더미 텍스트화 및 PiP 실시간 연동 UX 개선

## 1. 시스템 구조 및 디자인 흐름

```
[ 메인 에디터 캔버스 (editor-monitor.js) ]
  ├── 1. enterMonitorMode()
  │     ├── currentGuideBox: 표준 가이드 더미 텍스트 (DUMMY_CUR_TEXT)
  │     └── nextGuideBox: 표준 가이드 더미 텍스트 (DUMMY_NXT_TEXT)
  │
  ├── 2. handleGuideModified() / syncCanvasToMonitorSettings()
  │     └── 바운딩 박스 위치/크기/폰트 속성 업데이트
  │
  └── 3. broadcastMonitorPreviewSettings()
        └── BroadcastChannel('subcast_monitor_channel')을 통해
            위치, 크기, 폰트 레이아웃 스타일 설정 전달

[ 측면 PiP 미니 박스 (pip-monitor-iframe -> monitor.html?channel=preview) ]
  └── 수신된 레이아웃 설정(위치/크기/폰트) + 실제 선택된 슬라이드 텍스트 렌더링
```

## 2. 상세 세부 변경사항

### A. 더미 텍스트 및 가이드 박스 초기화 (`frontend/js/modules/editor-monitor.js`)
- `getInitialSlideTexts()`를 개선하거나 대체하여 무대 모니터 가이드 박스용 표준 문구 반환:
  - `curText`: `🔴 [현재 자막 영역]\n슬라이드 자막 텍스트 위치 및 영역 범위 가이드\n(드래그하여 크기를 조절하세요)`
  - `nextText`: `🔵 [다음 자막 영역]\n다음 슬라이드 자막 텍스트 위치 가이드`
- `currentGuideBox` 및 `nextGuideBox` 생성 시:
  - `minWidth: 150`, `minHeight: 50` 설정으로 핸들 조작 최저 보장.
  - 가이드 박스의 `isMonitorGuide: true` 유지.

### B. 레이아웃 속성만 브로드캐스트 동기화
- `syncCanvasToMonitorSettings()` 실행 시 텍스트 내용(`content`)을 동기화하는 것이 아니라 `leftPct`, `topPct`, `widthPct`, `heightPct`, `fontSize`, `textColor`, `textAlign` 등 **레이아웃 스타일 속성**만을 저장 및 전송.

### C. 실시간 PiP 연동 확인
- 캔버스 조작 시 `broadcastMonitorPreviewSettings()`가 `pip-monitor-iframe`로 전달되어 슬라이드의 실제 글자가 배치되어 보이는지 검증.
