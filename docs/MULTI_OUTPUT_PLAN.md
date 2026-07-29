# 다중 디스플레이 송출 시스템(Multi-Display Output System) 구현 계획서

## 1. 개요 및 목적 (Overview & Objective)

본 계획서는 자막 송출 시스템 **Subcast**에 **다중 디스플레이 송출(Multi-Display Transmission)** 기능을 확장하기 위한 기술적 요구사항과 아키텍처 및 구현 단계를 정의합니다.

* **배경**: 방송 송출용(OBS Studio 등)과 현장 대형 모니터/프로젝터 송출용 디스플레이의 연출 요구사항이 상이함.
  * **OBS 방송용**: 크로마키 또는 투명 알파 채널 기반의 **자막 전용(Subtitle Only)** 출력.
  * **현장 모니터용**: 시각적 몰입감을 위한 **동적 비디오/애니메이션 배경(Motion Background) + 자막** 융합 출력.
* **목표**: 1인의 운용자(Operator)가 기존 에디터에서 단일 슬라이드 흐름을 제어하되, 수신 측(Viewer)의 채널 설정에 따라 각 디스플레이 환경에 최적화된 레이어(Layer)가 독립 렌더링되도록 구현.

---

## 2. 핵심 아키텍처: 글로벌 마스터 동기화 (Master-Channel Synchronization)

본 시스템은 **발행-구독(Publisher-Subscriber) 패러다임**을 바탕으로 한 **글로벌 마스터 동기화 모델**을 채택합니다.

```
                  +----------------------------------+
                  |    Editor (Master Publisher)     |
                  |  - Single Slide Navigation Control|
                  |  - Dual Live Preview Viewport    |
                  +-----------------+----------------+
                                    |
                         WebSocket Broadcast Payload
                                    |
           +------------------------+------------------------+
           |                                                 |
+----------v-----------------------+     +-------------------v-------------------+
| Viewer Channel A (OBS Output)    |     | Viewer Channel B (Stage Output)       |
| - URL: viewer.html?channel=obs   |     | - URL: viewer.html?channel=stage      |
| - Layer: Subtitle Layer Only     |     | - Layer: Motion BG + Subtitle Layer   |
| - Background: Transparent (Alpha)|     | - Background: MP4 Video / Loop Motion |
+----------------------------------+     +---------------------------------------+
```

### 핵심 이점 (Benefits)
1. **동기화 보장 (Strict Synchronization)**: 동일한 슬라이드 인덱스와 자막 상태를 실시간 공유하여 방송 사고(On-air Disruption) 방지.
2. **운용 용이성 (Operational Efficiency)**: 연출자가 채널별로 자막을 따로 넘길 필요 없이 기존 동선(Spacebar/방향키) 유지.
3. **레이어 분리 렌더링 (Decoupled Layer Rendering)**: 동일한 상태 데이터를 수신하지만 각 뷰어의 `channel` 파라미터에 따라 DOM/Canvas 렌더링 방식 차별화.

---

## 3. 채널 구분 및 URL 규격 (Channel & Query Specification)

뷰어(Viewer) 접속 시 URL 쿼리 파라미터를 통해 해당 디스플레이의 역할을 정의합니다.

| 채널 ID | 접속 URL 예시 | 렌더링 요소 (Rendering Elements) | 비고 |
| :--- | :--- | :--- | :--- |
| **OBS 채널** | `viewer.html?channel=obs` | - 자막 레이어 (Subtitle Layer)<br>- 배경: 완전 투명 (`background: transparent`) | OBS 브라우저 소스 연동 |
| **현장 모니터 채널**| `viewer.html?channel=stage` | - 자막 레이어 (Subtitle Layer)<br>- 움직이는 배경 레이어 (Motion Background Layer) | 무대 프로젝터 / LED 전광판 |
| **기본 채널** | `viewer.html` | - 기존 동작 유지 (하위 호환성 보장) | default |

---

## 4. 에디터 UI/UX 확장 사양 (Editor UI/UX Specifications)

단일 화면 중심의 에디터 UI를 다중 디스플레이 제어가 가능하도록 효율적으로 확장합니다.

