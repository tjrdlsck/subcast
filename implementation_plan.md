# Subcast 소프트웨어 분산 연동 및 하드웨어 시뮬레이션 구현 계획서

본 계획서는 `hardware_integration_guide.md`에 명시된 하드웨어 통신 배제 사유와 100% 소프트웨어 분산 연동 방식을 준수하여, Subcast 시스템의 크로마키 배경 토글 기능, 웹소켓 재연결(Reconnection) 페일세이프 설계, 그리고 해상도 및 스케일 최적화 기능을 현재 브랜치(`feat/#1`) 내에서 구현하기 위한 상세 개발 계획입니다.

---

## 1. 구현 목표 및 범위

1. **크로마키(Chroma Key) 대응용 배경 토글 기능 개발**
   - 송출 화면(`viewer.html`)에 투명 배경(`rgba(0,0,0,0)`)과 단순 하드웨어 크로마키용 녹색 배경(`#00FF00`)을 동적으로 토글하는 웹소켓 통신 설계 및 프론트엔드 연동.
2. **웹소켓 재연결 및 페일세이프(Fail-safe) 로직 강화**
   - 프론트엔드가 `onclose`를 감지하면 주기적으로 재연결을 시도하고, 연결 실패 중에는 방송 사고 방지를 위해 강제로 오버레이 화면을 투명화(Opacity 0)하고 캔버스를 클리어 처리.
3. **스케일 보정 및 해상도 최적화**
   - 창 크기가 달라져도 상대적 폰트 크기 및 도형 비율이 깨지지 않도록 Fabric.js의 `setZoom` 및 해상도 스케일 보정 공식을 적용.
4. **기존 테스트 검증 오류 수정 및 신규 기능 테스트 보강**
   - `tests/test_main.py` 파일의 기존 테스트 케이스 실패 원인(슬라이드 순서로 인한 검증 실패)을 수정하고 배경 토글에 대한 신규 테스트 추가.

---

## 2. 상세 구현 계획

### 2.1. 백엔드 데이터 모델 및 웹소켓 수정

* **`backend/schemas.py` 수정**
  - `SystemSettings` 클래스에 `backgroundMode` 필드(기본값 `"transparent"`)를 추가하여 크로마키 모드 상태를 영속적으로 관리합니다.
  ```python
  class SystemSettings(BaseModel):
      targetWidth: int = 1920
      targetHeight: int = 1080
      currentLiveSlideId: Optional[str] = None
      backgroundMode: str = "transparent"  # "transparent" | "chromakey"
  ```

* **`backend/main.py` 수정**
  - 웹소켓 라우터(`websocket_endpoint`)에 `SET_BACKGROUND_MODE` 메시지 타입을 추가합니다.
  - 설정을 변경하면 `save_project_data`로 데이터를 디스크에 저장하고, 연결된 모든 클라이언트에게 변경 사항을 브로드캐스트합니다.
  ```python
  elif msg_type == "SET_BACKGROUND_MODE":
      mode = message.get("mode", "transparent")
      if mode in ["transparent", "chromakey"]:
          manager.project_data.settings.backgroundMode = mode
          await save_project_data(manager.project_data)
          await manager.broadcast({
              "type": "SET_BACKGROUND_MODE",
              "mode": mode
          })
  ```

---

### 2.2. 프론트엔드 인터페이스 및 스타일링 수정

* **`frontend/css/viewer.css` 수정**
  - 크로마키 모드 시 배경을 완전 녹색으로 강제 전환할 수 있는 스타일 클래스를 추가합니다.
  ```css
  body.chromakey-mode {
      background-color: #00ff00 !important;
  }
  ```

* **`frontend/viewer.html` 수정**
  - **크로마키 처리**: `INITIAL_SYNC` 및 `SET_BACKGROUND_MODE` 패킷 수신 시 `backgroundMode` 값을 확인하여 `document.body.classList.toggle('chromakey-mode', mode === 'chromakey')`를 수행합니다.
  - **재연결 및 페일세이프**: `ws.onclose` 시 기존의 `system-disconnected` 추가뿐만 아니라, `canvas.clear()`를 명시적으로 호출하여 연결 해제 상태에서 화면에 이전 찌꺼기가 남아 송출되는 방송 사고를 물리적으로 차단합니다.
  - **스케일 보정**: 캔버스의 반응형 크기를 조정할 때, 캔버스 자체 크기를 `drawWidth`, `drawHeight`로 설정하되 모든 객체를 다시 생성할 때 `setZoom` 공식을 연동하여, 해상도에 맞춘 텍스트 스케일을 하드웨어 스케일과 동일하게 동기화합니다.
    - $S = \frac{\text{drawWidth}}{\text{targetWidth}}$
    - `canvas.setZoom(scale)`을 호출하고, 좌표 및 폰트 크기 계산 시 가상 해상도($1920 \times 1080$) 기준으로 absolute 렌더링하도록 갱신하여 폰트 찌그러짐을 해결합니다.

* **`frontend/presenter.html` 수정**
  - **배경 모드 제어 UI**: `OBS target 해상도 설정` 카드 부근에 `배경 모드 설정`을 추가합니다. 
    - `투명 오버레이 (OBS용)` 및 `녹색 크로마키 (수동 믹서용)` 라디오 버튼 또는 토글 스위치 생성.
  - **웹소켓 연동**: 버튼 전환 시 백엔드로 `SET_BACKGROUND_MODE` 패킷을 송신하도록 리스너를 바인딩합니다.
  - **동기화**: `INITIAL_SYNC` 패킷을 받으면 현재 설정된 `backgroundMode` 상태를 제어 UI에 반영합니다.

---

### 2.3. 테스트 및 품질 보증 계획

* **`tests/test_main.py` 수정 및 보강**
  1. `test_save_slide_with_shapes_and_styles` 테스트에서 `slides[0]`으로 순서 지정을 하던 단언(Assertion)을 슬라이드 ID인 `slide_1`을 직접 조회하여 가져오도록 로직을 수정하여 기존 테스트가 정상 통과하도록 수정합니다.
  2. 배경 모드 상태 제어 및 영속화가 올바르게 작동하는지 확인하는 `test_websocket_background_mode` 테스트 케이스를 신규 작성합니다.
     - `presenter`가 `SET_BACKGROUND_MODE`로 `chromakey`를 전송하면, 서버 설정이 바뀌고 브로드캐스트되는지 확인합니다.

---

## 3. 검증 및 배포 절차

1. **로컬 테스트 자동 검증**: `python -m pytest` 실행을 통한 백엔드 및 웹소켓 기능 전체 검증 (100% Pass 필수).
2. **정적 파일 검사**: HTML, CSS, JavaScript 문법 준수 여부 및 리사이즈 이벤트 버그 점검.
3. **Git 커밋 및 원격 저장소 푸시**:
   - 현재 브랜치 `feat/#1` 상에서 모든 수정을 커밋하고 원격 저장소로 `git push`를 수행합니다.
   - 커밋 메시지는 규칙을 준수하여 명확한 한국어 양식으로 작성합니다.

---
> [!IMPORTANT]
> 본 설계는 하드웨어 믹서 통신 장치 없이 소프트웨어 수준(FastAPI 및 WebSocket, Canvas Scale)에서 모든 연동을 수행하여 개발 복잡도를 최소화하면서 최고의 프레임 동기화를 이끌어내는 것을 핵심 전략으로 합니다.
