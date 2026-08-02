# Subcast 무대 모니터링 시스템 PRD (Product Requirement Document)

## 1. 개요 및 배경 (Overview & Context)

- **목적 (Goal):** 
  교회 예배 및 행사 진행 시 무대 위의 인도자, 설교자, 찬양팀이 다음 진행 순서 및 가사를 미리 파악할 수 있도록, 방송실에서 자유롭게 설정한 레이아웃을 기반으로 **현재 슬라이드(Current Slide)**와 **다음 슬라이드(Next Slide)**를 실시간 동기화하여 시각화하는 **무대 전용 모니터링(Stage Confidence Monitor)** 시스템을 구축하는 것입니다.

- **해결하려는 문제 (Problem Statement):** 
  1. 기존 방식은 메인 자막 송출 화면만 그대로 복제(Mirroring)하여 제공되므로, 무대 위 사용자가 다음 찬양 가사나 설교 대지를 사전에 준비하기 어렵습니다.
  2. 방송실 에디터의 해상도 비율(16:9 기준, $1920 \times 1080$)과 무대 모니터 디스플레이의 해상도/비율이 다를 경우, 레이아웃이나 폰트 크기가 일그러지는 현상이 발생합니다.
  3. 방송실 조정관이 원하는 정보 배치(현재 슬라이드 크기, 다음 슬라이드 배치, 배경 투명화 및 폰트 스타일)를 커스텀 저장하고 유지할 수 있는 독립적 레이아웃 제어 시스템이 부재합니다.

- **주요 대상 사용자 (Target Audience):** 
  - **방송실 엔지니어 (Broadcasting Operator):** 모니터 화면의 카드를 원하는 위치/크기로 배치하고 정교하게 디자인하는 조종자.
  - **무대 인도자 / 설교자 / 찬양팀 (Stage Presenters):** 쾌적한 가독성으로 현재 슬라이드와 다음 슬라이드 흐름을 실시간 확인해야 하는 수신자.

---

## 2. 핵심 기능 및 사용자 시나리오 (User Stories)

### **User Story 1:** 
**방송실 엔지니어**로서, 나는 무대 환경과 모니터 해상도에 맞춰 모니터링 화면의 배치와 텍스트 스타일을 설정하기 위해, **모니터 전용 캔버스 에디터에서 '현재 슬라이드' 및 '다음 슬라이드' 텍스트 박스의 위치·크기·폰트·투명도를 자유롭게 조정하는 기능**을 원한다.

- **세부 요구사항:**
  1. **해상도 비례 스케일링 (Resolution-Independent Scaling):** 기존 자막 에디터의 베이스 해상도($1920 \times 1080$) 및 캔버스 비율 기준을 참조하여, 캔버스상 좌표($(x, y)$) 및 크기($(w, h)$)를 **상대 비율 좌표계(Percentage Coordinates)**인 $X_{\%}, Y_{\%}, W_{\%}, H_{\%}$로 자동 변환 저장해야 한다.
     $$ X_{\%} = \left( \frac{\text{left}}{W_{\text{base}}} \right) \times 100, \quad Y_{\%} = \left( \frac{\text{top}}{H_{\text{base}}} \right) \times 100 $$
  2. **독립적 모니터 디자인 상태 (Isolated State):** 슬라이드 클릭 및 원본 데이터(`projectData.slides`)에 전혀 영향을 주지 않는 독립된 `subcast_monitor_settings` 로컬 저장소를 유지해야 한다.
  3. **텍스트 박스 스타일링:** 🔴 CURRENT(현재 슬라이드) 및 🔵 NEXT(다음 슬라이드) 텍스트 박스별로 폰트 크기($fontSize$), 텍스트 색상, 배경색 및 투명화(Transparent Background) 여부를 개별 설정할 수 있어야 한다.

### **User Story 2:** 
**무대 인도자**로서, 나는 설교나 찬양 진행 중 자연스럽게 다음 흐름을 미리 대비하기 위해, **방송실에서 슬라이드를 전환할 때 무대 모니터 페이지(`viewer.html?mode=monitor`)에서 지정된 양식을 유지한 채 현재 내용과 다음 내용이 실시간으로 갱신되는 기능**을 원한다.

