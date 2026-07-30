# 찬양 곡 분위기-현장 배경 라이브러리 연동 및 무작위 재생 시스템 수정 계획서 (보완 반영본)

## 1. 개요 및 핵심 목적 (Overview & Core Objective)

본 계획서는 에디터 및 프레젠터의 **현장 배경 라이브러리(Stage Background Library)**를 효율적으로 활용하고, 찬양 진행 시 예배 연출의 몰입감을 극대화하기 위해 작성되었습니다.

찬양 곡 등록 시 설정한 **곡의 분위기(Mood/Tag)**와 현장 배경 라이브러리의 **배경 분위기**를 상호 연동(Tag-based Weighted Matching)하여, 해당 찬양 곡이 송출될 때 자동으로 최적의 배경 영상이 **가중 무작위(Weighted Random) 선택되어 재생**되도록 시스템을 구축합니다. 또한, 동일 분위기의 찬양이 연속되더라도 직전과 동일한 배경이 나오지 않도록 **동적 연속 중복 방지(Dynamic Duplicate Suppression)** 알고리즘 및 **다단계 폴백(Multi-tier Fallback)**과 **부드러운 이중 비디오 크로스페이드(Seamless Dual-Video Crossfade)**를 적용합니다.

---

## 2. 주요 핵심 기능 및 시스템 아키텍처 (Key Features & Architecture)

```
 [찬양 곡 선택 / 송출 이벤트 (Presenter)]
             │
             ▼
 [곡 메타데이터 확인 (Mood Tags & Override BG)]
             │
 ┌───────────┴────────────────────────────────┐
 │ (Case 1) 수동 고정 배경(Override BG) 존재 여부  │
 └───────────┬────────────────────────────────┘
             ├─ [Yes] ──> 지정 배경 선택
             │
             └─ [No] ───> [분위기 태그 기반 매칭 엔진]
                                    │
                                    ▼
                         [배경 라이브러리 검색]
                                    │
                                    ▼
                   [가중치 매칭 점수 계산 (Jaccard/Overlap Score)]
                                    │
                                    ▼
                   [동적 이력 큐 필터링 (N_eff = max(0, min(N, M-1)))]
                                    │
                                    ▼
                   [다단계 폴백 메커니즘 (Fallback Cascade)]
                   (1차: 태그 매칭 -> 2차: 디폴트 BG -> 3차: 전체 무작위 -> 4차: Ambient)
                                    │
                                    ▼
                   [최종 배경 결정 (Single Source of Truth Broadcast)]
                                    │
                                    ▼
                 [뷰어 Dual-Video Seamless Crossfade (preloading & Dissolve)]
```

### 2.1 주요 기능 사양 및 보완 반영 사항

1. **태그 기반 동적 가중치 매칭 (Tag-based Weighted Matching)**
   * 찬양 곡 및 배경 라이브러리에 각각 1개 이상의 **분위기 태그(N:M Multi-tagging)** 지정 가능 (예: `#경배`, `#잔잔한`, `#빠른/기쁨`, `#웅장한`, `#절기/특별` 등).
   * 곡 태그 $A$와 배경 태그 $B$ 간의 교집합 크기 $\vert A \cap B \vert$ 및 유사도에 따라 우선순위 가중치를 산정하여 가중 무작위 추출(Weighted Random Selection) 수행.

2. **지능형 동적 중복 방지 알고리즘 (Smart Dynamic Duplicate Suppression)**
   * 최근 재생 이력 큐(History Queue, $N=3\sim 5$)를 적용하되, 일치하는 배경 후보 수 $M$이 이력 큐 크기 $N$보다 작거나 같은 경우($M \le N$) 후보군 고갈(Deadlock)을 방지하기 위해 실시간 동적 큐 크기 $N_{\text{effective}} = \max(0, \min(N, M - 1))$를 적용.

