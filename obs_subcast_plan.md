# [제품 기획 및 설계 명세서] OBS 실시간 자막/슬라이드 송출 시스템
## 제품명: Subcast (Python/FastAPI & Fabric.js 기반)
### [Ver 1.4 - 다중 마스터 실시간 협업 및 동시성 제어(Concurrency Control) 보강 버전]

본 설계서는 생방송(Live Broadcasting)의 특수성인 **돌발상황 대처 능력**과 **다중 기기 동시 제어(Multi-Master Control)** 환경을 지원하기 위한 동시성 제어 모델 및 데이터 정합성 보장 대책을 수록하고 있습니다.

---

## 1. 실시간 방송 돌발상황 및 협업 요구사항 분석 (Live Scenario Analysis)

### 1.1. 사용자 시나리오 및 예외 상황 정의

* **시나리오 A-1: 송출 중인 슬라이드 긴급 수정 (Live Slide Hot-fix)**
  * **상황**: 현재 화면에 나가고 있는 슬라이드에 오탈자가 발견되어 편집자(Editor)가 즉시 수정해야 함.
  * **처리**: 편집자가 저장하는 순간 송출 화면(OBS Viewer)에도 실시간으로 텍스트 및 레이아웃이 갱신되어 반영되어야 함.
* **시나리오 A-2: 비송출(대기 중인) 슬라이드 사전 수정 (Silent Slide Pre-edit)**
  * **상황**: 현재 송출 중인 슬라이드는 정상이나, 다음에 나올 슬라이드들의 내용을 미리 수정해야 함.
  * **처리**: 편집자가 이를 수정하고 저장하더라도 **송출 화면(OBS Viewer)에는 아무런 시각적 변화나 새로고침이 일어나지 않아야 함.** 수정된 내용은 조용히 DB에 저장되고 송출 담당자(Presenter)의 대기 덱에만 갱신되어야 함.
* **시나리오 A-3: 다중 마스터의 동시 슬라이드 제어 (Multi-Master Control Sync)**
  * **상황**: 서로 다른 공간에 있는 두 명의 운영자(진행자 A, 연출자 B)가 동시에 컨트롤러 웹사이트에 접속해 실시간으로 슬라이드를 넘기며 진행 상황을 싱크해야 함.
  * **처리**: 한 사람이 슬라이드를 넘기면 다른 사람의 화면도 실시간으로 동일한 슬라이드로 스크롤 및 동기화되며, 둘 다 동등한 제어권을 가짐.
* **시나리오 B: 네트워크 장애 시 강제 투명화 (Fail-Transparent on Disconnect)**
  * **상황**: 로컬 네트워크 불안정 또는 서버의 예기치 못한 종료로 인해 OBS 뷰어와 서버 간의 연결이 두절됨.
  * **위험**: 이전 자막 화면이 화면에 그대로 굳어버려(Frozen Overlay), 아래 송출 중인 실시간 카메라 영상의 주요 정보(인물의 얼굴 등)를 지속해서 가리게 됨.
  * **해결**: 연결 유실 감지 즉시, 뷰어 화면의 오버레이 요소를 강제로 완전 투명(Opacity 0) 상태로 페이드아웃하여 영상 송출의 정체성을 해치지 않도록 조치함.

---

## 2. 화면 기획 및 사용자 경험 (UX/UI) 상세 계획

### 2.1. 다중 역할(Multi-Role) 접속 모델
서버 접속 시 클라이언트의 성격에 따라 세 가지 세션 모드를 지정합니다.

```
                  +-----------------------------------+
                  |        Subcast Server             |
                  +-------------------+---------------+
                                      |
         +----------------------------+----------------------------+
         | (role: presenter)          | (role: editor)             | (role: viewer)
+--------v----------+        +--------v----------+        +--------v----------+
|  송출 제어기      |        |  실시간 편집기    |        |  OBS 브라우저 소스|
| - 단축키 동작     |        | - 개체 드래그 수정 |        | - 오버레이 자막   |
| - 템플릿 실시간넘김|        | - 비송출 슬라이드 |        | - 연결 유실 시    |
| - 현재 송출뷰 표시 |        |   백그라운드 수정  |        |   완전 투명화      |
+-------------------+        +-------------------+        +-------------------+
```

