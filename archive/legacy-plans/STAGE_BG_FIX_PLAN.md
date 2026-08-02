# 현장 뷰어(Stage Viewer) 배경 연출 제어 및 레이아웃 수정 계획서

## 1. 개요 및 핵심 요구사항 (Overview & Key Requirement)

본 계획서는 현장 뷰어(`viewer.html?channel=stage`)의 레이아웃 오버플로우 문제 해결과 더불어, 방송 송출 중 **유튜브 중간 광고(Ad) 및 버퍼링으로 인한 방송 사고를 근본적으로 방지**하기 위해 **유튜브 동영상 서버 다운로드 및 로컬 오프라인 무한 루프 재생 방식**을 도입하기 위해 작성되었습니다.

---

## 2. 유튜브 다운로드 방식 도입 배경 및 기술적 이점 (Rationale & Technical Feasibility)

### 2.1 유튜브 IFrame 직접 임베드의 위험성 (Risks of Direct Embedding)
* **광고(Ad) 발생 위험**: 유튜브 자체 정책에 따라 중간 광고나 팝업이 노출되어 라이브 방송/현장 송출 중 치명적인 연출 사고 발생 가능.
* **네트워크 불안정성**: 현장 인터넷 속도 저하 시 버퍼링 및 저화질 전환 문제.

### 2.2 비디오 서버 다운로드 & 로컬 재생의 기술적 이점 (Benefits of Local Video Download)
1. **광고(Ad) 및 UI 요소 100% 차단**: 비디오 스트림 순수 리소스만 추출하므로 광고가 노출될 확률이 0%입니다.
2. **완벽한 Seamless 무한 루프**: HTML5 `<video loop muted autoplay>` 네이티브 엔진을 사용하여 끊김(Gap) 없는 0ms 무한 반복 재생 지원.
3. **오프라인 동작 보장**: 한번 다운로드된 배경 영상은 인터넷 연결이 끊겨도 현장 모니터에서 완벽하게 구동.

---

## 3. 백엔드 및 시스템 아키텍처 (System Architecture)

```
[Editor UI] 
    |-- (1) 유튜브 URL 입력 (https://www.youtube.com/watch?v=...)
    v
[FastAPI Backend API] 
    |-- (2) yt-dlp 라이브러리로 1080p MP4 다운로드 (data/backgrounds/video_id.mp4)
    |-- (3) 비디오 메타데이터 및 썸네일 생성
    v
[Project Background Library Data] 
    |-- (4) 로컬 비디오 URL (/static/backgrounds/video_id.mp4) 저장
    v
[Stage Viewer (channel=stage)] 
    |-- (5) HTML5 <video src="..." loop muted autoplay> 오프라인 고화질 렌더링
```

### 3.1 기술 사양 및 파이프라인
* **다운로더 파이프라인**: Python `yt-dlp` 엔진 기반 (1080p/720p H.264 MP4 포맷 최적화).
* **저장 위치**: `data/backgrounds/` 디렉터리에 비디오 및 썸네일 보관 (백엔드 세션 호환).
* **로컬 비디오 직접 업로드 지원**: 유튜브 링크 외에도 사용자가 보유한 `.mp4`, `.webm` 로컬 파일 직접 드래그앤드롭 지원.

---

## 4. UI/UX 확장 사양 (Editor UI/UX Specifications)

### 4.1 에디터 '동적 배경 라이브러리 제어 패널'

```
+-------------------------------------------------------------------------+
| [현장 모니터 배경 연출 (Stage Motion Background)]                       |
+-------------------------------------------------------------------------+
| ■ 유튜브/동영상 등록                                                    |
|  [ https://www.youtube.com/watch?v=XXXXXXX               ] [다운로드]   |
|  * 또는 로컬 비디오 파일(.mp4, .webm) 드롭                              |
|  [ 진행률: [=========================>          ] 70% 다운로드 중...  ] |
|                                                                         |
| ■ 저장된 배경 라이브러리 (Background Library)                          |
|  +-------------------+  +-------------------+  +-------------------+    |
|  | [Thumbnail 1]     |  | [Thumbnail 2]     |  | [Canvas Ambient]  |    |
|  | 웅장한 오로라.mp4 |  | 우주 비행.mp4     |  | 기본 파티클       |    |
|  | (로컬 저장 완료)  |  | (로컬 저장 완료)  |  |                   |    |
|  | [미리보기] [선택] |  | [미리보기] [선택] |  | [선택]            |    |
|  +-------------------+  +-------------------+  +-------------------+    |
|                                                                         |
| ■ 배경 세부 속성 제어                                                   |
|  밝기/투명도 (Dimmer): [-------------------o--------] 70%               |
|  블러 (Softness):      [-----o------------------] 2px                 |
|                                                                         |
|  [현장 모니터 즉시 송출 (Apply Live Stage BG)]                          |
+-------------------------------------------------------------------------+
```

---

## 5. 뷰어 레이아웃 오버플로우 픽스 (Stage Viewer Layout Fix)

```css
/* html, body 스크롤바 완전 차단 및 고정 */
html, body {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    overflow: hidden !important;
    position: fixed;
}

/* HTML5 비디오 배경 레이어 */
#stage-video-bg {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    object-fit: cover;
    z-index: 0;
    pointer-events: none;
}
```

---

## 6. 단계별 구현 로드맵 (Phased Implementation Roadmap)

### 📌 Step 1: 뷰어 레이아웃 픽스 (Stage Viewer Overflow Fix)
- [ ] `viewer.css` 및 `viewer.js` 오버플로우 요인 제거 및 `position: fixed` 레이어링 재설정.
- [ ] HTML5 `<video id="stage-video-bg">` 및 Canvas 레이어 구조화.

### 📌 Step 2: 백엔드 `yt-dlp` 비디오 다운로드 API 구현
- [ ] `requirements.txt`에 `yt-dlp` 추가.
- [ ] 백엔드(`backend/routers/`)에 `POST /api/backgrounds/download-youtube` 및 비디오 파일 저장 로직 개발.
- [ ] 로컬 비디오 업로드 API (`POST /api/backgrounds/upload`) 추가.

### 📌 Step 3: 에디터 다운로드 진행률 및 라이브러리 관리 UI 개발
- [ ] 유튜브 링크 입력폼 & 다운로드 프로그레스 바(Progress Bar) 개발.
- [ ] 저장된 동영상 썸네일 카드 목록 및 에디터 캔버스 미리보기(Preview) 구현.

### 📌 Step 4: 현장 뷰어(`viewer.js`) 로컬 비디오 무한 루프 연동
- [ ] HTML5 비디오 태그 네이티브 무한 루프(`autoplay loop muted`) 제어.
- [ ] 웹소켓 메시지(`SET_STAGE_BACKGROUND`) 수신 시 비디오 소스 실시간 교체.

### 📌 Step 5: 통합 검증 및 회귀 테스트
- [ ] 현장 뷰어 스크롤바 미발생 확인.
- [ ] 유튜브 다운로드 -> 저장 -> 현장 뷰어 무한 루프 실시간 송출 전체 워크플로우 검증.

---
* 문서 업데이트일: 2026-07-29
* 작성자: Antigravity AI Engine