3. **다단계 안전 폴백 메커니즘 (Multi-tier Fallback Cascade)**
   * 1차: 태그 가중 매칭 후보 extraction
   * 2차: 1차 후보 부재 시 `is_default: true` 범용 배경 무작위 추출
   * 3차: 2차 후보 부재 시 전체 라이브러리 배경 중 무작위 추출
   * 4차: 3차 후보 부재 시 시스템 기본 모션 배경(Ambient Canvas) 전환

4. **단일 출처 방송 및 멀티 뷰어 동기화 (Single Source of Truth Broadcasting)**
   * 무작위 배경 선택 계산 주체를 프레젠터/서버로 일원화하여, 확정된 최종 `stageBackground` 객체만 뷰어(`viewer.html`)로 전송함으로써 멀티 뷰어 간 화면 불일치 방지.

5. **부드러운 이중 비디오 전환 연출 (Seamless Dual-Video Crossfade)**
   * 뷰어 내 2개의 Video Element (`stage-video-bg-1`, `stage-video-bg-2`)를 교대로 활용.
   * 네트워크 지연으로 인한 순간 검은 화면 방지를 위해 `canplaythrough` / `canplay` 이벤트 대기 후 0.5초~1초 디졸브(Dissolve) 애니메이션 교체.

---

## 3. 데이터 구조 및 Schema 변경안 (Data Schema Design)

### 3.1 찬양 곡/슬라이드 데이터 (`Slide` / `SongItem`)
```json
{
  "id": "slide_12345",
  "name": "은혜 아래 있네",
  "moods": ["잔잔한", "경배"],
  "overrideBgId": null,
  "elements": [...]
}
```

### 3.2 현장 배경 라이브러리 데이터 (`BackgroundItem`)
```json
{
  "id": "bg_98765",
  "name": "푸른 푸른 잔잔한 호수",
  "url": "/static/backgrounds/lake_01.mp4",
  "thumbnail": "/static/backgrounds/thumb_lake_01.jpg",
  "moods": ["잔잔한", "기도"],
  "isDefault": false,
  "createdAt": "2026-07-29T22:23:00Z"
}
```

---

## 4. UI/UX 구현 계획 (UI/UX Implementation Plan)

### 4.1 에디터 - 찬양 곡/슬라이드 속성 모달
* 분위기(Mood) 태그 선택 칩(Chip) 및 고정 배경 지정 드롭다운 제공.

### 4.2 에디터 - 현장 배경 탭 (Stage Background Library Tab)
* 등록된 각 배경 카드에 분위기 태그 레이블 및 편집/디폴트 설정 버튼 제공.
* 배경 라이브러리 상단 분위기 필터링 탭 추가.

### 4.3 프레젠터 및 뷰어 (Presenter & Stage Viewer)
* 프레젠터 송출 시 곡 분위기 태그 기반 배경 선택 후 뷰어로 확정된 `stageBackground` 전송.
* 뷰어는 Dual Video Crossfade로 부드러운 화면 전환.

---

## 5. 단계별 개발 로드맵 (Development Roadmap)

| 단계 | 작업 내용 | 검증 및 테스트 방법 |
| :--- | :--- | :--- |
| **Phase 1** | 백엔드 schema 및 데이터 구조 확장 (`moods`, `overrideBgId`, `isDefault` 지원) | `tests/test_mood_schema.py` |
| **Phase 2** | 현장 배경 탭 및 슬라이드 편집 모달 내 분위기 태그 UI 구현 | 에디터 화면 동작 검증 |
| **Phase 3** | 가중 무작위 추출 & 동적 History Queue 중복 방지 알고리즘 로직 작성 | `tests/test_random_matching.py` 코너케이스 시뮬레이션 |
| **Phase 4** | 프레젠터 단일 출처 결정 & 뷰어 Dual Video Crossfade 전환 처리 | 현장 뷰어 실시간 송출 테스트 |

---

## 6. 결론 및 향후 진행 방향

본 계획서를 바탕으로 구현하여 분위기에 맞는 최적의 현장 배경이 중복 없이 안정적으로 송출되는 예배 연출 환경을 완성합니다.