1. **송출 제어기 (Presenter/Operator)**: 슬라이드 전환(`Prev/Next`)과 현재 송출 상태를 직접 트리거하는 마스터 뷰.
2. **실시간 편집기 (Background Editor)**: 방송 흐름을 방해하지 않고 슬라이드를 개별 선택하여 내용을 추가, 삭제, 드래그 수정할 수 있는 독립형 에디터 뷰.
3. **OBS 뷰어 (Viewer)**: 조작 인터페이스 없이 완전 투명 배경으로 그래픽 결과물만 노출되는 송출 전용 뷰.

### 2.2. 비활성 슬라이드 수정 시 세부 처리 정책 (Silent Background Editing)

현재 송출 중이 아닌 대기 중인 슬라이드(비활성 슬라이드)를 수정하는 경우, 방송 흐름 방지와 정보의 일관성 유지를 위해 다음과 같은 **'격리 및 지연 렌더링(Isolated & Deferred Rendering)'** 라이프사이클을 준수합니다.

1. **아이디 불일치 판정 ($ID_{\text{live}} \neq ID_{\text{edit}}$)**:
   * 편집자가 편집을 시도하는 슬라이드가 현재 메인 서버에 설정된 송출 중 슬라이드 ID와 다른 경우, 편집자의 실시간 드래그 이벤트(x, y 좌표 변경 등)는 OBS 뷰어 세션으로 흘러가지 않도록 **서버 및 편집기단에서 이중 필터링**합니다.
2. **사전 저장 및 파일 시스템 갱신**:
   * 편집자가 변경 사항을 최종 검토하고 `[저장]`을 누르면 서버는 해당 슬라이드의 내부 JSON 속성을 업데이트하고 디스크에 비동기 저장합니다.
3. **제어기(Presenter) 화면 실시간 사전 갱신**:
   * 서버는 저장 완료 패킷을 진행자가 보는 송출 제어기 세션에만 선별 브로드캐스트합니다.
   * 진행자는 방송을 하며 다음으로 넘길 대기 슬라이드가 정상적으로 수정되었음을 **컨트롤러 화면의 대기 썸네일(Thumbnail)과 텍스트 미리보기**를 통해 인지합니다.
4. **송출 뷰어(Viewer) 렌더링 지연(Deferring)**:
   * OBS 송출 뷰어는 이 편집 과정 중 어떠한 플리커링(Flickering)이나 화면 리로드도 겪지 않고, 기존 `Slide 1` 화면을 무중단 상태로 계속 띄워둡니다.

---

### 2.3. 다중 마스터 동시성 제어 및 충돌 방지 설계 (Concurrency Control Design)

두 명이 서로 다른 PC에서 동시에 제어기로 접속했을 때의 혼란을 방지하기 위해 다음과 같은 세부 제어 정책을 구현합니다.

#### ① 송출 상태 실시간 피어 동기화 (Peer-to-Peer Control Sync)
* **마지막 입력 우선 규칙 (LWW: Last-Write-Wins)**:
  송출 제어 명령에 대해서는 복잡한 상호 배제(Mutex) 락을 두지 않고, 물리적으로 마지막에 도달한 요청 메시지를 최종 상태로 결정합니다.
* **화면 자동 스크롤 동기화**:
  A 제어기에서 `Next`를 눌러 4번 슬라이드로 넘어가면, B 제어기 브라우저에도 즉시 웹소켓 메시지가 도달하여 B 제어기 화면 상에서도 현재 활성 슬라이드 포커스가 4번 슬라이드로 자동 이동 및 스크롤(Auto-Scroll) 처리됩니다. 이를 통해 두 제어자는 완벽히 동일한 진행 상태를 공유합니다.