- **세부 요구사항:**
  1. **실시간 분산 동기화 (Real-time Distributed Sync):** 방송실의 슬라이드 선택 변경 시 `BroadcastChannel API` 및 `LocalStorage Event`를 활용하여 지연 시간 50ms 미만으로 무대 모니터 화면을 갱신해야 한다.
  2. **자동 경계선 감지 (Boundary Handling):** 현재 슬라이드가 마지막 슬라이드인 경우, '다음 슬라이드' 영역에는 `[마지막 슬라이드입니다]` 또는 빈 화면을 안전하게 표시해야 한다.
  3. **반응형 렌더링 엔진 (Responsive Stage Engine):** 무대 모니터 화면 크기($W_{\text{screen}}, H_{\text{screen}}$)가 변경되더라도, 저장된 상대 비율 좌표를 복원하여 비례적으로 자동 리사이징 렌더링되어야 한다.
     $$ S_{\text{render}} = \text{round}\left( S_{\text{base}} \times \frac{W_{\text{screen}}}{W_{\text{base}}} \right) $$

---

## 3. 수락 조건 (Acceptance Criteria)

- [ ] 방송실 에디터의 모니터링 탭에서 🔴 CURRENT 상자와 🔵 NEXT 상자를 드래그하여 이동/리사이즈 후 저장 시, `subcast_monitor_settings` 로컬 스토리지에 정규화된 percentage 수치로 올바르게 업데이트되어야 함.
- [ ] 텍스트 박스의 글씨 크기(Font Size) 변경 및 배경 투명화 토글 옵션 적용 시 모니터 뷰어(`viewer.html?mode=monitor`)에 즉시 비례 반영되어야 함.
- [ ] 메인 슬라이드 인덱스($idx$)가 전환되었을 때 무대 모니터 화면의 CURRENT 영역에 $idx$ 내용이, NEXT 영역에 $idx + 1$ 내용이 지연 없이(초당 60fps 유지) 갱신되어야 함.
- [ ] 디스플레이 해상도가 FHD($1920 \times 1080$), QHD($2560 \times 1440$), 또는 기타 비율로 변경되어도 모니터링 레이아웃 텍스트 박스 비율과 폰트 크기가 깨지지 않고 비례 스케일링되어야 함.
- [ ] 무대 모니터 화면 렌더링 중 네트워크 끊김 또는 로컬 스토리지 데이터 누락 예외가 발생할 경우, 기존 default 레이아웃 템플릿(상하 2분할)으로 자동 복구(Fallback)되고 사용자 알림 코드가 작동해야 함.

---

## 4. 비기능적 요구사항 (Non-Functional Requirements)

- **성능 (Performance):** 
  - **초저지연 전달 (Ultra-Low Latency):** 방송실 슬라이드 전환 이벤트 발송 후 무대 모니터 화면 렌더링 완료까지의 지연 시간(Latency)은 $\le 50\text{ms}$를 준수해야 함.
  - **메모리 최적화:** 탭 전환 및 슬라이드 변경 시 기존 Fabric.js 캔버스 객체 및 이벤트 리스너를 완전히 해제(Garbage Collection)하여 메모리 누수를 방지해야 함.

- **보안 및 격리 (Security & Isolation):**
  - **설정 격리 (State Isolation):** 모니터링 레이아웃 설정이 메인 자막 데이터 템플릿 파일(`.subcast`)의 구조나 원본 자막 텍스트 데이터에 오염(Mutation)을 일으키지 않아야 함.

- **사용성/디자인 (UI/UX):**
  - **시인성 확보 (High Contrast UI):** 무대 조명 환경에서도 시각적 스트레스 없이 멀리서 볼 수 있도록 고대비(High Contrast) 폰트 패밀리 및 어두운 배경/투명 레이어 가이드라인을 제공해야 함.
  - **직관적 가이드:** 방송실 캔버스에서 🔴 CURRENT는 붉은색 가이드라인, 🔵 NEXT는 푸른색 가이드라인으로 명확히 구분 표시해야 함.

---

## 5. 범위 외 사항 (Out of Scope)

- 무대 모니터용 별도 웹소켓 중앙 미디어 서버 구축 (이번 버전에서는 브라우저 기반 초저지연 로컬 이벤터 프로토콜 `BroadcastChannel` 및 `LocalStorage` 통신 방식에 집중).
- 모니터 화면에서 역으로 방송실 슬라이드를 컨트롤하는 양방향 원격 제어(Inter-Control) 기능.
- 3개 이상의 다중 슬라이드 예고(예: CURRENT, NEXT, NEXT+1) 동시 표시 기능.

---

## 📚 참고자료 (Key References)

1. **W3C Web Storage API Specification**: [https://www.w3.org/TR/webstorage/](https://www.w3.org/TR/webstorage/)
2. **W3C Broadcast Channel API Specification**: [https://www.w3.org/TR/webchannel/](https://www.w3.org/TR/webchannel/)
3. **Fabric.js Object Scaling & Coordinate Normalization Guide**: [http://fabricjs.com/docs/fabric.Object.html](http://fabricjs.com/docs/fabric.Object.html)
