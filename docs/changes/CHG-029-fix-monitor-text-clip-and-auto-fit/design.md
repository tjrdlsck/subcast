# Change Design: CHG-029-fix-monitor-text-clip-and-auto-fit

## 1. 개요 (Overview)
한글 3단 조합 문자('밀', '빌', '읊' 등) 및 Descender 획이 타이트한 모니터 카드 상자 내부에서 절단되는 현상을 근본적으로 방지하기 위해 폰트 행간(Line-Height), 안심 하단 패딩(Padding Buffer), 그리고 Flexbox 수직 정렬 스타일을 완벽하게 재설계합니다.

## 2. 원인 및 세부 기술 설계 (Detailed Technical Specification)

### A. 기술적 원인 (Root Cause)
1. 부모 카드(`monitor-card`)가 `display: flex; align-items: center; justify-content: center;` 환경에서 `padding: 0;`으로 자식 요소를 감싸고 있음.
2. 자식 요소(`monitor-current-text`)에 `max-height: 100%`, `box-sizing: border-box`, `line-height: 1.4` 및 `display: -webkit-box`가 적용되어, Flex 수직 중앙 정렬 시 한글 받침 'ㄹ'의 Font Descender Bounding Box 하단 획 2~4px이 `overflow: hidden` 클리핑 상자 외곽으로 밀려나 잘림.

### B. 개선 설계 방안 (Solution Architecture)
1. **폰트 행간 및 버퍼 확장**:
   - `line-height: 1.5 !important` 적용으로 각 줄의 수직 공간 확보.
   - `padding-bottom: 8px !important` 및 `padding-top: 2px !important` 하단 안심 패딩 공간 제공.
   - `box-sizing: content-box` 또는 `max-height: calc(100% - 10px)`로 패딩이 글자 높이를 파먹지 않도록 보장.
2. **부모 카드 수직 중앙 정렬 및 여백 보정**:
   - 부모 카드(`monitor-card`)에 `padding: 4px 8px; box-sizing: border-box;`를 부여하여 카드 상하단 경계와 텍스트 사이의 안심 간격(Safety Clearance) 확보.
   - 텍스트 요소를 `margin: auto 0;`으로 설정하여 flexbox 내부에서 수직 위치가 정중앙에 자리하면서도 클리핑 상자에 절단되지 않도록 조율.

```css
/* viewer.css */
.monitor-card .monitor-card-text,
#monitor-current-text,
#monitor-next-text {
    display: -webkit-box !important;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    word-break: break-word !important;
    overflow-wrap: anywhere !important;
    max-height: calc(100% - 8px) !important;
    line-height: 1.5 !important;
    padding-top: 2px !important;
    padding-bottom: 8px !important;
    margin: auto 0 !important;
    box-sizing: content-box !important;
}
```