#### ② 슬라이드 편집 잠금 (Edit Locking System)
* **독점 편집권 확보**:
  에디터가 특정 슬라이드 편집 모드로 진입(예: 3번 슬라이드 클릭)하는 순간, 서버에 `LOCK_SLIDE` 이벤트를 송신합니다.
* **서버 중재 및 락 전파**:
  서버는 해당 슬라이드를 '편집 잠금' 상태로 지정하고, 연결된 다른 모든 에디터 세션에 알립니다.
* **타 사용자 제어 비활성**:
  알림을 받은 다른 에디터 화면에서는 3번 슬라이드 옆에 **🔒 [A님이 편집 중]** 문구와 함께 해당 슬라이드 편집 진입이 차단(Read-only)됩니다.
* **편집 락 해제 (Unlock)**:
  수정이 완료되어 `[저장]`을 누르거나, 편집 창을 닫거나, 웹소켓 연결이 해제되면 자동으로 `UNLOCK_SLIDE` 처리되어 다시 타 사용자가 편집할 수 있는 상태로 개방됩니다.

#### ③ 편집 작업 영역의 로컬 격리 (Isolated Local Workspace)
* 편집자가 편집을 시도할 때 화면 상에서 마우스 드래그로 요소를 움직이거나 글씨를 수정하는 모든 중간 과정은 **해당 브라우저의 로컬 메모리에만 유지**됩니다.
* 다른 에디터에게 실시간으로 마우스 드래그 좌표가 송신되어 화면이 덜덜 떨리는 현상을 방지하고, 최종 `[저장]` 버튼을 누르는 순간에만 전체 데이터 패킷이 서버로 전달되도록 격리합니다.

---

### 2.4. 장애 조치: 페일 트랜스페어런트 (Fail-Transparent)
* **연결 유실 감지**: OBS 뷰어의 자바스크립트는 웹소켓의 `onclose` 및 `onerror` 이벤트를 상시 리스닝합니다.
* **CSS 클래스 제어 기반 강제 페이드 아웃**:
  연결 차단 감지 즉시 `<body>` 또는 자막 컨테이너에 `.system-disconnected` 클래스를 삽입하여 화면 전체의 불투명도(Opacity)를 $0$으로 만듭니다.
  ```css
  /* viewer.css */
  #canvas-container {
    opacity: 1;
    transition: opacity 0.8s ease-in-out; /* 부드러운 사라짐 효과 */
  }
  body.system-disconnected #canvas-container {
    opacity: 0 !important; /* 연결 끊김 시 강제 투명화 */
    pointer-events: none;
  }
  ```

---

## 3. 백엔드 시스템 및 네트워크 설계 (Backend & Network Optimization)

### 3.1. 사용자 정의 송출 해상도 동적 보정 (Dynamic Resolution Calibration)
사용자가 원하는 해상도를 직접 지정하면, 백엔드 서버는 이를 시스템 설정 메타데이터에 등록하고 프런트엔드로 송신합니다.

* **동적 캔버스 해상도 조절 워크플로우**:
  1. 관리자 화면에서 송출 대상 해상도(예: $1920 \times 1080$, $1280 \times 720$, $3840 \times 2160$ 등)를 입력 또는 선택.
  2. 서버는 `settings.json`에 해당 해상도 값을 기록하고, 웹소켓 연결이 수립된 모든 송출용 뷰어에 해상도 동적 변경 이벤트(`UPDATE_RESOLUTION`)를 발송.
  3. OBS 브라우저 소스는 수신한 해상도 값($W_{\text{target}}, H_{\text{target}}$)에 맞추어 자신의 HTML5 캔버스 물리 크기를 동적으로 재조정(Resize)하고, 내부 조작 좌표 비율을 재계산(Recalibration).
  
  $$\text{Scale Ratio } S_x = \frac{W_{\text{current\_view}}}{W_{\text{target}}}, \quad S_y = \frac{H_{\text{current\_view}}}{H_{\text{target}}}$$