```
+-----------------------------------------------------------------------------------+
| [Subcast Editor]  Preset: [기본 예배]  | State: ● ON AIR | Outputs: [OBS] [Stage] |
+------------------------------------+----------------------------------------------+
| [이중 실시간 모니터링 (Dual Preview)]| [채널 및 배경 제어 패널 (Control Panel)]    |
|                                    |                                              |
| +--------------------------------+ | ■ 현장 배경 설정 (Stage Motion BG)          |
| | OBS Preview (자막 전용)        | |  [ 드롭다운: 비디오 1 (우주 루프.mp4)  v ] |
| +--------------------------------+ |  재생 속도: [----o---] 1.0x                  |
| +--------------------------------+ |  투명도/블러: [---o----] 0.4                  |
| | Stage Preview (자막 + 비디오)  | |                                              |
| +--------------------------------+ | ■ 채널 레이어 토글 (Layer Toggles)           |
|                                    |  [v] OBS 자막 송출  [v] 현장 자막 송출       |
+------------------------------------+----------------------------------------------+
| [마스터 슬라이드 타임라인 (Master Slide Timeline Control)]                        |
|  +--------------+  +--------------+  +--------------+                             |
|  | [1] 찬양 가사 |  | [2] 찬양 가사 |  | [3] 성경 구절 |                             |
|  +--------------+  +--------------+  +--------------+                             |
+-----------------------------------------------------------------------------------+
```

### 1) 이중 모니터링 뷰포트 (Dual Live Preview Viewport)
* 에디터 좌측 상단에 **[OBS 송출 화면]**과 **[현장 모니터 화면]**의 캔버스 축소판을 실시간으로 렌더링.
* 연출자가 현장 화면의 배경 비디오와 OBS 투명 자막의 시각적 가독성을 동시에 확인 가능.

### 2) 채널 & 동적 배경 제어 패널 (Channel & Motion BG Controller)
* **움직이는 배경(Motion Background) 선택기**:
  * 비디오 루프 파일 (`.mp4`, `.webm`) 지정 기능.
  * CSS 기반 실시간 그라데이션 애니메이션(Shader/Canvas Loop) 제공.
* **배경 파라미터 조절**:
  * 재생 속도(Playback Speed), 밝기/어둡기(Dimmer/Opacity), 블러(Blur) 실시간 제어.

---

## 5. 데이터 구조 및 상태 관리 스키마 (State Management & Schema)

웹소켓(WebSocket)을 통해 전달되는 브로드캐스트 페이로드(Broadcast Payload) 스키마 예시입니다.

```json
{
  "type": "SLIDE_UPDATE",
  "timestamp": 1785315200000,
  "slide": {
    "id": "slide_102",
    "index": 3,
    "content": "이곳에 자막 내용이 들어갑니다.",
    "style": {
      "fontSize": "48px",
      "fontColor": "#FFFFFF"
    }
  },
  "outputs": {
    "obs": {
      "showSubtitle": true,
      "showBackground": false
    },
    "stage": {
      "showSubtitle": true,
      "showBackground": true,
      "background": {
        "type": "video",
        "src": "/assets/backgrounds/abstract_loop.mp4",
        "opacity": 0.5,
        "blur": "2px"
      }
    }
  }
}
```

---

## 6. 단계별 구현 로드맵 (Phased Implementation Roadmap)

### 📌 Phase 1: 상태 구조 설계 및 백엔드 이중화 준비
- [ ] 다중 채널 지원을 위한 `Broadcast Payload` 데이터 스키마 정립.
- [ ] WebSocket 메시지 브로드캐스팅 시 채널 설정 상태 포함 처리.

### 📌 Phase 2: 뷰어(Viewer) 멀티 채널 렌더링 엔진 구축
- [ ] `viewer.html` 내 URL 쿼리 파라미터(`channel=obs|stage`) 파싱 로직 추가.
- [ ] `stage` 채널용 비디오 루프 및 HTML5 Canvas/Video 기반 동적 배경 레이어 구현.
- [ ] `obs` 채널용 완전 투명(Alpha Channel) 렌더링 최적화.

### 📌 Phase 3: 에디터(Editor) UI 확장 및 이중 프리뷰 구현
- [ ] 에디터 내 `Dual Live Preview Viewport` 컴포넌트 추가.
- [ ] 동적 배경(Motion Background) 라이브러리 및 파라미터 조절 UI 패널 개발.

### 📌 Phase 4: 통합 테스트 및 검증 (Verification)
- [ ] OBS Studio 브라우저 소스 연동 테스트 (투명 자막 수신 확인).
- [ ] 현장 2차 모니터/프로젝터 연동 테스트 (비디오 재생 및 자막 동기화 확인).
- [ ] 1080p / 4K 환경에서의 비디오 리소스 메모리 점유율 및 프레임 드랍(FPS) 성능 최적화.

---
* 문서 작성일: 2026-07-29
* 작성자: Antigravity AI Engine