### 3.2. 웹소켓 세션 식별 및 무중단 상태 동기화
서버는 연결 요청의 쿼리 스트링(Query String)을 분석하여 각 클라이언트를 식별하고 그에 맞는 정책을 취합니다.
`ws://localhost:8000/ws?role=presenter` 형식으로 접속합니다.

* **서버 세션 모델**:
  ```python
  class ConnectionManager:
      def __init__(self):
          self.sessions: dict[str, list[WebSocket]] = {
              "presenter": [],
              "editor": [],
              "viewer": []
          }
          self.current_slide_index = 0
          self.locked_slides: dict[str, str] = {} # slide_id -> session_id (락 테이블)

      async def connect(self, websocket: WebSocket, role: str):
          await websocket.accept()
          if role in self.sessions:
              self.sessions[role].append(websocket)
              
      def disconnect(self, websocket: WebSocket, role: str):
          if role in self.sessions and websocket in self.sessions[role]:
              self.sessions[role].remove(websocket)
  ```

---

## 4. 데이터 스키마 설계 확장 (Extended Data Schema)

다중 접속 및 동적 해상도 설정을 수용하는 고도화된 설정 데이터를 설계합니다.

```json
{
  "settings": {
    "targetWidth": 1920,
    "targetHeight": 1080,
    "currentLiveSlideId": "slide_2"
  },
  "slides": [
    {
      "id": "slide_1",
      "name": "오프닝 타이틀",
      "elements": [
        {
          "id": "elem_1",
          "type": "text",
          "content": "생방송 시작 5분 전",
          "x": 20.0,
          "y": 45.0,
          "width": 60.0,
          "height": 10.0,
          "style": { "fontSize": "4vw", "fontColor": "#ffffff" }
        }
      ]
    },
    {
      "id": "slide_2",
      "name": "본방송 하단 자막",
      "elements": [
        {
          "id": "elem_2",
          "type": "text",
          "content": "홍길동 의원 / 현직 국회의원 인터뷰",
          "x": 10.0,
          "y": 80.0,
          "width": 80.0,
          "height": 12.0,
          "style": { "fontSize": "3vw", "fontColor": "#ffeb3b" }
        }
      ]
    }
  ]
}
```

---

## 5. 단계별 개발 로드맵 (Roadmap)

* **1단계: 동적 해상도 및 다중 역할 세션 백엔드 인프라 구현**
  - FastAPI에서 Query Parameter(`role`) 기반의 웹소켓 접속 격리 처리.
  - 해상도 설정 저장 및 전파 모듈 개발.
* **2단계: 동시성 제어 및 편집 잠금(Locking) 시스템 개발**
  - `LOCK_SLIDE` 및 `UNLOCK_SLIDE` 웹소켓 통신 인터랙션 구현.
  - 타 에디터 화면에 락 표시 및 편집 제어권 동적 제한 기능 연동.
* **3단계: 페일 트랜스페어런트(Fail-Transparent) 기능 구현**
  - 웹소켓 차단 감지 시 화면 투명화 트랜지션 처리 검증.
* **4단계: 종합 필드 테스트**
  - 1인 송출기, 1인 편집기, 1인 OBS 뷰어 등 최소 3개 세션을 동시 가동하여 실시간 무중단 자막 수정이 잘 일어나는지, 강제 연결 차단 시 안전하게 화면 투명화가 이루어지는지 통합 검증.

---

## 6. 공식 참고 자료 (References)
- [FastAPI WebSocket Handling with Query Parameters](https://fastapi.tiangolo.com/advanced/websockets/#query-parameters)
- [Fabric.js Canvas Resizing and Zooming](http://fabricjs.com/canvas-onload-eg)
- [MDN - WebSocket: close event](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/close_event)
